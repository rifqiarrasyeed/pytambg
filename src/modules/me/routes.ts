import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../../db/pool";
import { requireAuth } from "../../policies/guards";
import { permissionsForRoles } from "../../policies/permissions";
import { getMySppg, switchActiveSppg } from "../auth/service";

const switchSchema = z.object({
  sppg_id: z.string().uuid()
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/me/sppg",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      requireAuth(request);
      const assignments = await getMySppg(request.auth!.user_id);
      return reply.send({ assignments, active_sppg_id: request.activeSppgId ?? null });
    }
  );

  app.post(
    "/me/active-sppg",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      requireAuth(request);
      const body = switchSchema.parse(request.body);
      const switched = await switchActiveSppg(app, {
        userId: request.auth!.user_id,
        sessionId: request.auth!.session_id,
        sppgId: body.sppg_id,
        isSuperAdmin: request.auth!.is_super_admin
      });

      return reply.send(switched);
    }
  );

  app.get(
    "/me/context",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      requireAuth(request);

      const user = await query<{ id: string; email: string; full_name: string }>(
        "SELECT id, email, full_name FROM users WHERE id = $1 LIMIT 1",
        [request.auth!.user_id]
      );

      return reply.send({
        user: user.rows[0] ?? {
          id: request.auth!.user_id,
          email: null,
          full_name: null
        },
        active_sppg_id: request.activeSppgId ?? null,
        roles: request.auth!.roles,
        permissions: permissionsForRoles(request.auth!.roles),
        is_super_admin: request.auth!.is_super_admin
      });
    }
  );
}
