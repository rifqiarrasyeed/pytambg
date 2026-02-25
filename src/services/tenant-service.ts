import type { FastifyRequest } from "fastify";
import { forbidden, notFound } from "../utils/api-error";

export function tenantClause(request: FastifyRequest, alias = ""): { sql: string; params: unknown[] } {
  if (request.auth?.is_super_admin) {
    return { sql: "", params: [] };
  }

  if (!request.activeSppgId) {
    throw forbidden("Active SPPG tidak tersedia");
  }

  const prefix = alias ? `${alias}.` : "";
  return { sql: `${prefix}sppg_id = $1`, params: [request.activeSppgId] };
}

export function assertTenantResource(
  resourceSppgId: string,
  activeSppgId: string | null,
  isSuperAdmin: boolean
): void {
  if (isSuperAdmin) {
    return;
  }
  if (!activeSppgId || resourceSppgId !== activeSppgId) {
    throw notFound("Resource tidak ditemukan pada SPPG aktif");
  }
}