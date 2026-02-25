import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PO_TRANSITIONS, assertTransition } from "../../policies/state-machines";
import { PERMISSIONS } from "../../types";
import { writeAudit } from "../../services/audit-service";
import { linkAttachments } from "../../services/attachment-link-service";
import { acquireIdempotency, saveIdempotencyResult } from "../../services/idempotency-service";
import { assertPeriodUnlocked } from "../../services/period-lock-service";
import { conflict, notFound, unprocessable } from "../../utils/api-error";
import { hashPayload } from "../../utils/hash";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const createPurchaseSchema = z.object({
  vendor_id: z.string().uuid(),
  eta_date: z.string().date(),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        ordered_qty: z.number().positive(),
        unit_price: z.number().nonnegative()
      })
    )
    .min(1)
});

const submitSchema = z.object({ note: z.string().max(500).optional() });
const approveSchema = z.object({ note: z.string().max(500).optional() });

const createReceiptSchema = z.object({
  purchase_id: z.string().uuid(),
  received_at: z.string().datetime(),
  items: z
    .array(
      z.object({
        purchase_item_id: z.string().uuid(),
        received_qty: z.number().nonnegative(),
        lot_no: z.string().max(60).optional(),
        expiry_date: z.string().date().optional(),
        price: z.number().nonnegative().optional(),
        variance_reason: z.string().max(500).optional()
      })
    )
    .min(1),
  attachments: z.array(z.object({ attachment_id: z.string().uuid() })).min(1)
});

function buildPoNo(sppgId: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toISOString().slice(11, 19).replaceAll(":", "");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `PO-${sppgId.slice(0, 8).toUpperCase()}-${date}${time}-${rand}`;
}

function buildGrnNo(sppgId: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toISOString().slice(11, 19).replaceAll(":", "");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `GRN-${sppgId.slice(0, 8).toUpperCase()}-${date}${time}-${rand}`;
}

async function nextMoveNo(client: { query: typeof query }, sppgId: string): Promise<number> {
  const moveResult = await client.query<{ next_move: string }>(
    "SELECT COALESCE(MAX(move_no), 0) + 1 AS next_move FROM stock_moves WHERE sppg_id = $1",
    [sppgId]
  );
  return Number(moveResult.rows[0]?.next_move ?? 1);
}

