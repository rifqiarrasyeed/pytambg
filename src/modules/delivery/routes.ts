import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { DELIVERY_TRANSITIONS, STOP_TRANSITIONS, assertTransition } from "../../policies/state-machines";
import { PERMISSIONS } from "../../types";
import { writeAudit } from "../../services/audit-service";
import { assertAttachmentsOwned, linkAttachments } from "../../services/attachment-link-service";
import { acquireIdempotency, saveIdempotencyResult } from "../../services/idempotency-service";
import { assertPeriodUnlocked } from "../../services/period-lock-service";
import { notFound, conflict, unprocessable, forbidden } from "../../utils/api-error";
import { hashPayload } from "../../utils/hash";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const createDeliverySchema = z.object({
  route_id: z.string().uuid(),
  driver_user_id: z.string().uuid(),
  vehicle_no: z.string().max(30).optional(),
  planned_departure: z.string().datetime(),
  production_run_id: z.string().uuid().optional()
});

const updateStatusSchema = z.object({
  status: z.enum(["LOADED", "IN_TRANSIT", "DELIVERED", "VERIFIED", "CLOSED"]),
  delivery_stop_id: z.string().uuid().optional()
});

const proofSchema = z.object({
  delivery_stop_id: z.string().uuid(),
  proof_type: z.enum(["PHOTO", "SIGNATURE", "QR"]),
  attachment_id: z.string().uuid(),
  captured_at: z.string().datetime(),
  geo: z
    .object({
      lat: z.number(),
      lng: z.number()
    })
    .optional()
});

const verifySchema = z.object({
  delivery_stop_id: z.string().uuid(),
  verified_portions: z.number().int().nonnegative(),
  result: z.enum(["MATCH", "MISMATCH"]),
  reason: z.string().max(500).optional(),
  attachments: z.array(z.object({ attachment_id: z.string().uuid() })).optional()
});

const createDisputeSchema = z.object({
  delivery_stop_id: z.string().uuid(),
  delta_portions: z.number().int(),
  reason: z.string().min(3).max(500),
  attachments: z.array(z.object({ attachment_id: z.string().uuid() })).min(1)
});

const resolveDisputeSchema = z.object({
  resolution: z.enum(["ACCEPT", "REJECT"]),
  notes: z.string().max(500).optional(),
  stock_action: z.enum(["NONE", "RETURN", "WASTE"]).default("NONE"),
  item_id: z.string().uuid().optional(),
  batch_id: z.string().uuid().optional(),
  qty: z.number().positive().optional(),
  reason_code: z.string().max(40).optional()
});

function buildManifestNo(sppgId: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toISOString().slice(11, 19).replaceAll(":", "");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `MNF-${sppgId.slice(0, 8).toUpperCase()}-${date}${time}-${rand}`;
}

