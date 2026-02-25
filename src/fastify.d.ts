import "fastify";
import type { JwtClaims } from "./types";

declare module "fastify" {
  interface FastifyRequest {
    auth?: JwtClaims;
    activeSppgId?: string | null;
    deviceId?: string;
  }
}