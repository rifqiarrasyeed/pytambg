import { NextRequest } from "next/server";
import { prisma } from "@/lib/core/db";
import { ok } from "@/lib/core/errors";

export async function GET(_request: NextRequest) {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: [{ price: "asc" }],
    include: { features: true, limits: true }
  });

  return ok(
    plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      price: plan.price.toString(),
      interval: plan.interval,
      features: plan.features,
      limits: plan.limits
    }))
  );
}

