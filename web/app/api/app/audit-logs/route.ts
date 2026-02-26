import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";

const filterSchema = z.object({
  entity: z.string().optional(),
  entity_id: z.string().optional(),
  action: z.string().optional(),
  actor_id: z.string().optional()
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "audit.read");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const list = parseListQuery(request.nextUrl.searchParams);
  const parsed = filterSchema.safeParse({
    entity: request.nextUrl.searchParams.get("entity") ?? undefined,
    entity_id: request.nextUrl.searchParams.get("entity_id") ?? undefined,
    action: request.nextUrl.searchParams.get("action") ?? undefined,
    actor_id: request.nextUrl.searchParams.get("actor_id") ?? undefined
  });
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Filter audit tidak valid", 422, parsed.error.flatten());

  const where = {
    tenantId,
    ...(parsed.data.entity ? { entity: parsed.data.entity } : {}),
    ...(parsed.data.entity_id ? { entityId: parsed.data.entity_id } : {}),
    ...(parsed.data.action ? { action: parsed.data.action } : {}),
    ...(parsed.data.actor_id ? { actorId: parsed.data.actor_id } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.tenantAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (list.page - 1) * list.page_size, take: list.page_size }),
    prisma.tenantAuditLog.count({ where })
  ]);

  return ok(toListResponse(rows, total, list.page, list.page_size));
}

