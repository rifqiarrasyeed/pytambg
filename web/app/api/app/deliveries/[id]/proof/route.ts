import { NextRequest } from "next/server";
import { z } from "zod";
import { withIdempotency } from "@/lib/core/idempotency";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

const schema = z.object({
  stopId: z.string(),
  fileObjectId: z.string(),
  proofType: z.string().default("PHOTO"),
  deliveredPortions: z.number().int().nonnegative().optional()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;

  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const denied = await enforceTenantPermission(session, "delivery.proof");
  if (denied && !session.tenantRoles.includes("TENANT_DRIVER")) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) return errorResponse("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key wajib diisi", 422);

  const payloadRaw = await request.json().catch(() => null);
  const parsed = schema.safeParse(payloadRaw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload proof tidak valid", 422, parsed.error.flatten());

  const delivery = await prisma.delivery.findFirst({ where: { id: routeParams.id, tenantId } });
  if (!delivery) return errorResponse("NOT_FOUND", "Delivery tidak ditemukan", 404);

  const stop = await prisma.deliveryStop.findFirst({ where: { id: parsed.data.stopId, deliveryId: routeParams.id, tenantId } });
  if (!stop) return errorResponse("NOT_FOUND", "Stop tidak ditemukan", 404);

  const file = await prisma.fileObject.findFirst({ where: { id: parsed.data.fileObjectId, tenantId } });
  if (!file) return errorResponse("NOT_FOUND", "File proof tidak ditemukan", 404);

  const idem = await withIdempotency<Record<string, unknown>>(
    `tenant:${tenantId}`,
    `/api/app/deliveries/${routeParams.id}/proof`,
    idempotencyKey,
    parsed.data,
    async () => {
      const created = await prisma.deliveryProof.create({
        data: {
          tenantId,
          deliveryId: routeParams.id,
          stopId: stop.id,
          fileObjectId: parsed.data.fileObjectId,
          proofType: parsed.data.proofType
        }
      });

      const nextStop = await prisma.deliveryStop.update({
        where: { id: stop.id },
        data: {
          status: "DELIVERED",
          deliveredPortions: parsed.data.deliveredPortions ?? stop.deliveredPortions
        }
      });

      await writeTenantAudit({
        tenantId,
        actorId: session.userId,
        actorRole: session.tenantRoles.join(",") || "UNKNOWN",
        entity: "DeliveryProof",
        entityId: created.id,
        action: "CREATE",
        oldValue: stop,
        newValue: nextStop
      });

      return { status: 201, body: { id: created.id, stopId: stop.id, status: "RECORDED" } };
    }
  );

  if (idem.conflict) return Response.json(idem.body, { status: idem.status });
  return ok(idem.body, idem.status);
}
