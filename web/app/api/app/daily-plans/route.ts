import { NextRequest } from "next/server";
import { z } from "zod";
import { canTransition } from "@/lib/core/state-machines";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

const createSchema = z.object({
  planDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  menuSummary: z.string().optional(),
  items: z.array(z.object({ schoolId: z.string(), targetPortions: z.number().int().positive() })).optional()
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "plan.read");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const query = parseListQuery(request.nextUrl.searchParams);
  const where = {
    tenantId,
    ...(query.status ? { status: query.status as any } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.dailyPlan.findMany({
      where,
      include: { items: true },
      orderBy: { planDate: "desc" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    }),
    prisma.dailyPlan.count({ where })
  ]);

  return ok(toListResponse(rows, total, query.page, query.page_size));
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "plan.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload plan tidak valid", 422, parsed.error.flatten());

  const planDate = new Date(parsed.data.planDate);

  const created = await prisma.dailyPlan.create({
    data: {
      tenantId,
      planDate,
      menuSummary: parsed.data.menuSummary,
      status: "DRAFT",
      createdById: session.userId,
      updatedById: session.userId,
      items: parsed.data.items
        ? {
            create: parsed.data.items.map((item) => ({
              tenantId,
              schoolId: item.schoolId,
              targetPortions: item.targetPortions
            }))
          }
        : undefined
    },
    include: { items: true }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "DailyPlan",
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
  const denied = await enforceTenantPermission(session, "plan.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = (await request.json().catch(() => null)) as { id?: string; menuSummary?: string; status?: string } | null;
  if (!payload?.id) return errorResponse("VALIDATION_ERROR", "id wajib diisi", 422);

  const current = await prisma.dailyPlan.findFirst({ where: { id: payload.id, tenantId } });
  if (!current) return errorResponse("NOT_FOUND", "Plan tidak ditemukan", 404);

  if (payload.status && !canTransition("plan", current.status, payload.status)) {
    return errorResponse("STATE_TRANSITION_INVALID", `Transisi ${current.status} -> ${payload.status} tidak valid`, 409);
  }

  const updated = await prisma.dailyPlan.update({
    where: { id: payload.id },
    data: {
      menuSummary: payload.menuSummary ?? current.menuSummary,
      status: (payload.status as any) ?? current.status,
      updatedById: session.userId
    }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "DailyPlan",
    entityId: updated.id,
    action: "UPDATE",
    oldValue: current,
    newValue: updated
  });

  return ok(updated);
}

