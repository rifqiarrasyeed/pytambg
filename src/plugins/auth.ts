import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config";
import type { JwtClaims } from "../types";
import { unauthorized } from "../utils/api-error";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    signAccessToken: (claims: JwtClaims) => string;
  }
}

export const authPlugin = fp(async (app) => {
  await app.register(jwt, {
    secret: config.jwtAccessSecret
  });

  app.decorate("signAccessToken", (claims: JwtClaims) => {
    return app.jwt.sign(claims, { expiresIn: config.jwtAccessTtl });
  });

  app.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify<JwtClaims>();
      const claims = request.user as JwtClaims;
      request.auth = claims;
      request.activeSppgId = claims.active_sppg_id;
      request.deviceId = request.headers["x-device-id"]?.toString();
    } catch {
      throw unauthorized("Token access tidak valid");
    }
  });
});