import { NextRequest } from "next/server";
import { z } from "zod";
import { createSnapTransaction } from "@/lib/core/midtrans";
import { requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { generateDocNo } from "@/lib/core/utils";
import { env } from "@/lib/core/env";
import { writeTenantAudit } from "@/lib/core/audit";

const schema = z.object({
  planId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "planId wajib diisi", 422, parsed.error.flatten());

  const [plan, user, tenant] = await Promise.all([
    prisma.subscriptionPlan.findUnique({ where: { id: parsed.data.planId } }),
    prisma.platformUser.findUnique({ where: { id: session.userId } }),
    prisma.tenant.findUnique({ where: { id: tenantId } })
  ]);

  if (!plan || !plan.active) return errorResponse("NOT_FOUND", "Plan tidak ditemukan", 404);
  if (!user || !tenant) return errorResponse("NOT_FOUND", "User/Tenant tidak ditemukan", 404);

  let subscription = await prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: "TRIAL",
        trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * env.subscriptionGraceDays)
      }
    });
  }

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      subscriptionId: subscription.id,
      planId: plan.id,
      invoiceNo: generateDocNo("INV"),
      amount: plan.price,
      status: "OPEN",
      dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * env.subscriptionGraceDays),
      providerOrderId: generateDocNo("ORD")
    }
  });

  let snapToken: string | null = null;
  let redirectUrl: string | null = null;

  if (env.MIDTRANS_SERVER_KEY && env.MIDTRANS_CLIENT_KEY) {
    const snap = await createSnapTransaction({
      orderId: invoice.providerOrderId ?? invoice.invoiceNo,
      grossAmount: Number(invoice.amount),
      customer: {
        firstName: user.name,
        email: user.email,
        phone: tenant.picContact
      },
      callbacks: {
        finish: `${env.APP_URL}/app/billing`,
        pending: `${env.APP_URL}/app/billing`,
        error: `${env.APP_URL}/app/billing`
      }
    });

    snapToken = snap.token;
    redirectUrl = snap.redirectUrl;

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        providerPayload: snap.raw as any
      }
    });
  }

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Subscription",
    entityId: subscription.id,
    action: "SUBSCRIBE_INTENT",
    oldValue: {},
    newValue: { invoiceId: invoice.id, planId: plan.id }
  });

  return ok({ invoiceId: invoice.id, subscriptionId: subscription.id, snapToken, redirectUrl }, 201);
}

