import { NextRequest } from "next/server";
import { z } from "zod";
import { withIdempotency } from "@/lib/core/idempotency";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

const schema = z.object({
  stopId: z.string().optional(),
  result: z.enum(["VERIFIED", "MISMATCH"]),
  receivedPortions: z.number().int().nonnegative(),
  note: z.string().optional(),
  evidenceFileObjectId: z.string().optional()
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

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) return errorResponse("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key wajib diisi", 422);

  const payloadRaw = await request.json().catch(() => null);
  const parsed = schema.safeParse(payloadRaw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload verify tidak valid", 422, parsed.error.flatten());

  const stopId = parsed.data.stopId ?? routeParams.id;
  const stop = await prisma.deliveryStop.findFirst({ where: { id: stopId, tenantId } });
  if (!stop) return errorResponse("NOT_FOUND", "Stop delivery tidak ditemukan", 404);

  const idem = await withIdempotency<Record<string, unknown>>(
    `tenant:${tenantId}`,
    `/api/app/deliveries/${routeParams.id}/verify`,
    idempotencyKey,
    { ...parsed.data, stopId },
    async () => {
      const prevVerification = await prisma.verification.findUnique({ where: { stopId } });

      const verification = await prisma.verification.upsert({
        where: { stopId },
        create: {
          tenantId,
          stopId,
          status: parsed.data.result === "VERIFIED" ? "VERIFIED" : "MISMATCH_REPORTED",
          verifiedById: session.userId,
          receivedPortions: parsed.data.receivedPortions,
          note: parsed.data.note,
          verifiedAt: new Date()
        },
        update: {
          status: parsed.data.result === "VERIFIED" ? "VERIFIED" : "MISMATCH_REPORTED",
          verifiedById: session.userId,
          receivedPortions: parsed.data.receivedPortions,
          note: parsed.data.note,
          verifiedAt: new Date()
        }
      });

      if (parsed.data.result === "MISMATCH") {
        if (!parsed.data.note || !parsed.data.evidenceFileObjectId) {
          return {
            status: 422,
            body: {
              error: {
                code: "DISPUTE_EVIDENCE_REQUIRED",
                message: "Mismatch wajib reason + evidence",
                timestamp: new Date().toISOString()
              }
            }
          };
        }

        const dispute = await prisma.dispute.create({
          data: {
            tenantId,
            stopId,
            status: "OPEN",
            reason: parsed.data.note
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
          oldValue: prevVerification ?? {},
          newValue: { verification, dispute }
        });

        return { status: 200, body: { stopId, status: "DISPUTED", dispute: { id: dispute.id } } };
      }

      await prisma.deliveryStop.update({ where: { id: stopId }, data: { status: "VERIFIED" } });

      await writeTenantAudit({
        tenantId,
        actorId: session.userId,
        actorRole: session.tenantRoles.join(",") || "UNKNOWN",
        entity: "Verification",
        entityId: verification.id,
        action: "VERIFY",
        oldValue: prevVerification ?? {},
        newValue: verification
      });

      return { status: 200, body: { stopId, status: "VERIFIED" } };
    }
  );

  if (idem.conflict) return Response.json(idem.body, { status: idem.status });
  return ok(idem.body, idem.status);
}
