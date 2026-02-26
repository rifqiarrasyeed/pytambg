import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/core/auth-options";
import { errorResponse } from "@/lib/core/errors";
import { prisma } from "@/lib/core/db";
import { hasPlatformPermission, hasTenantPermission } from "@/lib/core/rbac";
import type { NextRequest } from "next/server";

export type SessionContext = {
  userId: string;
  activeTenantId: string | null;
  tenantRoles: string[];
  platformRoles: string[];
};

export async function requireSession(request?: NextRequest): Promise<SessionContext | Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return errorResponse("UNAUTHENTICATED", "Sesi login tidak valid", 401);
  }

  const tenantOverride = request?.cookies.get("mbg_active_tenant")?.value ?? null;

  return {
    userId: session.user.id,
    activeTenantId: tenantOverride || session.activeTenantId || null,
    tenantRoles: session.tenantRoles ?? [],
    platformRoles: session.platformRoles ?? []
  };
}

export function requireTenant(ctx: SessionContext): string | Response {
  if (!ctx.activeTenantId) {
    return errorResponse("ACTIVE_TENANT_REQUIRED", "Pilih tenant aktif terlebih dahulu", 400);
  }
  return ctx.activeTenantId;
}

export async function resolveTenantRoles(userId: string, tenantId: string): Promise<string[]> {
  const membership = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { roles: { include: { role: true } } }
  });
  if (!membership || membership.status !== "ACTIVE") {
    return [];
  }
  return membership.roles.map((row) => row.role.code);
}

export async function enforceTenantPermission(ctx: SessionContext, permission: string): Promise<Response | null> {
  const tenantId = ctx.activeTenantId;
  if (!tenantId) {
    return errorResponse("ACTIVE_TENANT_REQUIRED", "Tenant aktif wajib dipilih", 400);
  }

  const roles = await resolveTenantRoles(ctx.userId, tenantId);
  if (!hasTenantPermission(roles, permission) && !ctx.platformRoles.includes("PLATFORM_ADMIN")) {
    return errorResponse("FORBIDDEN", "Tidak memiliki permission tenant", 403);
  }
  return null;
}

export function enforcePlatformPermission(ctx: SessionContext, permission: string): Response | null {
  if (!hasPlatformPermission(ctx.platformRoles, permission)) {
    return errorResponse("FORBIDDEN", "Tidak memiliki permission platform", 403);
  }
  return null;
}

