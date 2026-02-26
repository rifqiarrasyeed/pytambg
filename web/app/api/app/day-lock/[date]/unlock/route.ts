import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

const schema = z.object({ reason: z.string().min(3) });

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

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "reason wajib diisi", 422, parsed.error.flatten());

  const targetDate = new Date(routeParams.date);
  if (Number.isNaN(targetDate.getTime())) {
    return errorResponse("VALIDATION_ERROR", "Tanggal unlock tidak valid", 422);
  }

  const plan = await prisma.dailyPlan.findFirst({ where: { tenantId, planDate: targetDate } });
  if (!plan) return errorResponse("NOT_FOUND", "Plan tanggal tersebut tidak ditemukan", 404);

  const updated = await prisma.dailyPlan.update({
    where: { id: plan.id },
    data: { status: "APPROVED", updatedById: session.userId }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "DailyPlan",
    entityId: plan.id,
    action: "UNLOCK",
    oldValue: plan,
    newValue: updated,
    reason: parsed.data.reason
  });

  return ok(updated);
}
