import { NextRequest } from "next/server";
import { z } from "zod";
import { canTransition } from "@/lib/core/state-machines";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";
import { generateDocNo } from "@/lib/core/utils";

const createSchema = z.object({
  manifestNo: z.string().optional(),
  routeId: z.string().optional(),
  driverMemberId: z.string().optional(),
  plannedDeparture: z.string().datetime().optional(),
  stops: z.array(z.object({ schoolId: z.string(), plannedPortions: z.number().int().nonnegative() })).optional()
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "delivery.read");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const view = request.nextUrl.searchParams.get("view");
  if (view === "verification") {
    const rows = await prisma.deliveryStop.findMany({
      where: { tenantId, status: { in: ["DELIVERED", "DISPUTED", "RESOLVED"] } },
      include: { school: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    });

    return ok({
      data: rows.map((row) => ({
        stopId: row.id,
        schoolName: row.school.name,
        status: row.status,
        plannedPortions: row.plannedPortions,
        deliveredPortions: row.deliveredPortions
      }))
    });
  }

  if (view === "disputes") {
    const rows = await prisma.dispute.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" }, take: 100 });
    return ok({ data: rows });
  }

  const query = parseListQuery(request.nextUrl.searchParams);
  const where = {
    tenantId,
    ...(query.status ? { status: query.status as any } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.delivery.findMany({
      where,
      include: { route: true, stops: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    }),
    prisma.delivery.count({ where })
  ]);

  return ok(toListResponse(rows, total, query.page, query.page_size));
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "delivery.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload delivery tidak valid", 422, parsed.error.flatten());

  const route = parsed.data.routeId
    ? await prisma.route.findFirst({ where: { id: parsed.data.routeId, tenantId } })
    : await prisma.route.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } });

  if (!route) return errorResponse("PRECONDITION_FAILED", "Belum ada route aktif pada tenant", 409);

  const stopsInput = parsed.data.stops ??
    (await prisma.routeStop.findMany({ where: { tenantId, routeId: route.id }, orderBy: { stopOrder: "asc" } })).map((s) => ({
      schoolId: s.schoolId,
      plannedPortions: 0
    }));

  const created = await prisma.delivery.create({
    data: {
      tenantId,
      manifestNo: parsed.data.manifestNo?.trim() || generateDocNo("MNF"),
      routeId: route.id,
      driverMemberId: parsed.data.driverMemberId,
      plannedDeparture: parsed.data.plannedDeparture ? new Date(parsed.data.plannedDeparture) : null,
      status: "PLANNED",
      stops: {
        create: stopsInput.map((stop) => ({
          tenantId,
          schoolId: stop.schoolId,
          plannedPortions: stop.plannedPortions,
          status: "PLANNED"
        }))
      },
      statusLogs: {
        create: {
          tenantId,
          fromStatus: null,
          toStatus: "PLANNED",
          changedById: session.userId,
          note: "Manifest created"
        }
      }
    },
    include: { stops: true }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Delivery",
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

  const tenantDenied = await enforceTenantPermission(session, "delivery.write");
  const driverDenied = session.tenantRoles.includes("TENANT_DRIVER") ? null : tenantDenied;
  if (driverDenied) return driverDenied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = (await request.json().catch(() => null)) as { id?: string; status?: string; note?: string } | null;
  if (!payload?.id || !payload.status) return errorResponse("VALIDATION_ERROR", "id dan status wajib diisi", 422);

  const current = await prisma.delivery.findFirst({ where: { id: payload.id, tenantId } });
  if (!current) return errorResponse("NOT_FOUND", "Delivery tidak ditemukan", 404);

  if (!canTransition("delivery", current.status, payload.status)) {
    return errorResponse("STATE_TRANSITION_INVALID", `Transisi ${current.status} -> ${payload.status} tidak valid`, 409);
  }

  const updated = await prisma.delivery.update({
    where: { id: current.id },
    data: {
      status: payload.status as any,
      loadedAt: payload.status === "LOADED" ? new Date() : current.loadedAt,
      inTransitAt: payload.status === "IN_TRANSIT" ? new Date() : current.inTransitAt,
      deliveredAt: payload.status === "DELIVERED" ? new Date() : current.deliveredAt,
      verifiedAt: payload.status === "VERIFIED" ? new Date() : current.verifiedAt,
      statusLogs: {
        create: {
          tenantId,
          fromStatus: current.status,
          toStatus: payload.status as any,
          changedById: session.userId,
          note: payload.note
        }
      }
    }
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Delivery",
    entityId: updated.id,
    action: "STATUS_CHANGE",
    oldValue: current,
    newValue: updated,
    reason: payload.note
  });

  return ok(updated);
}

