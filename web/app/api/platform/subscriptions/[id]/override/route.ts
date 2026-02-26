import { NextRequest } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { writePlatformAudit } from "@/lib/core/audit";

const schema = z.object({
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"]),
  reason: z.string().min(3)
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const routeParams = await params;
  const denied = enforcePlatformPermission(session, "platform.billing.write");
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload override tidak valid", 422, parsed.error.flatten());

  const current = await prisma.subscription.findUnique({ where: { id: routeParams.id } });
  if (!current) return errorResponse("NOT_FOUND", "Subscription tidak ditemukan", 404);

  const updated = await prisma.subscription.update({
    where: { id: current.id },
    data: {
      status: parsed.data.status,
      graceUntil: parsed.data.status === "PAST_DUE" ? addDays(new Date(), 7) : current.graceUntil
    }
  });

  await writePlatformAudit({
    actorId: session.userId,
    actorRole: session.platformRoles.join(",") || "UNKNOWN",
    entity: "Subscription",
    entityId: updated.id,
    action: "MANUAL_OVERRIDE",
    oldValue: current,
    newValue: updated,
    reason: parsed.data.reason
  });

  return ok(updated);
}
