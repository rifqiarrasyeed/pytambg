import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { login, logout, refresh } from "./service";
import { writeAudit } from "../../services/audit-service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  active_sppg_id: z.string().uuid().optional(),
  device_id: z.string().max(120).optional()
});

const refreshSchema = z.object({
  refresh_token: z.string().min(20),
  active_sppg_id: z.string().uuid().optional()
});

const logoutSchema = z.object({
  refresh_token: z.string().min(20)
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await login(app, {
      email: body.email,
      password: body.password,
      active_sppg_id: body.active_sppg_id
    });
    if (result.active_sppg_id) {
      try {
        await writeAudit({
          sppgId: result.active_sppg_id,
          entityTable: "sessions_tokens",
          entityId: result.user.id,
          action: "LOGIN_SUCCESS",
          newValue: {
            user_id: result.user.id,
            active_sppg_id: result.active_sppg_id
          },
          actorUserId: result.user.id,
          actorRole: "AUTH_LOGIN",
          requestId: request.id,
          deviceId: body.device_id ?? request.deviceId,
          ip: request.ip,
          userAgent: request.headers["user-agent"]?.toString()
        });
      } catch (error) {
        app.log.warn({ err: error, requestId: request.id }, "Audit login gagal ditulis");
      }
    }
    return reply.status(200).send(result);
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const result = await refresh(app, body);
    const claims = app.jwt.decode(result.access_token) as
      | { user_id?: string; roles?: string[]; active_sppg_id?: string | null }
      | null;
    if (claims?.user_id && result.active_sppg_id) {
      try {
        await writeAudit({
          sppgId: result.active_sppg_id,
          entityTable: "sessions_tokens",
          entityId: claims.user_id,
          action: "TOKEN_REFRESH",
          newValue: {
            user_id: claims.user_id,
            active_sppg_id: result.active_sppg_id
          },
          actorUserId: claims.user_id,
          actorRole: (claims.roles ?? []).join(",") || "AUTH_REFRESH",
          requestId: request.id,
          deviceId: request.deviceId,
          ip: request.ip,
          userAgent: request.headers["user-agent"]?.toString()
        });
      } catch (error) {
        app.log.warn({ err: error, requestId: request.id }, "Audit refresh gagal ditulis");
      }
    }
    return reply.status(200).send(result);
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = logoutSchema.parse(request.body);
    const session = await logout(body);
    if (session?.active_sppg_id) {
      try {
        await writeAudit({
          sppgId: session.active_sppg_id,
          entityTable: "sessions_tokens",
          entityId: session.user_id,
          action: "LOGOUT",
          newValue: {
            user_id: session.user_id,
            active_sppg_id: session.active_sppg_id
          },
          actorUserId: session.user_id,
          actorRole: "AUTH_LOGOUT",
          requestId: request.id,
          deviceId: request.deviceId,
          ip: request.ip,
          userAgent: request.headers["user-agent"]?.toString()
        });
      } catch (error) {
        app.log.warn({ err: error, requestId: request.id }, "Audit logout gagal ditulis");
      }
    }
    return reply.status(204).send();
  });
}
