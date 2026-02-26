import { NextRequest } from "next/server";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { canTransition } from "@/lib/core/state-machines";
import { writeTenantAudit } from "@/lib/core/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const denied = await enforceTenantPermission(session, "plan.approve");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const current = await prisma.dailyPlan.findFirst({ where: { id: routeParams.id, tenantId } });
  if (!current) return errorResponse("NOT_FOUND", "Plan tidak ditemukan", 404);

  if (!canTransition("plan", current.status, "APPROVED")) {
    return errorResponse("STATE_TRANSITION_INVALID", `Plan status ${current.status} tidak bisa di-approve`, 409);
  }

  if (current.createdById && current.createdById === session.userId) {
    return errorResponse("SELF_APPROVAL_FORBIDDEN", "Plan tidak boleh approve oleh pembuat yang sama", 409);
  }

  const updated = await prisma.dailyPlan.update({
    where: { id: current.id },
    data: { status: "APPROVED", approvedById: session.userId, approvedAt: new Date(), updatedById: session.userId }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "DailyPlan",
    entityId: updated.id,
    action: "APPROVE",
    oldValue: current,
    newValue: updated
  });

  return ok(updated);
}
