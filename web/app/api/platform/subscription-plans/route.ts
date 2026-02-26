import { NextRequest } from "next/server";
import { z } from "zod";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { writePlatformAudit } from "@/lib/core/audit";

const createSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.coerce.number().positive(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"])
});

const patchSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  price: z.coerce.number().positive().optional()
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = enforcePlatformPermission(session, "platform.billing.read");
  if (denied) return denied;

  const plans = await prisma.subscriptionPlan.findMany({ include: { features: true, limits: true }, orderBy: { createdAt: "desc" } });
  return ok(plans);
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = enforcePlatformPermission(session, "platform.billing.write");
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload plan tidak valid", 422, parsed.error.flatten());

  const created = await prisma.subscriptionPlan.create({ data: { ...parsed.data, price: parsed.data.price as any, active: true } });

  await writePlatformAudit({
    actorId: session.userId,
    actorRole: session.platformRoles.join(",") || "UNKNOWN",
    entity: "SubscriptionPlan",
    entityId: created.id,
    action: "CREATE",
    oldValue: {},
    newValue: created
  });

  return ok(created, 201);
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = enforcePlatformPermission(session, "platform.billing.write");
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload plan update tidak valid", 422, parsed.error.flatten());

  const current = await prisma.subscriptionPlan.findUnique({ where: { id: parsed.data.id } });
  if (!current) return errorResponse("NOT_FOUND", "Plan tidak ditemukan", 404);

  const updated = await prisma.subscriptionPlan.update({
    where: { id: current.id },
    data: {
      name: parsed.data.name ?? current.name,
      description: parsed.data.description ?? current.description,
      active: parsed.data.active ?? current.active,
      price: (parsed.data.price as any) ?? current.price
    }
  });

  await writePlatformAudit({
    actorId: session.userId,
    actorRole: session.platformRoles.join(",") || "UNKNOWN",
    entity: "SubscriptionPlan",
    entityId: updated.id,
    action: "UPDATE",
    oldValue: current,
    newValue: updated
  });

  return ok(updated);
}

