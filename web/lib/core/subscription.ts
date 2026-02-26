import { prisma } from "@/lib/core/db";
import { SubscriptionStatus } from "@prisma/client";
import { env } from "@/lib/core/env";

const readOnlyStatuses = new Set<SubscriptionStatus>(["PAST_DUE", "SUSPENDED", "CANCELED"]);

export async function getTenantSubscriptionStatus(tenantId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" }
  });

  if (!subscription) {
    return { status: "TRIAL" as SubscriptionStatus, blocked: false, graceUntil: null };
  }

  const now = new Date();
  const graceUntil = subscription.graceUntil;
  const inGrace = graceUntil ? graceUntil > now : false;

  return {
    status: subscription.status,
    blocked: readOnlyStatuses.has(subscription.status) && !inGrace,
    graceUntil
  };
}

export async function ensureSubscriptionWritable(tenantId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const state = await getTenantSubscriptionStatus(tenantId);

  if (!state.blocked) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Subscription ${state.status} melewati grace period (${env.subscriptionGraceDays} hari).`
  };
}