export async function procurementRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/purchases",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PROCUREMENT_WRITE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: { created_at: "created_at", eta_date: "eta_date", po_no: "po_no", status: "status" },
        fallback: "created_at DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk purchases");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM purchases
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR eta_date >= $3::date)
            AND ($4::date IS NULL OR eta_date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, po_no, vendor_id, eta_date, status, approved_by, approved_at, created_at
          FROM purchases
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR eta_date >= $3::date)
            AND ($4::date IS NULL OR eta_date <= $4::date)
          ORDER BY ${order.sql}
          LIMIT $5 OFFSET $6
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.get(
    "/receipts",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.RECEIPT_POST);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: { created_at: "created_at", received_at: "received_at", grn_no: "grn_no", status: "status" },
        fallback: "received_at DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk receipts");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM receipts
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR received_at::date >= $3::date)
            AND ($4::date IS NULL OR received_at::date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, grn_no, purchase_id, received_at, status, created_at
          FROM receipts
          WHERE sppg_id = $1
            AND ($2::text IS NULL OR status::text = UPPER($2))
            AND ($3::date IS NULL OR received_at::date >= $3::date)
            AND ($4::date IS NULL OR received_at::date <= $4::date)
          ORDER BY ${order.sql}
          LIMIT $5 OFFSET $6
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.get(
    "/purchases/:id/items",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PROCUREMENT_WRITE);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);

      const items = await query(
        `
          SELECT pi.id, pi.item_id, pi.ordered_qty, pi.unit_price, ii.name AS item_name, ii.track_expiry
          FROM purchase_items pi
          JOIN inventory_items ii
            ON ii.id = pi.item_id
           AND ii.sppg_id = pi.sppg_id
          WHERE pi.purchase_id = $1
            AND pi.sppg_id = $2
          ORDER BY ii.name
        `,
        [params.id, sppgId]
      );

      return reply.send({ data: items.rows });
    }
  );

  app.post(
    "/purchases",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PROCUREMENT_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = createPurchaseSchema.parse(request.body);
      await assertPeriodUnlocked(sppgId, body.eta_date);

      const poId = randomUUID();
      const poNo = buildPoNo(sppgId);
      const totalAmount = body.items.reduce((sum, item) => sum + item.ordered_qty * item.unit_price, 0);

      await withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO purchases (
              id, sppg_id, po_no, vendor_id, eta_date, status, approved_by,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3, $4, $5::date, 'DRAFT', NULL,
              now(), $6, now(), $6
            )
          `,
          [poId, sppgId, poNo, body.vendor_id, body.eta_date, request.auth!.user_id]
        );

        for (const item of body.items) {
          await client.query(
            `
              INSERT INTO purchase_items (
                id, sppg_id, purchase_id, item_id, ordered_qty, unit_price,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5,
                now(), $6, now(), $6
              )
            `,
            [sppgId, poId, item.item_id, item.ordered_qty, item.unit_price, request.auth!.user_id]
          );
        }

        await writeAudit(
          {
            sppgId,
            entityTable: "purchases",
            entityId: poId,
            action: "CREATE",
            newValue: body,
            actorUserId: request.auth!.user_id,
            actorRole: request.auth!.roles.join(","),
            requestId: request.id,
            deviceId: request.deviceId,
            ip: request.ip,
            userAgent: request.headers["user-agent"]?.toString()
          },
          client
        );
      });

      return reply.status(201).send({
        id: poId,
        po_no: poNo,
        status: "DRAFT",
        total_amount: totalAmount
      });
    }
  );

  app.post(
    "/purchases/:id/submit",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PROCUREMENT_WRITE);
      const sppgId = requireActiveSppg(request);
      submitSchema.parse(request.body);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);

      const currentResult = await query<{ status: string; eta_date: string }>(
        "SELECT status, eta_date::text FROM purchases WHERE id = $1 AND sppg_id = $2 LIMIT 1",
        [params.id, sppgId]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw notFound("PO tidak ditemukan");
      }
      await assertPeriodUnlocked(sppgId, current.eta_date);

      assertTransition(current.status as keyof typeof PO_TRANSITIONS, "SUBMITTED", PO_TRANSITIONS, "PO");
      await query(
        "UPDATE purchases SET status = 'SUBMITTED', updated_at = now(), updated_by = $3 WHERE id = $1 AND sppg_id = $2",
        [params.id, sppgId, request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "purchases",
        entityId: params.id,
        action: "SUBMIT",
        oldValue: { status: current.status },
        newValue: { status: "SUBMITTED" },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: params.id, status: "SUBMITTED" });
    }
  );

  app.post(
    "/purchases/:id/approve",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.PROCUREMENT_APPROVE);
      const sppgId = requireActiveSppg(request);
      approveSchema.parse(request.body);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);

      const currentResult = await query<{ status: string; created_by: string | null; eta_date: string }>(
        "SELECT status, created_by, eta_date::text FROM purchases WHERE id = $1 AND sppg_id = $2 LIMIT 1",
        [params.id, sppgId]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw notFound("PO tidak ditemukan");
      }
      if (!request.auth!.is_super_admin && current.created_by === request.auth!.user_id) {
        throw conflict("SELF_APPROVAL_FORBIDDEN", "Pembuat PO tidak boleh approve sendiri");
      }
      await assertPeriodUnlocked(sppgId, current.eta_date);

      assertTransition(current.status as keyof typeof PO_TRANSITIONS, "APPROVED", PO_TRANSITIONS, "PO");

      await query(
        `
          UPDATE purchases
          SET status = 'APPROVED', approved_by = $3, approved_at = now(), updated_at = now(), updated_by = $3
          WHERE id = $1 AND sppg_id = $2
        `,
        [params.id, sppgId, request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "purchases",
        entityId: params.id,
        action: "APPROVE",
        oldValue: { status: current.status },
        newValue: { status: "APPROVED" },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: params.id, status: "APPROVED" });
    }
  );

  app.post(
    "/receipts",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.RECEIPT_POST);
      const sppgId = requireActiveSppg(request);
      const body = createReceiptSchema.parse(request.body);
      const key = request.headers["idempotency-key"]?.toString();
      if (!key) {
        throw unprocessable("Header Idempotency-Key wajib diisi");
      }
      await assertPeriodUnlocked(sppgId, new Date(body.received_at).toISOString().slice(0, 10));

      let replayResponse: { code: number; body: unknown } | null = null;
      let createdResponse: { id: string; status: string; stock_moves_created: number } | null = null;

      await withTransaction(async (client) => {
        const lock = await acquireIdempotency(client, {
          sppgId,
          endpoint: "POST:/receipts",
          key,
          requestHash: hashPayload(body)
        });

        if (lock.replay) {
          replayResponse = { code: lock.responseCode, body: lock.responseBody };
          return;
        }

        const purchaseResult = await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM purchases WHERE id = $1 AND sppg_id = $2 LIMIT 1 FOR UPDATE",
          [body.purchase_id, sppgId]
        );
        const purchase = purchaseResult.rows[0];
        if (!purchase) {
          throw notFound("PO tidak ditemukan");
        }
        if (!["APPROVED", "ISSUED", "PARTIALLY_RECEIVED"].includes(purchase.status)) {
          throw conflict("STATE_TRANSITION_INVALID", "PO belum siap menerima barang");
        }

        const receiptId = randomUUID();
        const grnNo = buildGrnNo(sppgId);
        await client.query(
          `
            INSERT INTO receipts (
              id, sppg_id, grn_no, purchase_id, received_at, status, idempotency_key,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3, $4, $5::timestamptz, 'POSTED', $6,
              now(), $7, now(), $7
            )
          `,
          [receiptId, sppgId, grnNo, body.purchase_id, body.received_at, key, request.auth!.user_id]
        );

        await linkAttachments(client, {
          sppgId,
          entityTable: "receipts",
          entityId: receiptId,
          attachmentIds: body.attachments.map((attachment) => attachment.attachment_id),
          actorUserId: request.auth!.user_id,
          attachmentRole: "INVOICE"
        });

        let stockMovesCreated = 0;
        for (const item of body.items) {
          const purchaseItem = await client.query<{
            id: string;
            item_id: string;
            ordered_qty: string;
            unit_price: string;
            track_expiry: boolean;
          }>(
            `
              SELECT
                pi.id,
                pi.item_id,
                pi.ordered_qty::text,
                pi.unit_price::text,
                ii.track_expiry
              FROM purchase_items pi
              JOIN inventory_items ii
                ON ii.id = pi.item_id
               AND ii.sppg_id = pi.sppg_id
              WHERE pi.id = $1
                AND pi.purchase_id = $2
                AND pi.sppg_id = $3
              LIMIT 1
            `,
            [item.purchase_item_id, body.purchase_id, sppgId]
          );

          const pi = purchaseItem.rows[0];
          if (!pi) {
            throw notFound("Purchase item tidak ditemukan");
          }

          if (pi.track_expiry && (!item.lot_no || !item.expiry_date)) {
            throw unprocessable("Item expiry wajib lot_no dan expiry_date", { purchase_item_id: item.purchase_item_id });
          }

          const orderedQty = Number(pi.ordered_qty);
          if (Math.abs(item.received_qty - orderedQty) > 0.0001 && !item.variance_reason) {
            throw unprocessable("Selisih qty wajib variance_reason", { purchase_item_id: item.purchase_item_id });
          }

          const receiptItemId = randomUUID();
          await client.query(
            `
              INSERT INTO receipt_items (
                id, sppg_id, receipt_id, purchase_item_id,
                received_qty, lot_no, expiry_date, price, variance_reason,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7::date, $8, $9,
                now(), $10, now(), $10
              )
            `,
            [
              receiptItemId,
              sppgId,
              receiptId,
              item.purchase_item_id,
              item.received_qty,
              item.lot_no ?? null,
              item.expiry_date ?? null,
              item.price ?? Number(pi.unit_price),
              item.variance_reason ?? null,
              request.auth!.user_id
            ]
          );

          let batchId: string | null = null;
          if (item.lot_no || item.expiry_date) {
            const batchResult = await client.query<{ id: string }>(
              `
                INSERT INTO inventory_batches (
                  id, sppg_id, item_id, lot_no, expiry_date, received_receipt_item_id, status,
                  created_at, created_by, updated_at, updated_by
                ) VALUES (
                  gen_random_uuid(), $1, $2, $3, $4::date, $5, 'ACTIVE',
                  now(), $6, now(), $6
                )
                ON CONFLICT (sppg_id, item_id, lot_no, expiry_date)
                DO UPDATE SET updated_at = now(), updated_by = EXCLUDED.updated_by
                RETURNING id
              `,
              [sppgId, pi.item_id, item.lot_no ?? "NOLOT", item.expiry_date ?? null, receiptItemId, request.auth!.user_id]
            );
            batchId = batchResult.rows[0]?.id ?? null;
          }

          const moveNo = await nextMoveNo(client, sppgId);
          await client.query(
            `
              INSERT INTO stock_moves (
                id, sppg_id, move_no, move_type,
                item_id, batch_id, qty, uom_id,
                ref_table, ref_id, reason_code,
                is_void, void_of_move_id,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, 'RECEIVE',
                $3, $4, $5, (SELECT unit_id FROM inventory_items WHERE id = $3 AND sppg_id = $1),
                'receipts', $6, COALESCE($7, 'RECEIVE_PO'),
                false, NULL,
                now(), $8, now(), $8
              )
            `,
            [sppgId, moveNo, pi.item_id, batchId, item.received_qty, receiptId, item.variance_reason, request.auth!.user_id]
          );

          stockMovesCreated += 1;
        }

        await client.query(
          `
            UPDATE purchases
            SET status = 'PARTIALLY_RECEIVED', updated_at = now(), updated_by = $3
            WHERE id = $1 AND sppg_id = $2
          `,
          [body.purchase_id, sppgId, request.auth!.user_id]
        );

        createdResponse = {
          id: receiptId,
          status: "POSTED",
          stock_moves_created: stockMovesCreated
        };

        await writeAudit(
          {
            sppgId,
            entityTable: "receipts",
            entityId: receiptId,
            action: "POST",
            newValue: body,
            actorUserId: request.auth!.user_id,
            actorRole: request.auth!.roles.join(","),
            requestId: request.id,
            deviceId: request.deviceId,
            ip: request.ip,
            userAgent: request.headers["user-agent"]?.toString()
          },
          client
        );

        await saveIdempotencyResult(client, {
          sppgId,
          endpoint: "POST:/receipts",
          key,
          responseCode: 201,
          responseBody: createdResponse
        });
      });

      const replay = replayResponse as { code: number; body: unknown } | null;
      if (replay !== null) {
        return reply.status(replay.code).send(replay.body);
      }

      return reply.status(201).send(createdResponse);
    }
  );
}
