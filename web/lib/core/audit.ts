import { prisma } from "@/lib/core/db";

type TenantAuditInput = {
  tenantId: string;
  actorId?: string | null;
  actorRole: string;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeTenantAudit(input: TenantAuditInput) {
  await prisma.tenantAuditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      oldValue: (input.oldValue ?? {}) as any,
      newValue: (input.newValue ?? {}) as any,
      reason: input.reason,
      ip: input.ip,
      userAgent: input.userAgent
    }
  });
}

type PlatformAuditInput = {
  actorId?: string | null;
  actorRole: string;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writePlatformAudit(input: PlatformAuditInput) {
  await prisma.platformAuditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      oldValue: (input.oldValue ?? {}) as any,
      newValue: (input.newValue ?? {}) as any,
      reason: input.reason,
      ip: input.ip,
      userAgent: input.userAgent
    }
  });
}

