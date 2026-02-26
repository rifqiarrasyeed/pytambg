import { NextRequest } from "next/server";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const routeParams = await params;

  const denied = enforcePlatformPermission(session, "platform.tenants.read");
  if (denied) return denied;

  const tenant = await prisma.tenant.findUnique({
    where: { id: routeParams.id },
    include: { subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 } }
  });

  if (!tenant) return errorResponse("NOT_FOUND", "Tenant tidak ditemukan", 404);

  const sub = tenant.subscriptions[0];
  return ok({
    tenantId: tenant.id,
    tenantCode: tenant.code,
    tenantName: tenant.name,
    subscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          planName: sub.plan.name,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          graceUntil: sub.graceUntil
        }
      : null
  });
}
