import { NextRequest } from "next/server";
import { z } from "zod";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { writePlatformAudit } from "@/lib/core/audit";

const schema = z.object({
  gracePeriodDays: z.number().int().min(1).max(90)
});

export async function PATCH(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = enforcePlatformPermission(session, "platform.billing.write");
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "gracePeriodDays tidak valid", 422, parsed.error.flatten());

  const current = (await prisma.platformSetting.findFirst()) ?? (await prisma.platformSetting.create({ data: {} }));

  const updated = await prisma.platformSetting.update({
    where: { id: current.id },
    data: { gracePeriodDays: parsed.data.gracePeriodDays, updatedById: session.userId }
  });

  await writePlatformAudit({
    actorId: session.userId,
    actorRole: session.platformRoles.join(",") || "UNKNOWN",
    entity: "PlatformSetting",
    entityId: updated.id,
    action: "UPDATE_GRACE_PERIOD",
    oldValue: current,
    newValue: updated
  });

  return ok(updated);
}

