import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

const schema = z.object({
  resolution: z.string().min(3),
  stockAction: z.enum(["NONE", "WASTE", "RETURN", "ADJUSTMENT"]).default("NONE")
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;

  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "verification.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payloadRaw = await request.json().catch(() => null);
  const parsed = schema.safeParse(payloadRaw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload resolve tidak valid", 422, parsed.error.flatten());

  const dispute = await prisma.dispute.findFirst({ where: { id: routeParams.id, tenantId } });
  if (!dispute) return errorResponse("NOT_FOUND", "Dispute tidak ditemukan", 404);

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: "RESOLVED",
      resolution: parsed.data.resolution,
      resolvedById: session.userId,
      resolvedAt: new Date()
    }
  });

  await prisma.deliveryStop.update({ where: { id: dispute.stopId }, data: { status: "RESOLVED" } });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Dispute",
    entityId: updated.id,
    action: "RESOLVE",
    oldValue: dispute,
    newValue: { ...updated, stockAction: parsed.data.stockAction },
    reason: parsed.data.resolution
  });

  return ok({ ...updated, stockAction: parsed.data.stockAction });
}
