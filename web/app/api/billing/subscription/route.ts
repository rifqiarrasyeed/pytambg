import { NextRequest } from "next/server";
import { requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId },
    include: { plan: true },
    orderBy: { createdAt: "desc" }
  });

  if (!subscription) {
    return ok({ status: "TRIAL", planName: "Trial", graceUntil: null });
  }

  return ok({
    status: subscription.status,
    planName: subscription.plan.name,
    graceUntil: subscription.graceUntil
  });
}

