import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool";
import { requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { writeAudit } from "../../services/audit-service";
import { notFound, unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const schoolSchema = z.object({ code: z.string().min(1), name: z.string().min(1), address: z.string().optional(), sla_minutes: z.number().int().min(1).max(600).default(60) });
const routeSchema = z.object({ code: z.string().min(1), name: z.string().min(1), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
const vendorSchema = z.object({ code: z.string().min(1), name: z.string().min(1), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") });
const itemSchema = z.object({ sku: z.string().min(1), name: z.string().min(1), unit_id: z.string().uuid(), track_expiry: z.boolean().default(false), standard_cost: z.number().nonnegative().default(0) });
const recipeSchema = z.object({ code: z.string().min(1), name: z.string().min(1), yield_portions: z.number().int().positive(), status: z.enum(["DRAFT", "APPROVED", "ARCHIVED"]).default("DRAFT"), items: z.array(z.object({ item_id: z.string().uuid(), qty_per_portion: z.number().positive(), loss_factor: z.number().min(0).max(1).default(0) })).min(1) });
const recipePatchSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  yield_portions: z.number().int().positive().optional(),
  status: z.enum(["DRAFT", "APPROVED", "ARCHIVED"]).optional(),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        qty_per_portion: z.number().positive(),
        loss_factor: z.number().min(0).max(1).default(0)
      })
    )
    .min(1)
    .optional()
});
const lookupSchema = z.object({
  include: z.string().optional()
});
const routeSchoolSchema = z.object({
  schools: z.array(z.object({ school_id: z.string().uuid(), stop_order: z.number().int().min(1) })).min(1)
});
const schoolVerifierSchema = z.object({
  verifier_user_ids: z.array(z.string().uuid()).default([])
});

function patchFields(body: Record<string, unknown>, map: Record<string, string>): { setSql: string; values: unknown[] } {
  const entries = Object.entries(body).filter(([, value]) => value !== undefined);
  const values: unknown[] = [];
  const set: string[] = [];
  let idx = 1;
  for (const [key, value] of entries) {
    if (!map[key]) {
      continue;
    }
    set.push(`${map[key]} = $${idx}`);
    values.push(value);
    idx += 1;
  }
  return { setSql: set.join(", "), values };
}

export async function masterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const list = parseListQuery(request.query);
    const order = resolveOrderBy({
      sortBy: list.sort_by,
      sortDir: list.sort_dir,
      allowed: { code: "code", name: "name", sla_minutes: "sla_minutes", created_at: "created_at" },
      fallback: "name ASC"
    });
    if (!order.valid) {
      throw unprocessable("sort_by tidak valid untuk schools");
    }

    const count = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM schools
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
      `,
      [sppgId, list.search ?? null]
    );

    const result = await query(
      `
        SELECT id, code, name, address, sla_minutes
        FROM schools
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
        ORDER BY ${order.sql}
        LIMIT $3 OFFSET $4
      `,
      [sppgId, list.search ?? null, list.page_size, list.offset]
    );

    return reply.send({
      data: result.rows,
      ...buildPagingMeta(list.page, list.page_size, Number(count.rows[0]?.total ?? 0))
    });
  });

  app.post("/schools", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const body = schoolSchema.parse(request.body);
    const result = await query(
      `
        INSERT INTO schools (id, sppg_id, code, name, address, sla_minutes, created_at, created_by, updated_at, updated_by)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), $6, now(), $6)
        RETURNING id, code, name, address, sla_minutes
      `,
      [sppgId, body.code, body.name, body.address ?? null, body.sla_minutes, request.auth!.user_id]
    );
    await writeAudit({
      sppgId,
      entityTable: "schools",
      entityId: result.rows[0].id,
      action: "CREATE",
      newValue: result.rows[0],
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });
    return reply.status(201).send(result.rows[0]);
  });

  app.patch("/schools/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = schoolSchema.partial().parse(request.body);

    const patch = patchFields(body, { code: "code", name: "name", address: "address", sla_minutes: "sla_minutes" });
    if (!patch.setSql) {
      return reply.send({ id: params.id, updated: false });
    }

    const current = await query<{ id: string; code: string; name: string; address: string | null; sla_minutes: number }>(
      `
        SELECT id, code, name, address, sla_minutes
        FROM schools
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    if (!current.rows[0]) {
      throw notFound("Sekolah tidak ditemukan");
    }

    await query(
      `UPDATE schools SET ${patch.setSql}, updated_at = now(), updated_by = $${patch.values.length + 1} WHERE id = $${patch.values.length + 2} AND sppg_id = $${patch.values.length + 3}`,
      [...patch.values, request.auth!.user_id, params.id, sppgId]
    );

    const updated = await query<{ id: string; code: string; name: string; address: string | null; sla_minutes: number }>(
      `
        SELECT id, code, name, address, sla_minutes
        FROM schools
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    await writeAudit({
      sppgId,
      entityTable: "schools",
      entityId: params.id,
      action: "UPDATE",
      oldValue: current.rows[0],
      newValue: updated.rows[0] ?? body,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });

    return reply.send({ id: params.id, updated: true });
  });

  app.get("/routes", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const list = parseListQuery(request.query);
    const order = resolveOrderBy({
      sortBy: list.sort_by,
      sortDir: list.sort_dir,
      allowed: { code: "code", name: "name", status: "status", created_at: "created_at" },
      fallback: "name ASC"
    });
    if (!order.valid) {
      throw unprocessable("sort_by tidak valid untuk routes");
    }

    const count = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM routes
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR status = UPPER($3))
      `,
      [sppgId, list.search ?? null, list.status ?? null]
    );

    const result = await query(
      `
        SELECT id, code, name, status
        FROM routes
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR status = UPPER($3))
        ORDER BY ${order.sql}
        LIMIT $4 OFFSET $5
      `,
      [sppgId, list.search ?? null, list.status ?? null, list.page_size, list.offset]
    );

    return reply.send({
      data: result.rows,
      ...buildPagingMeta(list.page, list.page_size, Number(count.rows[0]?.total ?? 0))
    });
  });

  app.post("/routes", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const body = routeSchema.parse(request.body);
    const result = await query(
      `
        INSERT INTO routes (id, sppg_id, code, name, status, created_at, created_by, updated_at, updated_by)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), $5, now(), $5)
        RETURNING id, code, name, status
      `,
      [sppgId, body.code, body.name, body.status, request.auth!.user_id]
    );
    await writeAudit({
      sppgId,
      entityTable: "routes",
      entityId: result.rows[0].id,
      action: "CREATE",
      newValue: result.rows[0],
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });
    return reply.status(201).send(result.rows[0]);
  });

  app.patch("/routes/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = routeSchema.partial().parse(request.body);
    const patch = patchFields(body, { code: "code", name: "name", status: "status" });
    if (!patch.setSql) {
      return reply.send({ id: params.id, updated: false });
    }
    const current = await query<{ id: string; code: string; name: string; status: string }>(
      `
        SELECT id, code, name, status
        FROM routes
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    if (!current.rows[0]) {
      throw notFound("Rute tidak ditemukan");
    }
    await query(
      `UPDATE routes SET ${patch.setSql}, updated_at = now(), updated_by = $${patch.values.length + 1} WHERE id = $${patch.values.length + 2} AND sppg_id = $${patch.values.length + 3}`,
      [...patch.values, request.auth!.user_id, params.id, sppgId]
    );
    const updated = await query<{ id: string; code: string; name: string; status: string }>(
      `
        SELECT id, code, name, status
        FROM routes
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    await writeAudit({
      sppgId,
      entityTable: "routes",
      entityId: params.id,
      action: "UPDATE",
      oldValue: current.rows[0],
      newValue: updated.rows[0] ?? body,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });
    return reply.send({ id: params.id, updated: true });
  });

  app.get("/vendors", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const list = parseListQuery(request.query);
    const order = resolveOrderBy({
      sortBy: list.sort_by,
      sortDir: list.sort_dir,
      allowed: { code: "code", name: "name", status: "status", created_at: "created_at" },
      fallback: "name ASC"
    });
    if (!order.valid) {
      throw unprocessable("sort_by tidak valid untuk vendors");
    }

    const count = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM vendors
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR status = UPPER($3))
      `,
      [sppgId, list.search ?? null, list.status ?? null]
    );

    const result = await query(
      `
        SELECT id, code, name, status
        FROM vendors
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR status = UPPER($3))
        ORDER BY ${order.sql}
        LIMIT $4 OFFSET $5
      `,
      [sppgId, list.search ?? null, list.status ?? null, list.page_size, list.offset]
    );

    return reply.send({
      data: result.rows,
      ...buildPagingMeta(list.page, list.page_size, Number(count.rows[0]?.total ?? 0))
    });
  });

  app.post("/vendors", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const body = vendorSchema.parse(request.body);
    const result = await query(
      `
        INSERT INTO vendors (id, sppg_id, code, name, status, created_at, created_by, updated_at, updated_by)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), $5, now(), $5)
        RETURNING id, code, name, status
      `,
      [sppgId, body.code, body.name, body.status, request.auth!.user_id]
    );
    await writeAudit({
      sppgId,
      entityTable: "vendors",
      entityId: result.rows[0].id,
      action: "CREATE",
      newValue: result.rows[0],
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });
    return reply.status(201).send(result.rows[0]);
  });

  app.patch("/vendors/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = vendorSchema.partial().parse(request.body);
    const patch = patchFields(body, { code: "code", name: "name", status: "status" });
    if (!patch.setSql) {
      return reply.send({ id: params.id, updated: false });
    }
    const current = await query<{ id: string; code: string; name: string; status: string }>(
      `
        SELECT id, code, name, status
        FROM vendors
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    if (!current.rows[0]) {
      throw notFound("Vendor tidak ditemukan");
    }
    await query(
      `UPDATE vendors SET ${patch.setSql}, updated_at = now(), updated_by = $${patch.values.length + 1} WHERE id = $${patch.values.length + 2} AND sppg_id = $${patch.values.length + 3}`,
      [...patch.values, request.auth!.user_id, params.id, sppgId]
    );
    const updated = await query<{ id: string; code: string; name: string; status: string }>(
      `
        SELECT id, code, name, status
        FROM vendors
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    await writeAudit({
      sppgId,
      entityTable: "vendors",
      entityId: params.id,
      action: "UPDATE",
      oldValue: current.rows[0],
      newValue: updated.rows[0] ?? body,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });
    return reply.send({ id: params.id, updated: true });
  });

  app.get("/items", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const list = parseListQuery(request.query);
    const order = resolveOrderBy({
      sortBy: list.sort_by,
      sortDir: list.sort_dir,
      allowed: { sku: "sku", name: "name", standard_cost: "standard_cost", created_at: "created_at" },
      fallback: "name ASC"
    });
    if (!order.valid) {
      throw unprocessable("sort_by tidak valid untuk items");
    }

    const count = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM inventory_items
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%')
      `,
      [sppgId, list.search ?? null]
    );

    const result = await query(
      `
        SELECT id, sku, name, unit_id, track_expiry, standard_cost
        FROM inventory_items
        WHERE sppg_id = $1
          AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%')
        ORDER BY ${order.sql}
        LIMIT $3 OFFSET $4
      `,
      [sppgId, list.search ?? null, list.page_size, list.offset]
    );

    return reply.send({
      data: result.rows,
      ...buildPagingMeta(list.page, list.page_size, Number(count.rows[0]?.total ?? 0))
    });
  });

  app.post("/items", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const body = itemSchema.parse(request.body);
    const result = await query(
      `
        INSERT INTO inventory_items (id, sppg_id, sku, name, unit_id, track_expiry, standard_cost, created_at, created_by, updated_at, updated_by)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), $7, now(), $7)
        RETURNING id, sku, name, unit_id, track_expiry, standard_cost
      `,
      [sppgId, body.sku, body.name, body.unit_id, body.track_expiry, body.standard_cost, request.auth!.user_id]
    );
    await writeAudit({
      sppgId,
      entityTable: "inventory_items",
      entityId: result.rows[0].id,
      action: "CREATE",
      newValue: result.rows[0],
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });
    return reply.status(201).send(result.rows[0]);
  });

  app.patch("/items/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = itemSchema.partial().parse(request.body);
    const patch = patchFields(body, { sku: "sku", name: "name", unit_id: "unit_id", track_expiry: "track_expiry", standard_cost: "standard_cost" });
    if (!patch.setSql) {
      return reply.send({ id: params.id, updated: false });
    }
    const current = await query<{
      id: string;
      sku: string;
      name: string;
      unit_id: string;
      track_expiry: boolean;
      standard_cost: number;
    }>(
      `
        SELECT id, sku, name, unit_id, track_expiry, standard_cost
        FROM inventory_items
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    if (!current.rows[0]) {
      throw notFound("Item tidak ditemukan");
    }
    await query(
      `UPDATE inventory_items SET ${patch.setSql}, updated_at = now(), updated_by = $${patch.values.length + 1} WHERE id = $${patch.values.length + 2} AND sppg_id = $${patch.values.length + 3}`,
      [...patch.values, request.auth!.user_id, params.id, sppgId]
    );
    const updated = await query<{
      id: string;
      sku: string;
      name: string;
      unit_id: string;
      track_expiry: boolean;
      standard_cost: number;
    }>(
      `
        SELECT id, sku, name, unit_id, track_expiry, standard_cost
        FROM inventory_items
        WHERE id = $1 AND sppg_id = $2
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    await writeAudit({
      sppgId,
      entityTable: "inventory_items",
      entityId: params.id,
      action: "UPDATE",
      oldValue: current.rows[0],
      newValue: updated.rows[0] ?? body,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });
    return reply.send({ id: params.id, updated: true });
  });

  app.get("/recipes", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const list = parseListQuery(request.query);
    const order = resolveOrderBy({
      sortBy: list.sort_by,
      sortDir: list.sort_dir,
      allowed: {
        code: "r.code",
        name: "r.name",
        status: "r.status",
        yield_portions: "r.yield_portions",
        created_at: "r.created_at"
      },
      fallback: "r.name ASC"
    });
    if (!order.valid) {
      throw unprocessable("sort_by tidak valid untuk recipes");
    }

    const count = await query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM recipes r
        WHERE r.sppg_id = $1
          AND ($2::text IS NULL OR r.name ILIKE '%' || $2 || '%' OR r.code ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR r.status = UPPER($3))
      `,
      [sppgId, list.search ?? null, list.status ?? null]
    );

    const result = await query(
      `
        SELECT r.id, r.code, r.name, r.yield_portions, r.status,
               COALESCE(JSON_AGG(JSON_BUILD_OBJECT('item_id', ri.item_id, 'qty_per_portion', ri.qty_per_portion, 'loss_factor', ri.loss_factor)
               ORDER BY ri.created_at) FILTER (WHERE ri.id IS NOT NULL), '[]'::json) AS items
        FROM recipes r
        LEFT JOIN recipe_items ri ON ri.recipe_id = r.id AND ri.sppg_id = r.sppg_id
        WHERE r.sppg_id = $1
          AND ($2::text IS NULL OR r.name ILIKE '%' || $2 || '%' OR r.code ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR r.status = UPPER($3))
        GROUP BY r.id
        ORDER BY ${order.sql}
        LIMIT $4 OFFSET $5
      `,
      [sppgId, list.search ?? null, list.status ?? null, list.page_size, list.offset]
    );
    return reply.send({
      data: result.rows,
      ...buildPagingMeta(list.page, list.page_size, Number(count.rows[0]?.total ?? 0))
    });
  });

  app.get("/lookups/master", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const params = lookupSchema.parse(request.query);

    const include = new Set(
      (params.include ?? "schools,routes,vendors,items,recipes,drivers,verifiers,units")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );

    const response: Record<string, unknown> = {};

    if (include.has("schools")) {
      const schools = await query("SELECT id, code, name, sla_minutes FROM schools WHERE sppg_id = $1 ORDER BY name", [sppgId]);
      response.schools = schools.rows;
    }
    if (include.has("routes")) {
      const routes = await query(
        "SELECT id, code, name, status FROM routes WHERE sppg_id = $1 AND status = 'ACTIVE' ORDER BY name",
        [sppgId]
      );
      response.routes = routes.rows;
    }
    if (include.has("vendors")) {
      const vendors = await query(
        "SELECT id, code, name, status FROM vendors WHERE sppg_id = $1 AND status = 'ACTIVE' ORDER BY name",
        [sppgId]
      );
      response.vendors = vendors.rows;
    }
    if (include.has("units")) {
      const units = await query("SELECT id, code, name FROM units WHERE sppg_id = $1 ORDER BY name", [sppgId]);
      response.units = units.rows;
    }
    if (include.has("items")) {
      const items = await query(
        "SELECT id, sku, name, unit_id, track_expiry, standard_cost FROM inventory_items WHERE sppg_id = $1 ORDER BY name",
        [sppgId]
      );
      response.items = items.rows;
    }
    if (include.has("recipes")) {
      const recipes = await query(
        "SELECT id, code, name, yield_portions, status FROM recipes WHERE sppg_id = $1 AND status IN ('APPROVED','DRAFT') ORDER BY name",
        [sppgId]
      );
      response.recipes = recipes.rows;
    }
    if (include.has("drivers")) {
      const drivers = await query(
        `
          SELECT u.id, u.full_name, u.email
          FROM users u
          JOIN user_sppg us
            ON us.user_id = u.id
           AND us.sppg_id = $1
           AND us.status = 'ACTIVE'
          WHERE u.status = 'ACTIVE'
            AND us.role_scope @> '["DRIVER"]'::jsonb
          ORDER BY u.full_name
        `,
        [sppgId]
      );
      response.drivers = drivers.rows;
    }
    if (include.has("verifiers")) {
      const verifiers = await query(
        `
          SELECT u.id, u.full_name, u.email
          FROM users u
          JOIN user_sppg us
            ON us.user_id = u.id
           AND us.sppg_id = $1
           AND us.status = 'ACTIVE'
          WHERE u.status = 'ACTIVE'
            AND us.role_scope @> '["SCHOOL_VERIFIER"]'::jsonb
          ORDER BY u.full_name
        `,
        [sppgId]
      );
      response.verifiers = verifiers.rows;
    }

    return reply.send(response);
  });

  app.get("/routes/:id/schools", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    const route = await query<{ id: string; code: string; name: string }>(
      "SELECT id, code, name FROM routes WHERE id = $1 AND sppg_id = $2 LIMIT 1",
      [params.id, sppgId]
    );
    if (!route.rows[0]) {
      throw notFound("Rute tidak ditemukan");
    }

    const rows = await query<{
      school_id: string;
      school_code: string;
      school_name: string;
      stop_order: number;
    }>(
      `
        SELECT rs.school_id, s.code AS school_code, s.name AS school_name, rs.stop_order
        FROM route_schools rs
        JOIN schools s ON s.id = rs.school_id AND s.sppg_id = rs.sppg_id
        WHERE rs.route_id = $1 AND rs.sppg_id = $2
        ORDER BY rs.stop_order ASC
      `,
      [params.id, sppgId]
    );

    return reply.send({
      route_id: params.id,
      route_code: route.rows[0].code,
      route_name: route.rows[0].name,
      data: rows.rows
    });
  });

  app.put("/routes/:id/schools", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = routeSchoolSchema.parse(request.body);

    const route = await query<{ id: string }>("SELECT id FROM routes WHERE id = $1 AND sppg_id = $2 LIMIT 1", [params.id, sppgId]);
    if (!route.rows[0]) {
      throw notFound("Rute tidak ditemukan");
    }

    const uniqueSchoolIds = [...new Set(body.schools.map((row) => row.school_id))];
    if (uniqueSchoolIds.length !== body.schools.length) {
      throw unprocessable("School pada rute tidak boleh duplikat");
    }

    const schoolCheck = await query<{ id: string }>(
      "SELECT id FROM schools WHERE sppg_id = $1 AND id = ANY($2::uuid[])",
      [sppgId, uniqueSchoolIds]
    );
    if (schoolCheck.rowCount !== uniqueSchoolIds.length) {
      throw unprocessable("Terdapat school_id yang tidak valid untuk SPPG aktif");
    }

    const oldRows = await query<{ school_id: string; stop_order: number }>(
      "SELECT school_id, stop_order FROM route_schools WHERE route_id = $1 AND sppg_id = $2 ORDER BY stop_order",
      [params.id, sppgId]
    );

    await withTransaction(async (client) => {
      await client.query("DELETE FROM route_schools WHERE route_id = $1 AND sppg_id = $2", [params.id, sppgId]);
      for (const row of body.schools) {
        await client.query(
          `
            INSERT INTO route_schools (id, sppg_id, route_id, school_id, stop_order, created_at, created_by, updated_at, updated_by)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), $5, now(), $5)
          `,
          [sppgId, params.id, row.school_id, row.stop_order, request.auth!.user_id]
        );
      }
    });

    await writeAudit({
      sppgId,
      entityTable: "route_schools",
      entityId: params.id,
      action: "UPDATE",
      oldValue: oldRows.rows,
      newValue: body.schools,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });

    return reply.send({ route_id: params.id, updated: true });
  });

  app.get("/schools/:id/verifiers", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_READ);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    const school = await query<{ id: string; code: string; name: string }>(
      "SELECT id, code, name FROM schools WHERE id = $1 AND sppg_id = $2 LIMIT 1",
      [params.id, sppgId]
    );
    if (!school.rows[0]) {
      throw notFound("Sekolah tidak ditemukan");
    }

    const verifiers = await query<{ user_id: string; full_name: string; email: string }>(
      `
        SELECT sua.user_id, u.full_name, u.email
        FROM school_user_access sua
        JOIN users u ON u.id = sua.user_id
        WHERE sua.sppg_id = $1 AND sua.school_id = $2
        ORDER BY u.full_name
      `,
      [sppgId, params.id]
    );

    return reply.send({
      school_id: params.id,
      school_code: school.rows[0].code,
      school_name: school.rows[0].name,
      data: verifiers.rows
    });
  });

  app.put("/schools/:id/verifiers", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = schoolVerifierSchema.parse(request.body);

    const school = await query<{ id: string }>("SELECT id FROM schools WHERE id = $1 AND sppg_id = $2 LIMIT 1", [params.id, sppgId]);
    if (!school.rows[0]) {
      throw notFound("Sekolah tidak ditemukan");
    }

    const verifierIds = [...new Set(body.verifier_user_ids)];
    if (verifierIds.length > 0) {
      const allowed = await query<{ user_id: string }>(
        `
          SELECT us.user_id
          FROM user_sppg us
          WHERE us.sppg_id = $1
            AND us.status = 'ACTIVE'
            AND us.user_id = ANY($2::uuid[])
            AND us.role_scope @> '["SCHOOL_VERIFIER"]'::jsonb
        `,
        [sppgId, verifierIds]
      );
      if (allowed.rowCount !== verifierIds.length) {
        throw unprocessable("Semua verifier harus user aktif SPPG dengan role SCHOOL_VERIFIER");
      }
    }

    const oldRows = await query<{ user_id: string }>(
      "SELECT user_id FROM school_user_access WHERE sppg_id = $1 AND school_id = $2 ORDER BY user_id",
      [sppgId, params.id]
    );

    await withTransaction(async (client) => {
      await client.query("DELETE FROM school_user_access WHERE sppg_id = $1 AND school_id = $2", [sppgId, params.id]);
      for (const userId of verifierIds) {
        await client.query(
          `
            INSERT INTO school_user_access (id, sppg_id, school_id, user_id, created_at, created_by, updated_at, updated_by)
            VALUES (gen_random_uuid(), $1, $2, $3, now(), $4, now(), $4)
          `,
          [sppgId, params.id, userId, request.auth!.user_id]
        );
      }
    });

    await writeAudit({
      sppgId,
      entityTable: "school_user_access",
      entityId: params.id,
      action: "UPDATE",
      oldValue: oldRows.rows,
      newValue: verifierIds,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });

    return reply.send({ school_id: params.id, updated: true, verifier_user_ids: verifierIds });
  });

  app.post("/recipes", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const body = recipeSchema.parse(request.body);

    const created = await withTransaction(async (client) => {
      const recipe = await client.query<{ id: string; code: string; name: string; yield_portions: number; status: string }>(
        `
          INSERT INTO recipes (id, sppg_id, template_id, code, name, yield_portions, status, created_at, created_by, updated_at, updated_by)
          VALUES (gen_random_uuid(), $1, NULL, $2, $3, $4, $5, now(), $6, now(), $6)
          RETURNING id, code, name, yield_portions, status
        `,
        [sppgId, body.code, body.name, body.yield_portions, body.status, request.auth!.user_id]
      );
      const recipeId = recipe.rows[0].id;

      for (const item of body.items) {
        await client.query(
          `
            INSERT INTO recipe_items (id, sppg_id, recipe_id, item_id, qty_per_portion, loss_factor, created_at, created_by, updated_at, updated_by)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), $6, now(), $6)
          `,
          [sppgId, recipeId, item.item_id, item.qty_per_portion, item.loss_factor, request.auth!.user_id]
        );
      }

      return { ...recipe.rows[0], items: body.items };
    });

    await writeAudit({
      sppgId,
      entityTable: "recipes",
      entityId: created.id,
      action: "CREATE",
      newValue: created,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });

    return reply.status(201).send({ id: created.id, status: created.status });
  });

  app.patch("/recipes/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    requirePermission(request, PERMISSIONS.MASTER_WRITE);
    const sppgId = requireActiveSppg(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = recipePatchSchema.parse(request.body);

    const hasRecipePatch = body.code !== undefined || body.name !== undefined || body.yield_portions !== undefined || body.status !== undefined;
    if (!hasRecipePatch && body.items === undefined) {
      return reply.send({ id: params.id, updated: false });
    }

    if (body.items) {
      const uniqueItemIds = new Set(body.items.map((item) => item.item_id));
      if (uniqueItemIds.size !== body.items.length) {
        throw unprocessable("Item BOM recipe tidak boleh duplikat");
      }

      const validItems = await query<{ id: string }>(
        "SELECT id FROM inventory_items WHERE sppg_id = $1 AND id = ANY($2::uuid[])",
        [sppgId, [...uniqueItemIds]]
      );
      if (validItems.rowCount !== uniqueItemIds.size) {
        throw unprocessable("BOM berisi item yang tidak valid untuk SPPG aktif");
      }
    }

    const current = await query<{
      id: string;
      code: string;
      name: string;
      yield_portions: number;
      status: string;
      items: unknown;
    }>(
      `
        SELECT r.id, r.code, r.name, r.yield_portions, r.status,
               COALESCE(
                 JSON_AGG(
                   JSON_BUILD_OBJECT('item_id', ri.item_id, 'qty_per_portion', ri.qty_per_portion, 'loss_factor', ri.loss_factor)
                   ORDER BY ri.created_at
                 ) FILTER (WHERE ri.id IS NOT NULL),
                 '[]'::json
               ) AS items
        FROM recipes r
        LEFT JOIN recipe_items ri ON ri.recipe_id = r.id AND ri.sppg_id = r.sppg_id
        WHERE r.id = $1 AND r.sppg_id = $2
        GROUP BY r.id
        LIMIT 1
      `,
      [params.id, sppgId]
    );
    if (!current.rows[0]) {
      throw notFound("Recipe tidak ditemukan");
    }

    const patch = patchFields(body, {
      code: "code",
      name: "name",
      yield_portions: "yield_portions",
      status: "status"
    });

    await withTransaction(async (client) => {
      if (patch.setSql) {
        await client.query(
          `UPDATE recipes SET ${patch.setSql}, updated_at = now(), updated_by = $${patch.values.length + 1} WHERE id = $${patch.values.length + 2} AND sppg_id = $${patch.values.length + 3}`,
          [...patch.values, request.auth!.user_id, params.id, sppgId]
        );
      }

      if (body.items) {
        await client.query("DELETE FROM recipe_items WHERE recipe_id = $1 AND sppg_id = $2", [params.id, sppgId]);
        for (const item of body.items) {
          await client.query(
            `
              INSERT INTO recipe_items (id, sppg_id, recipe_id, item_id, qty_per_portion, loss_factor, created_at, created_by, updated_at, updated_by)
              VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), $6, now(), $6)
            `,
            [sppgId, params.id, item.item_id, item.qty_per_portion, item.loss_factor, request.auth!.user_id]
          );
        }
      }
    });

    const updated = await query<{
      id: string;
      code: string;
      name: string;
      yield_portions: number;
      status: string;
      items: unknown;
    }>(
      `
        SELECT r.id, r.code, r.name, r.yield_portions, r.status,
               COALESCE(
                 JSON_AGG(
                   JSON_BUILD_OBJECT('item_id', ri.item_id, 'qty_per_portion', ri.qty_per_portion, 'loss_factor', ri.loss_factor)
                   ORDER BY ri.created_at
                 ) FILTER (WHERE ri.id IS NOT NULL),
                 '[]'::json
               ) AS items
        FROM recipes r
        LEFT JOIN recipe_items ri ON ri.recipe_id = r.id AND ri.sppg_id = r.sppg_id
        WHERE r.id = $1 AND r.sppg_id = $2
        GROUP BY r.id
        LIMIT 1
      `,
      [params.id, sppgId]
    );

    await writeAudit({
      sppgId,
      entityTable: "recipes",
      entityId: params.id,
      action: "UPDATE",
      oldValue: current.rows[0],
      newValue: updated.rows[0] ?? body,
      actorUserId: request.auth!.user_id,
      actorRole: request.auth!.roles.join(","),
      requestId: request.id,
      deviceId: request.deviceId,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.toString()
    });

    return reply.send({ id: params.id, updated: true });
  });
}