function toDateOnly(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

async function assertDeliveryDateUnlocked(sppgId: string, deliveryId: string): Promise<void> {
  const result = await query<{ planned_departure: string }>(
    "SELECT planned_departure::text FROM deliveries WHERE id = $1 AND sppg_id = $2 LIMIT 1",
    [deliveryId, sppgId]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound("Delivery tidak ditemukan");
  }
  await assertPeriodUnlocked(sppgId, toDateOnly(row.planned_departure));
}

async function checkDriverScope(sppgId: string, deliveryId: string, userId: string): Promise<void> {
  const result = await query<{ driver_user_id: string }>(
    "SELECT driver_user_id FROM deliveries WHERE id = $1 AND sppg_id = $2 LIMIT 1",
    [deliveryId, sppgId]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound("Delivery tidak ditemukan");
  }
  if (row.driver_user_id !== userId) {
    throw forbidden("Driver tidak berhak pada manifest ini");
  }
}

async function recalcDeliveryStatus(client: { query: typeof query }, deliveryId: string, sppgId: string): Promise<void> {
  const pending = await client.query<{ cnt: string }>(
    `
      SELECT COUNT(*)::text AS cnt
      FROM delivery_stops
      WHERE delivery_id = $1 AND sppg_id = $2
        AND status NOT IN ('VERIFIED', 'LOCKED')
    `,
    [deliveryId, sppgId]
  );

  if (Number(pending.rows[0]?.cnt ?? 0) === 0) {
    await client.query(
      `
        UPDATE deliveries
        SET status = 'CLOSED', closed_at = now(), updated_at = now()
        WHERE id = $1 AND sppg_id = $2
      `,
      [deliveryId, sppgId]
    );
  }
}

export async function deliveryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/deliveries",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const isDriver = request.auth?.roles.includes("DRIVER") && !request.auth?.is_super_admin;
      if (isDriver) {
        requirePermission(request, PERMISSIONS.DELIVERY_UPDATE_STATUS);
      } else {
        requirePermission(request, PERMISSIONS.DELIVERY_MANAGE);
      }
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          planned_departure: "planned_departure",
          status: "status",
          manifest_no: "manifest_no",
          created_at: "created_at"
        },
        fallback: "planned_departure DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk deliveries");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM deliveries
          WHERE sppg_id = $1
            AND ($2::boolean = false OR driver_user_id = $3)
            AND ($4::text IS NULL OR status::text = UPPER($4))
            AND ($5::date IS NULL OR planned_departure::date >= $5::date)
            AND ($6::date IS NULL OR planned_departure::date <= $6::date)
        `,
        [sppgId, isDriver, request.auth!.user_id, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const result = await query(
        `
          SELECT id, manifest_no, route_id, driver_user_id, vehicle_no, status, planned_departure, closed_at
          FROM deliveries
          WHERE sppg_id = $1
            AND ($2::boolean = false OR driver_user_id = $3)
            AND ($4::text IS NULL OR status::text = UPPER($4))
            AND ($5::date IS NULL OR planned_departure::date >= $5::date)
            AND ($6::date IS NULL OR planned_departure::date <= $6::date)
          ORDER BY ${order.sql}
          LIMIT $7 OFFSET $8
        `,
        [
          sppgId,
          isDriver,
          request.auth!.user_id,
          list.status ?? null,
          list.date_from ?? null,
          list.date_to ?? null,
          list.page_size,
          list.offset
        ]
      );
      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.get(
    "/verification/stops",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DELIVERY_VERIFY);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          planned_departure: "d.planned_departure",
          stop_order: "ds.stop_order",
          status: "ds.status",
          manifest_no: "d.manifest_no"
        },
        fallback: "d.planned_departure DESC, ds.stop_order ASC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk verification/stops");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM delivery_stops ds
          JOIN deliveries d
            ON d.id = ds.delivery_id
           AND d.sppg_id = ds.sppg_id
          WHERE ds.sppg_id = $1
            AND ds.status IN ('DELIVERED', 'DISPUTED')
            AND ($4::text IS NULL OR ds.status::text = UPPER($4))
            AND ($5::date IS NULL OR d.planned_departure::date >= $5::date)
            AND ($6::date IS NULL OR d.planned_departure::date <= $6::date)
            AND (
              $2 = true OR EXISTS (
                SELECT 1
                FROM school_user_access sua
                WHERE sua.sppg_id = ds.sppg_id
                  AND sua.school_id = ds.school_id
                  AND sua.user_id = $3
              )
            )
        `,
        [
          sppgId,
          request.auth!.is_super_admin,
          request.auth!.user_id,
          list.status ?? null,
          list.date_from ?? null,
          list.date_to ?? null
        ]
      );

      const result = await query(
        `
          SELECT
            ds.id AS delivery_stop_id,
            ds.delivery_id,
            ds.school_id,
            ds.stop_order,
            ds.status,
            di.planned_portions,
            di.delivered_portions,
            d.manifest_no,
            d.planned_departure
          FROM delivery_stops ds
          JOIN deliveries d
            ON d.id = ds.delivery_id
           AND d.sppg_id = ds.sppg_id
          LEFT JOIN delivery_items di
            ON di.delivery_stop_id = ds.id
           AND di.sppg_id = ds.sppg_id
          WHERE ds.sppg_id = $1
            AND ds.status IN ('DELIVERED', 'DISPUTED')
            AND ($4::text IS NULL OR ds.status::text = UPPER($4))
            AND ($5::date IS NULL OR d.planned_departure::date >= $5::date)
            AND ($6::date IS NULL OR d.planned_departure::date <= $6::date)
            AND (
              $2 = true OR EXISTS (
                SELECT 1
                FROM school_user_access sua
                WHERE sua.sppg_id = ds.sppg_id
                  AND sua.school_id = ds.school_id
                  AND sua.user_id = $3
              )
            )
          ORDER BY ${order.sql}
          LIMIT $7 OFFSET $8
        `,
        [
          sppgId,
          request.auth!.is_super_admin,
          request.auth!.user_id,
          list.status ?? null,
          list.date_from ?? null,
          list.date_to ?? null,
          list.page_size,
          list.offset
        ]
      );

      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.post(
    "/deliveries",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DELIVERY_MANAGE);
      const sppgId = requireActiveSppg(request);
      const body = createDeliverySchema.parse(request.body);
      await assertPeriodUnlocked(sppgId, toDateOnly(body.planned_departure));

      const deliveryId = randomUUID();
      const manifestNo = buildManifestNo(sppgId);

      await withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO deliveries (
              id, sppg_id, manifest_no, route_id, driver_user_id, vehicle_no,
              status, planned_departure, closed_at,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              'PLANNED', $7::timestamptz, NULL,
              now(), $8, now(), $8
            )
          `,
          [deliveryId, sppgId, manifestNo, body.route_id, body.driver_user_id, body.vehicle_no ?? null, body.planned_departure, request.auth!.user_id]
        );

        const routeStops = await client.query<{ school_id: string; stop_order: number }>(
          `
            SELECT school_id, stop_order
            FROM route_schools
            WHERE route_id = $1 AND sppg_id = $2
            ORDER BY stop_order
          `,
          [body.route_id, sppgId]
        );

        if (routeStops.rowCount === 0) {
          throw unprocessable("Rute tidak memiliki sekolah tujuan");
        }

        for (const stop of routeStops.rows) {
          const stopId = randomUUID();
          await client.query(
            `
              INSERT INTO delivery_stops (
                id, sppg_id, delivery_id, school_id, stop_order, status,
                arrived_at, verified_at,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                $1, $2, $3, $4, $5, 'PLANNED',
                NULL, NULL,
                now(), $6, now(), $6
              )
            `,
            [stopId, sppgId, deliveryId, stop.school_id, stop.stop_order, request.auth!.user_id]
          );

          const packingResult = await client.query<{ id: string; portion_count: number }>(
            `
              SELECT id, portion_count
              FROM packing_lines
              WHERE sppg_id = $1
                AND school_id = $2
                AND ($3::uuid IS NULL OR production_run_id = $3)
              ORDER BY created_at DESC
              LIMIT 1
            `,
            [sppgId, stop.school_id, body.production_run_id ?? null]
          );
          const packing = packingResult.rows[0];

          await client.query(
            `
              INSERT INTO delivery_items (
                id, sppg_id, delivery_stop_id, packing_line_id,
                planned_portions, delivered_portions, returned_portions,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3,
                $4, 0, 0,
                now(), $5, now(), $5
              )
            `,
            [sppgId, stopId, packing?.id ?? null, packing?.portion_count ?? 0, request.auth!.user_id]
          );
        }

        await writeAudit(
          {
            sppgId,
            entityTable: "deliveries",
            entityId: deliveryId,
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
        id: deliveryId,
        manifest_no: manifestNo,
        status: "PLANNED"
      });
    }
  );

  app.get(
    "/deliveries/:id/stops",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const isDriver = request.auth?.roles.includes("DRIVER") && !request.auth?.is_super_admin;
      if (isDriver) {
        requirePermission(request, PERMISSIONS.DELIVERY_UPDATE_STATUS);
      } else {
        requirePermission(request, PERMISSIONS.DELIVERY_MANAGE);
      }
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          stop_order: "ds.stop_order",
          status: "ds.status",
          arrived_at: "ds.arrived_at",
          verified_at: "ds.verified_at"
        },
        fallback: "ds.stop_order ASC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk deliveries/:id/stops");
      }
      if (isDriver) {
        await checkDriverScope(sppgId, params.id, request.auth!.user_id);
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM delivery_stops ds
          WHERE ds.delivery_id = $1
            AND ds.sppg_id = $2
            AND ($3::text IS NULL OR ds.status::text = UPPER($3))
        `,
        [params.id, sppgId, list.status ?? null]
      );

      const result = await query(
        `
          SELECT
            ds.id,
            ds.school_id,
            ds.stop_order,
            ds.status,
            ds.arrived_at,
            ds.verified_at,
            di.planned_portions,
            di.delivered_portions,
            di.returned_portions
          FROM delivery_stops ds
          LEFT JOIN delivery_items di
            ON di.delivery_stop_id = ds.id
           AND di.sppg_id = ds.sppg_id
          WHERE ds.delivery_id = $1
            AND ds.sppg_id = $2
            AND ($3::text IS NULL OR ds.status::text = UPPER($3))
          ORDER BY ${order.sql}
          LIMIT $4 OFFSET $5
        `,
        [params.id, sppgId, list.status ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.post(
    "/deliveries/:id/status",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = updateStatusSchema.parse(request.body);
      const sppgId = requireActiveSppg(request);

      if (request.auth?.roles.includes("DRIVER")) {
        requirePermission(request, PERMISSIONS.DELIVERY_UPDATE_STATUS);
        await checkDriverScope(sppgId, params.id, request.auth.user_id);
      } else {
        requirePermission(request, PERMISSIONS.DELIVERY_MANAGE);
      }

      const deliveryResult = await query<{ status: string }>(
        "SELECT status FROM deliveries WHERE id = $1 AND sppg_id = $2 LIMIT 1",
        [params.id, sppgId]
      );
      const current = deliveryResult.rows[0];
      if (!current) {
        throw notFound("Delivery tidak ditemukan");
      }

      assertTransition(current.status as keyof typeof DELIVERY_TRANSITIONS, body.status, DELIVERY_TRANSITIONS, "delivery");
      await assertDeliveryDateUnlocked(sppgId, params.id);

      await query(
        "UPDATE deliveries SET status = $3, updated_at = now(), updated_by = $4 WHERE id = $1 AND sppg_id = $2",
        [params.id, sppgId, body.status, request.auth!.user_id]
      );

      if (body.delivery_stop_id) {
        const stopResult = await query<{ status: string }>(
          "SELECT status FROM delivery_stops WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3 LIMIT 1",
          [body.delivery_stop_id, params.id, sppgId]
        );
        const stop = stopResult.rows[0];
        if (!stop) {
          throw notFound("Delivery stop tidak ditemukan");
        }
        assertTransition(stop.status as keyof typeof STOP_TRANSITIONS, body.status, STOP_TRANSITIONS, "delivery stop");

        await query(
          `
            UPDATE delivery_stops
            SET status = $4::stop_status,
                arrived_at = CASE WHEN $4::stop_status = 'DELIVERED'::stop_status THEN now() ELSE arrived_at END,
                updated_at = now(),
                updated_by = $5
            WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
          `,
          [body.delivery_stop_id, params.id, sppgId, body.status, request.auth!.user_id]
        );
      }

      await writeAudit({
        sppgId,
        entityTable: "deliveries",
        entityId: params.id,
        action: "STATUS_UPDATE",
        oldValue: { status: current.status },
        newValue: { status: body.status, stop_id: body.delivery_stop_id ?? null },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: params.id, status: body.status });
    }
  );

  app.post(
    "/deliveries/:id/proof",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DELIVERY_UPLOAD_PROOF);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = proofSchema.parse(request.body);
      const key = request.headers["idempotency-key"]?.toString();

      if (!key) {
        throw unprocessable("Header Idempotency-Key wajib diisi");
      }

      if (request.auth?.roles.includes("DRIVER") && !request.auth.is_super_admin) {
        await checkDriverScope(sppgId, params.id, request.auth.user_id);
      }
      await assertDeliveryDateUnlocked(sppgId, params.id);

      let replayResponse: { code: number; body: unknown } | null = null;
      let created: { id: string; delivery_stop_id: string; status: string } | null = null;

      await withTransaction(async (client) => {
        const lock = await acquireIdempotency(client, {
          sppgId,
          endpoint: "POST:/deliveries/proof",
          key,
          requestHash: hashPayload(body)
        });

        if (lock.replay) {
          replayResponse = { code: lock.responseCode, body: lock.responseBody };
          return;
        }

        const stopResult = await client.query<{ status: string }>(
          `
            SELECT status
            FROM delivery_stops
            WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
            LIMIT 1
            FOR UPDATE
          `,
          [body.delivery_stop_id, params.id, sppgId]
        );
        const stop = stopResult.rows[0];
        if (!stop) {
          throw notFound("Delivery stop tidak ditemukan");
        }

        if (!["IN_TRANSIT", "DELIVERED"].includes(stop.status)) {
          throw conflict("STATE_TRANSITION_INVALID", "Proof hanya dapat diunggah saat IN_TRANSIT/DELIVERED");
        }

        await assertAttachmentsOwned(client, {
          sppgId,
          attachmentIds: [body.attachment_id]
        });

        const capturedAt = new Date(body.captured_at).getTime();
        if (capturedAt < Date.now() - 10 * 60 * 1000) {
          throw unprocessable("Timestamp proof terlalu jauh ke belakang");
        }

        const proofId = randomUUID();
        await client.query(
          `
            INSERT INTO delivery_proofs (
              id, sppg_id, delivery_stop_id, proof_type, attachment_id,
              captured_at, geo_lat, geo_lng, idempotency_key,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6::timestamptz, $7, $8, $9,
              now(), $10, now(), $10
            )
          `,
          [
            proofId,
            sppgId,
            body.delivery_stop_id,
            body.proof_type,
            body.attachment_id,
            body.captured_at,
            body.geo?.lat ?? null,
            body.geo?.lng ?? null,
            key,
            request.auth!.user_id
          ]
        );

        await client.query(
          `
            UPDATE delivery_stops
            SET status = 'DELIVERED', arrived_at = COALESCE(arrived_at, now()), updated_at = now(), updated_by = $4
            WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
          `,
          [body.delivery_stop_id, params.id, sppgId, request.auth!.user_id]
        );

        await client.query(
          `
            UPDATE deliveries
            SET status = CASE WHEN status = 'IN_TRANSIT' THEN 'DELIVERED' ELSE status END,
                updated_at = now(),
                updated_by = $3
            WHERE id = $1 AND sppg_id = $2
          `,
          [params.id, sppgId, request.auth!.user_id]
        );

        created = { id: proofId, delivery_stop_id: body.delivery_stop_id, status: "RECORDED" };

        await writeAudit(
          {
            sppgId,
            entityTable: "delivery_proofs",
            entityId: proofId,
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

        await saveIdempotencyResult(client, {
          sppgId,
          endpoint: "POST:/deliveries/proof",
          key,
          responseCode: 201,
          responseBody: created
        });
      });

      const replay = replayResponse as { code: number; body: unknown } | null;
      if (replay !== null) {
        return reply.status(replay.code).send(replay.body);
      }

      return reply.status(201).send(created);
    }
  );

  app.post(
    "/deliveries/:id/verify",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DELIVERY_VERIFY);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = verifySchema.parse(request.body);
      const key = request.headers["idempotency-key"]?.toString();
      if (!key) {
        throw unprocessable("Header Idempotency-Key wajib diisi");
      }
      await assertDeliveryDateUnlocked(sppgId, params.id);

      let replayResponse: { code: number; body: unknown } | null = null;
      let responseBody: unknown = null;

      await withTransaction(async (client) => {
        const lock = await acquireIdempotency(client, {
          sppgId,
          endpoint: "POST:/deliveries/verify",
          key,
          requestHash: hashPayload(body)
        });

        if (lock.replay) {
          replayResponse = { code: lock.responseCode, body: lock.responseBody };
          return;
        }

        const stopResult = await client.query<{ status: string; school_id: string }>(
          `
            SELECT status, school_id
            FROM delivery_stops
            WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
            LIMIT 1
            FOR UPDATE
          `,
          [body.delivery_stop_id, params.id, sppgId]
        );
        const stop = stopResult.rows[0];
        if (!stop) {
          throw notFound("Delivery stop tidak ditemukan");
        }

        if (stop.status === "VERIFIED" || stop.status === "LOCKED") {
          throw conflict("ALREADY_VERIFIED", "Stop sudah diverifikasi");
        }
        if (stop.status !== "DELIVERED" && stop.status !== "DISPUTED") {
          throw conflict("STATE_TRANSITION_INVALID", "Stop belum status DELIVERED");
        }

        const mapping = await client.query(
          `
            SELECT 1
            FROM school_user_access
            WHERE sppg_id = $1 AND school_id = $2 AND user_id = $3
            LIMIT 1
          `,
          [sppgId, stop.school_id, request.auth!.user_id]
        );
        if (!request.auth!.is_super_admin && mapping.rowCount === 0) {
          throw forbidden("Verifier tidak terdaftar untuk sekolah tujuan");
        }

        const itemResult = await client.query<{ planned_portions: number; delivered_portions: number }>(
          `
            SELECT planned_portions, delivered_portions
            FROM delivery_items
            WHERE delivery_stop_id = $1 AND sppg_id = $2
            ORDER BY created_at
            LIMIT 1
          `,
          [body.delivery_stop_id, sppgId]
        );
        const item = itemResult.rows[0];
        const planned = item?.planned_portions ?? 0;

        if (body.result === "MISMATCH" && (!body.reason || !body.attachments || body.attachments.length === 0)) {
          throw unprocessable("Mismatch wajib reason dan attachment");
        }

        if (body.result === "MATCH") {
          await client.query(
            `
              UPDATE delivery_stops
              SET status = 'VERIFIED', verified_at = now(), updated_at = now(), updated_by = $4
              WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
            `,
            [body.delivery_stop_id, params.id, sppgId, request.auth!.user_id]
          );
          await client.query(
            `
              UPDATE delivery_items
              SET delivered_portions = planned_portions,
                  updated_at = now(),
                  updated_by = $3
              WHERE delivery_stop_id = $1 AND sppg_id = $2
            `,
            [body.delivery_stop_id, sppgId, request.auth!.user_id]
          );

          responseBody = { delivery_stop_id: body.delivery_stop_id, status: "VERIFIED" };
        } else {
          const delta = body.verified_portions - planned;
          const disputeId = randomUUID();
          const attachmentIds = body.attachments?.map((attachment) => attachment.attachment_id) ?? [];
          await assertAttachmentsOwned(client, {
            sppgId,
            attachmentIds
          });

          await client.query(
            `
              INSERT INTO disputes (
                id, sppg_id, delivery_stop_id, reported_by, dispute_type, delta_portions, reason,
                status, resolved_by,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                $1, $2, $3, $4, 'QTY_MISMATCH', $5, $6,
                'OPEN', NULL,
                now(), $4, now(), $4
              )
            `,
            [disputeId, sppgId, body.delivery_stop_id, request.auth!.user_id, delta, body.reason ?? null]
          );

          await linkAttachments(client, {
            sppgId,
            entityTable: "disputes",
            entityId: disputeId,
            attachmentIds,
            actorUserId: request.auth!.user_id,
            attachmentRole: "DISPUTE_EVIDENCE"
          });

          await client.query(
            `
              UPDATE delivery_stops
              SET status = 'DISPUTED', updated_at = now(), updated_by = $4
              WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
            `,
            [body.delivery_stop_id, params.id, sppgId, request.auth!.user_id]
          );

          responseBody = {
            delivery_stop_id: body.delivery_stop_id,
            status: "DISPUTED",
            dispute: { id: disputeId, delta_portions: delta }
          };
        }

        await recalcDeliveryStatus(client, params.id, sppgId);

        await writeAudit(
          {
            sppgId,
            entityTable: "delivery_stops",
            entityId: body.delivery_stop_id,
            action: "VERIFY",
            oldValue: { status: stop.status },
            newValue: responseBody,
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
          endpoint: "POST:/deliveries/verify",
          key,
          responseCode: 200,
          responseBody
        });
      });

      const replay = replayResponse as { code: number; body: unknown } | null;
      if (replay !== null) {
        return reply.status(replay.code).send(replay.body);
      }

      return reply.send(responseBody);
    }
  );

  app.post(
    "/deliveries/:id/disputes",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DISPUTE_MANAGE);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = createDisputeSchema.parse(request.body);
      await assertDeliveryDateUnlocked(sppgId, params.id);

      const disputeId = randomUUID();
      await withTransaction(async (client) => {
        const stopResult = await client.query<{ status: string; school_id: string }>(
          `
            SELECT status, school_id
            FROM delivery_stops
            WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
            LIMIT 1
            FOR UPDATE
          `,
          [body.delivery_stop_id, params.id, sppgId]
        );
        const stop = stopResult.rows[0];
        if (!stop) {
          throw notFound("Delivery stop tidak ditemukan");
        }

        if (stop.status === "VERIFIED" || stop.status === "LOCKED") {
          throw conflict("STATE_TRANSITION_INVALID", "Stop sudah final, dispute tidak bisa ditambah");
        }
        if (request.auth?.roles.includes("SCHOOL_VERIFIER") && !request.auth.is_super_admin) {
          const mapping = await client.query(
            `
              SELECT 1
              FROM school_user_access
              WHERE sppg_id = $1 AND school_id = $2 AND user_id = $3
              LIMIT 1
            `,
            [sppgId, stop.school_id, request.auth.user_id]
          );
          if (mapping.rowCount === 0) {
            throw forbidden("Verifier tidak terdaftar untuk sekolah tujuan");
          }
        }

        const attachmentIds = body.attachments.map((attachment) => attachment.attachment_id);
        await assertAttachmentsOwned(client, {
          sppgId,
          attachmentIds
        });

        await client.query(
          `
            INSERT INTO disputes (
              id, sppg_id, delivery_stop_id, reported_by, dispute_type, delta_portions, reason,
              status, resolved_by,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              $1, $2, $3, $4, 'QTY_MISMATCH', $5, $6,
              'OPEN', NULL,
              now(), $4, now(), $4
            )
          `,
          [disputeId, sppgId, body.delivery_stop_id, request.auth!.user_id, body.delta_portions, body.reason]
        );

        await linkAttachments(client, {
          sppgId,
          entityTable: "disputes",
          entityId: disputeId,
          attachmentIds,
          actorUserId: request.auth!.user_id,
          attachmentRole: "DISPUTE_EVIDENCE"
        });

        await client.query(
          `
            UPDATE delivery_stops
            SET status = 'DISPUTED', updated_at = now(), updated_by = $4
            WHERE id = $1 AND delivery_id = $2 AND sppg_id = $3
          `,
          [body.delivery_stop_id, params.id, sppgId, request.auth!.user_id]
        );

        await client.query(
          `
            UPDATE deliveries
            SET status = 'DISPUTED', updated_at = now(), updated_by = $3
            WHERE id = $1 AND sppg_id = $2 AND status IN ('DELIVERED', 'VERIFIED')
          `,
          [params.id, sppgId, request.auth!.user_id]
        );

        await writeAudit(
          {
            sppgId,
            entityTable: "disputes",
            entityId: disputeId,
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
        id: disputeId,
        delivery_stop_id: body.delivery_stop_id,
        status: "OPEN"
      });
    }
  );

  app.post(
    "/disputes/:id/resolve",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DISPUTE_MANAGE);
      const sppgId = requireActiveSppg(request);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = resolveDisputeSchema.parse(request.body);

      let stockMoveId: string | null = null;
      await withTransaction(async (client) => {
        const disputeResult = await client.query<{
          id: string;
          status: string;
          delivery_stop_id: string;
          delta_portions: number;
          reason: string | null;
          delivery_id: string;
          planned_departure: string;
        }>(
          `
            SELECT d.id, d.status, d.delivery_stop_id, d.delta_portions, d.reason, ds.delivery_id, del.planned_departure::text
            FROM disputes d
            JOIN delivery_stops ds ON ds.id = d.delivery_stop_id AND ds.sppg_id = d.sppg_id
            JOIN deliveries del ON del.id = ds.delivery_id AND del.sppg_id = ds.sppg_id
            WHERE d.id = $1 AND d.sppg_id = $2
            LIMIT 1
            FOR UPDATE
          `,
          [params.id, sppgId]
        );

        const dispute = disputeResult.rows[0];
        if (!dispute) {
          throw notFound("Dispute tidak ditemukan");
        }
        if (dispute.status !== "OPEN" && dispute.status !== "IN_REVIEW") {
          throw conflict("STATE_TRANSITION_INVALID", "Dispute tidak berada pada status resolvable");
        }
        await assertPeriodUnlocked(sppgId, toDateOnly(dispute.planned_departure));

        if (body.stock_action !== "NONE") {
          if (!body.item_id || !body.qty || !body.reason_code) {
            throw unprocessable("item_id, qty, dan reason_code wajib jika stock_action bukan NONE");
          }

          const moveNoResult = await client.query<{ next_move: string }>(
            "SELECT COALESCE(MAX(move_no), 0) + 1 AS next_move FROM stock_moves WHERE sppg_id = $1",
            [sppgId]
          );
          const moveNo = Number(moveNoResult.rows[0]?.next_move ?? 1);
          const qty = body.stock_action === "WASTE" ? -Math.abs(body.qty) : Math.abs(body.qty);
          const moveType = body.stock_action === "WASTE" ? "WASTE" : "RETURN";

          const moveResult = await client.query<{ id: string }>(
            `
              INSERT INTO stock_moves (
                id, sppg_id, move_no, move_type,
                item_id, batch_id, qty, uom_id,
                ref_table, ref_id, reason_code,
                is_void, void_of_move_id,
                created_at, created_by, updated_at, updated_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3::stock_move_type,
                $4, $5, $6, (SELECT unit_id FROM inventory_items WHERE id = $4 AND sppg_id = $1),
                'disputes', $7, $8,
                false, NULL,
                now(), $9, now(), $9
              )
              RETURNING id
            `,
            [
              sppgId,
              moveNo,
              moveType,
              body.item_id,
              body.batch_id ?? null,
              qty,
              dispute.id,
              body.reason_code,
              request.auth!.user_id
            ]
          );
          stockMoveId = moveResult.rows[0]?.id ?? null;
        }

        const disputeStatus = body.resolution === "ACCEPT" ? "RESOLVED" : "REJECTED";
        await client.query(
          `
            UPDATE disputes
            SET status = $3::dispute_status,
                resolved_by = $4,
                updated_at = now(),
                updated_by = $4
            WHERE id = $1 AND sppg_id = $2
          `,
          [params.id, sppgId, disputeStatus, request.auth!.user_id]
        );

        await client.query(
          `
            UPDATE delivery_stops
            SET status = 'VERIFIED',
                verified_at = now(),
                updated_at = now(),
                updated_by = $3
            WHERE id = $1 AND sppg_id = $2
          `,
          [dispute.delivery_stop_id, sppgId, request.auth!.user_id]
        );

        await recalcDeliveryStatus(client, dispute.delivery_id, sppgId);

        await writeAudit(
          {
            sppgId,
            entityTable: "disputes",
            entityId: params.id,
            action: "RESOLVE",
            oldValue: {
              status: dispute.status,
              delta_portions: dispute.delta_portions,
              reason: dispute.reason
            },
            newValue: {
              status: disputeStatus,
              resolution: body.resolution,
              notes: body.notes ?? null,
              stock_action: body.stock_action,
              stock_move_id: stockMoveId
            },
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

      return reply.send({
        id: params.id,
        status: body.resolution === "ACCEPT" ? "RESOLVED" : "REJECTED",
        stock_move_id: stockMoveId
      });
    }
  );

  app.get(
    "/disputes",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.DISPUTE_MANAGE);
      const sppgId = requireActiveSppg(request);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: {
          created_at: "d.created_at",
          status: "d.status",
          delta_portions: "d.delta_portions"
        },
        fallback: "d.created_at DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk disputes");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM disputes d
          JOIN delivery_stops ds
            ON ds.id = d.delivery_stop_id
           AND ds.sppg_id = d.sppg_id
          WHERE d.sppg_id = $1
            AND ($2::text IS NULL OR d.status::text = UPPER($2))
            AND ($3::date IS NULL OR d.created_at::date >= $3::date)
            AND ($4::date IS NULL OR d.created_at::date <= $4::date)
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null]
      );

      const disputes = await query(
        `
          SELECT
            d.id,
            d.delivery_stop_id,
            d.reported_by,
            d.dispute_type,
            d.delta_portions,
            d.reason,
            d.status,
            d.resolved_by,
            d.created_at,
            ds.delivery_id
          FROM disputes d
          JOIN delivery_stops ds
            ON ds.id = d.delivery_stop_id
           AND ds.sppg_id = d.sppg_id
          WHERE d.sppg_id = $1
            AND ($2::text IS NULL OR d.status::text = UPPER($2))
            AND ($3::date IS NULL OR d.created_at::date >= $3::date)
            AND ($4::date IS NULL OR d.created_at::date <= $4::date)
          ORDER BY ${order.sql}
          LIMIT $5 OFFSET $6
        `,
        [sppgId, list.status ?? null, list.date_from ?? null, list.date_to ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: disputes.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );
}
