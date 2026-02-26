import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

const schema = z.object({
  stopId: z.string().optional(),
  reason: z.string().min(3)
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;

  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const denied = await enforceTenantPermission(session, "verification.write");
  if (denied && !session.tenantRoles.includes("SCHOOL_VERIFIER")) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payloadRaw = await request.json().catch(() => null);
  const parsed = schema.safeParse(payloadRaw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload dispute tidak valid", 422, parsed.error.flatten());

  const stopId = parsed.data.stopId ?? routeParams.id;
  const stop = await prisma.deliveryStop.findFirst({ where: { id: stopId, tenantId } });
  if (!stop) return errorResponse("NOT_FOUND", "Stop tidak ditemukan", 404);

  const dispute = await prisma.dispute.create({
    data: {
      tenantId,
      stopId,
      status: "OPEN",
      reason: parsed.data.reason
    }
  });

  await prisma.deliveryStop.update({ where: { id: stopId }, data: { status: "DISPUTED" } });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Dispute",
    entityId: dispute.id,
    action: "CREATE",
    oldValue: {},
    newValue: dispute
  });

  return ok(dispute, 201);
}
