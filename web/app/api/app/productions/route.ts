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
  productionDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  plannedPortions: z.number().int().nonnegative().optional(),
  producedPortions: z.number().int().nonnegative().optional(),
  notes: z.string().optional()
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "production.read");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const query = parseListQuery(request.nextUrl.searchParams);
  const where = { tenantId, ...(query.status ? { status: query.status as any } : {}) };

  const [rows, total] = await Promise.all([
    prisma.production.findMany({ where, orderBy: { productionDate: "desc" }, skip: (query.page - 1) * query.page_size, take: query.page_size }),
    prisma.production.count({ where })
  ]);

  return ok(toListResponse(rows, total, query.page, query.page_size));
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "production.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload produksi tidak valid", 422, parsed.error.flatten());

  const created = await prisma.production.create({
    data: {
      tenantId,
      productionDate: new Date(parsed.data.productionDate),
      status: "NOT_STARTED",
      plannedPortions: parsed.data.plannedPortions ?? 0,
      producedPortions: parsed.data.producedPortions ?? 0,
      notes: parsed.data.notes
    }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Production",
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
  const denied = await enforceTenantPermission(session, "production.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = (await request.json().catch(() => null)) as { id?: string; status?: string; producedPortions?: number; notes?: string } | null;
  if (!payload?.id) return errorResponse("VALIDATION_ERROR", "id wajib diisi", 422);

  const current = await prisma.production.findFirst({ where: { id: payload.id, tenantId } });
  if (!current) return errorResponse("NOT_FOUND", "Produksi tidak ditemukan", 404);

  if (payload.status && !canTransition("production", current.status, payload.status)) {
    return errorResponse("STATE_TRANSITION_INVALID", `Transisi ${current.status} -> ${payload.status} tidak valid`, 409);
  }

  if (payload.status === "DONE" && (payload.producedPortions ?? current.producedPortions) <= 0) {
    return errorResponse("VALIDATION_ERROR", "Produksi DONE wajib punya porsi > 0", 422);
  }

  const updated = await prisma.production.update({
    where: { id: current.id },
    data: {
      status: (payload.status as any) ?? current.status,
      producedPortions: payload.producedPortions ?? current.producedPortions,
      notes: payload.notes ?? current.notes,
      doneAt: payload.status === "DONE" ? new Date() : current.doneAt
    }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Production",
    entityId: updated.id,
    action: "UPDATE",
    oldValue: current,
    newValue: updated
  });

  return ok(updated);
}

