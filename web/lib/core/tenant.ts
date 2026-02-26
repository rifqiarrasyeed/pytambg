import { prisma } from "@/lib/core/db";
import { errorResponse } from "@/lib/core/errors";

export async function assertTenantResource<T extends { tenantId: string }>(resource: T | null, tenantId: string): Promise<Response | null> {
  if (!resource) {
    return errorResponse("NOT_FOUND", "Data tidak ditemukan", 404);
  }
  if (resource.tenantId !== tenantId) {
    return errorResponse("TENANT_SCOPE_VIOLATION", "Akses lintas tenant ditolak", 403);
  }
  return null;
}

export async function isTenantMemberActive(userId: string, tenantId: string): Promise<boolean> {
  const member = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } }
  });
  return Boolean(member && member.status === "ACTIVE");
}

export async function sanitizeTenantBody<T extends object>(body: T): Promise<T> {
  const next = { ...body } as Record<string, unknown>;
  if ("tenantId" in next) {
    delete next.tenantId;
  }
  if ("tenant_id" in next) {
    delete next.tenant_id;
  }
  return next as T;
}

