import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { login, logout, refresh } from "./service";

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
    return reply.status(200).send(result);
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const result = await refresh(app, body);
    return reply.status(200).send(result);
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = logoutSchema.parse(request.body);
    await logout(body);
    return reply.status(204).send();
  });
}
