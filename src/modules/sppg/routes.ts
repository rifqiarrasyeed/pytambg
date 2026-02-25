import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/pool";
import { isSuperAdmin, requireActiveSppg, requirePermission } from "../../policies/guards";
import { PERMISSIONS } from "../../types";
import { writeAudit } from "../../services/audit-service";
import { ApiError, conflict, notFound, unprocessable } from "../../utils/api-error";
import { buildPagingMeta, parseListQuery } from "../../utils/pagination";
import { resolveOrderBy } from "../../utils/sorting";

const createSppgSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(150),
  timezone: z.string().default("Asia/Jakarta"),
  settings: z.record(z.string(), z.unknown())
});

const patchSppgSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  status: z.enum(["PENDING_SETUP", "ACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
  timezone: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional()
});

const assignSchema = z.object({
  user_id: z.string().uuid(),
  role_scope: z.array(z.string()).min(1),
  is_default: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

export async function sppgRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/settings",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.MASTER_WRITE);
      const sppgId = requireActiveSppg(request);

      const result = await query<{
        sppg_id: string;
        config: Record<string, unknown>;
        config_version: number;
        effective_from: string;
      }>(
        `
          SELECT sppg_id, config, config_version, effective_from::text
          FROM sppg_settings
          WHERE sppg_id = $1
          LIMIT 1
        `,
        [sppgId]
      );

      if (result.rowCount === 0) {
        throw notFound("Setting SPPG tidak ditemukan");
      }

      return reply.send(result.rows[0]);
    }
  );

  app.patch(
    "/settings",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.MASTER_WRITE);
      const sppgId = requireActiveSppg(request);
      const body = z
        .object({
          config: z.record(z.string(), z.unknown())
        })
        .parse(request.body);

      const current = await query<{
        config: Record<string, unknown>;
        config_version: number;
      }>(
        `
          SELECT config, config_version
          FROM sppg_settings
          WHERE sppg_id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [sppgId]
      );
      const row = current.rows[0];
      if (!row) {
        throw notFound("Setting SPPG tidak ditemukan");
      }

      const nextVersion = row.config_version + 1;

      await query(
        `
          UPDATE sppg_settings
          SET config = $2::jsonb,
              config_version = $3,
              effective_from = CURRENT_DATE,
              updated_at = now(),
              updated_by = $4
          WHERE sppg_id = $1
        `,
        [sppgId, JSON.stringify(body.config), nextVersion, request.auth!.user_id]
      );

      await query(
        `
          INSERT INTO sppg_setting_versions (
            id, sppg_id, version, config, changed_by,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            gen_random_uuid(), $1, $2, $3::jsonb, $4,
            now(), $4, now(), $4
          )
        `,
        [sppgId, nextVersion, JSON.stringify(body.config), request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "sppg_settings",
        entityId: sppgId,
        action: "UPDATE",
        oldValue: row,
        newValue: { ...body, config_version: nextVersion },
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({
        sppg_id: sppgId,
        config_version: nextVersion
      });
    }
  );

  app.get(
    "/sppg",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.SPPG_MANAGE);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: { code: "s.code", name: "s.name", status: "s.status", created_at: "s.created_at" },
        fallback: "s.created_at DESC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk sppg");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM sppg s
          WHERE ($1::text IS NULL OR s.status::text = UPPER($1))
            AND ($2::text IS NULL OR s.name ILIKE '%' || $2 || '%' OR s.code ILIKE '%' || $2 || '%')
        `,
        [list.status ?? null, list.search ?? null]
      );

      const result = await query(
        `
          SELECT s.id, s.code, s.name, s.status, s.timezone, ss.config, ss.config_version
          FROM sppg s
          LEFT JOIN sppg_settings ss ON ss.sppg_id = s.id
          WHERE ($1::text IS NULL OR s.status::text = UPPER($1))
            AND ($2::text IS NULL OR s.name ILIKE '%' || $2 || '%' OR s.code ILIKE '%' || $2 || '%')
          ORDER BY ${order.sql}
          LIMIT $3 OFFSET $4
        `
        ,
        [list.status ?? null, list.search ?? null, list.page_size, list.offset]
      );
      return reply.send({
        data: result.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.post(
    "/sppg",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.SPPG_MANAGE);
      const body = createSppgSchema.parse(request.body);
      const sppgId = randomUUID();

      const exists = await query<{ id: string }>("SELECT id FROM sppg WHERE code = $1 LIMIT 1", [body.code]);
      if (exists.rowCount && exists.rowCount > 0) {
        throw conflict("CONFLICT", "Kode SPPG sudah terpakai");
      }

      await query(
        `
          INSERT INTO sppg (
            id, code, name, status, timezone,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            $1, $2, $3, 'PENDING_SETUP', $4,
            now(), $5, now(), $5
          )
        `,
        [sppgId, body.code, body.name, body.timezone, request.auth!.user_id]
      );

      await query(
        `
          INSERT INTO sppg_settings (
            id, sppg_id, config, config_version, effective_from,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            gen_random_uuid(), $1, $2::jsonb, 1, CURRENT_DATE,
            now(), $3, now(), $3
          )
        `,
        [sppgId, JSON.stringify(body.settings), request.auth!.user_id]
      );

      await query(
        `
          INSERT INTO sppg_setting_versions (
            id, sppg_id, version, config, changed_by,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            gen_random_uuid(), $1, 1, $2::jsonb, $3,
            now(), $3, now(), $3
          )
        `,
        [sppgId, JSON.stringify(body.settings), request.auth!.user_id]
      );

      await writeAudit({
        sppgId,
        entityTable: "sppg",
        entityId: sppgId,
        action: "CREATE",
        newValue: body,
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.status(201).send({ id: sppgId, code: body.code, name: body.name, status: "PENDING_SETUP" });
    }
  );

  app.patch(
    "/sppg/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.SPPG_MANAGE);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = patchSppgSchema.parse(request.body);

      const currentResult = await query<{
        name: string;
        status: string;
        timezone: string;
        config: Record<string, unknown>;
        config_version: number;
      }>(
        `
          SELECT s.name, s.status, s.timezone, ss.config, ss.config_version
          FROM sppg s
          LEFT JOIN sppg_settings ss ON ss.sppg_id = s.id
          WHERE s.id = $1
          LIMIT 1
        `,
        [params.id]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw notFound("SPPG tidak ditemukan");
      }

      await query(
        `
          UPDATE sppg
          SET name = COALESCE($2, name),
              status = COALESCE($3, status),
              timezone = COALESCE($4, timezone),
              updated_at = now(),
              updated_by = $5
          WHERE id = $1
        `,
        [params.id, body.name ?? null, body.status ?? null, body.timezone ?? null, request.auth!.user_id]
      );

      if (body.settings) {
        const nextVersion = (current.config_version ?? 0) + 1;
        await query(
          `
            UPDATE sppg_settings
            SET config = $2::jsonb,
                config_version = $3,
                updated_at = now(),
                updated_by = $4
            WHERE sppg_id = $1
          `,
          [params.id, JSON.stringify(body.settings), nextVersion, request.auth!.user_id]
        );

        await query(
          `
            INSERT INTO sppg_setting_versions (
              id, sppg_id, version, config, changed_by,
              created_at, created_by, updated_at, updated_by
            ) VALUES (
              gen_random_uuid(), $1, $2, $3::jsonb, $4,
              now(), $4, now(), $4
            )
          `,
          [params.id, nextVersion, JSON.stringify(body.settings), request.auth!.user_id]
        );
      }

      await writeAudit({
        sppgId: params.id,
        entityTable: "sppg",
        entityId: params.id,
        action: "UPDATE",
        oldValue: current,
        newValue: body,
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.send({ id: params.id, status: body.status ?? current.status });
    }
  );

  app.post(
    "/sppg/:id/assign-user",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.ASSIGN_USER);
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = assignSchema.parse(request.body);

      await query(
        `
          INSERT INTO user_sppg (
            id, user_id, sppg_id, role_scope, is_default, status,
            created_at, created_by, updated_at, updated_by
          ) VALUES (
            gen_random_uuid(), $1, $2, $3::jsonb, $4, $5,
            now(), $6, now(), $6
          )
          ON CONFLICT (user_id, sppg_id)
          DO UPDATE SET
            role_scope = EXCLUDED.role_scope,
            is_default = EXCLUDED.is_default,
            status = EXCLUDED.status,
            updated_at = now(),
            updated_by = EXCLUDED.updated_by
        `,
        [body.user_id, params.id, JSON.stringify(body.role_scope), body.is_default, body.status, request.auth!.user_id]
      );

      await writeAudit({
        sppgId: params.id,
        entityTable: "user_sppg",
        entityId: `${body.user_id}:${params.id}`,
        action: "ASSIGN",
        newValue: body,
        actorUserId: request.auth!.user_id,
        actorRole: request.auth!.roles.join(","),
        requestId: request.id,
        deviceId: request.deviceId,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString()
      });

      return reply.status(200).send({
        user_id: body.user_id,
        sppg_id: params.id,
        role_scope: body.role_scope,
        is_default: body.is_default,
        status: body.status
      });
    }
  );

  app.get(
    "/users",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.SPPG_MANAGE);
      if (!isSuperAdmin(request)) {
        throw new ApiError(403, "PERMISSION_DENIED", "Endpoint hanya untuk SUPER_ADMIN");
      }

      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: { full_name: "u.full_name", email: "u.email", status: "u.status", created_at: "u.created_at" },
        fallback: "u.full_name ASC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk users");
      }
      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM users u
          WHERE ($1::text IS NULL OR u.status::text = UPPER($1))
            AND ($2::text IS NULL OR u.full_name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
        `,
        [list.status ?? null, list.search ?? null]
      );

      const users = await query<{
        id: string;
        email: string;
        full_name: string;
        status: string;
        is_super_admin: boolean;
        created_at: string;
      }>(
        `
          SELECT u.id, u.email, u.full_name, u.status, u.is_super_admin, u.created_at::text
          FROM users u
          WHERE ($1::text IS NULL OR u.status::text = UPPER($1))
            AND ($2::text IS NULL OR u.full_name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
          ORDER BY ${order.sql}
          LIMIT $3 OFFSET $4
        `,
        [list.status ?? null, list.search ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: users.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );

  app.get(
    "/sppg/:id/assignments",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      requirePermission(request, PERMISSIONS.ASSIGN_USER);
      if (!isSuperAdmin(request)) {
        throw new ApiError(403, "PERMISSION_DENIED", "Endpoint hanya untuk SUPER_ADMIN");
      }

      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const list = parseListQuery(request.query);
      const order = resolveOrderBy({
        sortBy: list.sort_by,
        sortDir: list.sort_dir,
        allowed: { full_name: "u.full_name", email: "u.email", status: "us.status", is_default: "us.is_default" },
        fallback: "us.is_default DESC, u.full_name ASC"
      });
      if (!order.valid) {
        throw unprocessable("sort_by tidak valid untuk assignments");
      }

      const total = await query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM user_sppg us
          JOIN users u ON u.id = us.user_id
          WHERE us.sppg_id = $1
            AND ($2::text IS NULL OR us.status::text = UPPER($2))
            AND ($3::text IS NULL OR u.full_name ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
        `,
        [params.id, list.status ?? null, list.search ?? null]
      );

      const assignments = await query<{
        id: string;
        user_id: string;
        email: string;
        full_name: string;
        role_scope: string[];
        is_default: boolean;
        status: string;
      }>(
        `
          SELECT
            us.id,
            us.user_id,
            u.email,
            u.full_name,
            us.role_scope,
            us.is_default,
            us.status
          FROM user_sppg us
          JOIN users u ON u.id = us.user_id
          WHERE us.sppg_id = $1
            AND ($2::text IS NULL OR us.status::text = UPPER($2))
            AND ($3::text IS NULL OR u.full_name ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
          ORDER BY ${order.sql}
          LIMIT $4 OFFSET $5
        `,
        [params.id, list.status ?? null, list.search ?? null, list.page_size, list.offset]
      );

      return reply.send({
        data: assignments.rows,
        ...buildPagingMeta(list.page, list.page_size, Number(total.rows[0]?.total ?? 0))
      });
    }
  );
}
