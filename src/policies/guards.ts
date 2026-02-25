import type { FastifyRequest } from "fastify";
import type { Permission } from "../types";
import { hasPermission } from "./permissions";
import { ApiError, unauthorized } from "../utils/api-error";

export function requireAuth(request: FastifyRequest): void {
  if (!request.auth) {
    throw unauthorized();
  }
}

export function requireActiveSppg(request: FastifyRequest): string {
  requireAuth(request);
  const activeSppgId = request.activeSppgId;
  if (!request.auth?.is_super_admin && !activeSppgId) {
    throw new ApiError(400, "ACTIVE_SPPG_REQUIRED", "Active SPPG wajib untuk user non-superadmin");
  }
  return activeSppgId ?? "";
}

export function requirePermission(request: FastifyRequest, permission: Permission): void {
  requireAuth(request);
  if (request.auth?.is_super_admin) {
    return;
  }
  if (!request.auth || !hasPermission(request.auth.roles, permission)) {
    throw new ApiError(403, "PERMISSION_DENIED", `Role tidak memiliki izin: ${permission}`);
  }
}

export function isSuperAdmin(request: FastifyRequest): boolean {
  return Boolean(request.auth?.is_super_admin);
}
