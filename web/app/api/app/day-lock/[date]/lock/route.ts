import { NextRequest } from "next/server";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const routeParams = await params;

  const denied = await enforceTenantPermission(session, "settings.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const targetDate = new Date(routeParams.date);
  if (Number.isNaN(targetDate.getTime())) {
    return errorResponse("VALIDATION_ERROR", "Tanggal lock tidak valid", 422);
  }

  const plan = await prisma.dailyPlan.findFirst({ where: { tenantId, planDate: targetDate } });
  if (!plan) return errorResponse("NOT_FOUND", "Plan tanggal tersebut tidak ditemukan", 404);

  const updated = await prisma.dailyPlan.update({
    where: { id: plan.id },
    data: { status: "LOCKED", lockedAt: new Date(), updatedById: session.userId }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "DailyPlan",
    entityId: plan.id,
    action: "LOCK",
    oldValue: plan,
    newValue: updated
  });

  return ok(updated);
}
