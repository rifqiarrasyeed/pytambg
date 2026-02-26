import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";
import { requestMeta } from "@/lib/core/request";

const createSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2)
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "master.read");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const query = parseListQuery(request.nextUrl.searchParams);
  const where = {
    tenantId,
    ...(query.search ? { OR: [{ code: { contains: query.search, mode: "insensitive" as const } }, { name: { contains: query.search, mode: "insensitive" as const } }] } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.route.findMany({ where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.page_size, take: query.page_size }),
    prisma.route.count({ where })
  ]);

  return ok(toListResponse(rows, total, query.page, query.page_size));
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "master.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload route tidak valid", 422, parsed.error.flatten());

  const created = await prisma.route.create({ data: { tenantId, ...parsed.data } });

  const meta = requestMeta(request);
  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Route",
    entityId: created.id,
    action: "CREATE",
    oldValue: {},
    newValue: created,
    ip: meta.ip,
    userAgent: meta.userAgent
  });

  return ok(created, 201);
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "master.write");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const writable = await ensureSubscriptionWritable(tenantId);
  if (!writable.ok) return errorResponse("SUBSCRIPTION_BLOCKED", writable.reason, 403);

  const payload = (await request.json().catch(() => null)) as { id?: string; name?: string } | null;
  if (!payload?.id) return errorResponse("VALIDATION_ERROR", "id wajib diisi", 422);

  const current = await prisma.route.findFirst({ where: { id: payload.id, tenantId } });
  if (!current) return errorResponse("NOT_FOUND", "Route tidak ditemukan", 404);

  const updated = await prisma.route.update({ where: { id: payload.id }, data: { name: payload.name ?? current.name } });

  const meta = requestMeta(request);
  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "Route",
    entityId: updated.id,
    action: "UPDATE",
    oldValue: current,
    newValue: updated,
    ip: meta.ip,
    userAgent: meta.userAgent
  });

  return ok(updated);
}

