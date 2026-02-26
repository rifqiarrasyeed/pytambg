import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { enforceTenantPermission, requireSession, requireTenant } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";
import { ensureSubscriptionWritable } from "@/lib/core/subscription";
import { writeTenantAudit } from "@/lib/core/audit";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  roles: z.array(z.string()).min(1)
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = await enforceTenantPermission(session, "master.read");
  if (denied) return denied;

  const tenantId = requireTenant(session);
  if (isResponse(tenantId)) return tenantId;

  const query = parseListQuery(request.nextUrl.searchParams);

  const [members, total] = await Promise.all([
    prisma.tenantMember.findMany({
      where: { tenantId },
      include: { user: true, roles: { include: { role: true } } },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
      orderBy: { createdAt: "desc" }
    }),
    prisma.tenantMember.count({ where: { tenantId } })
  ]);

  const rows = members.map((m) => ({
    id: m.user.id,
    email: m.user.email,
    name: m.user.name,
    roles: m.roles.map((r) => r.role.code)
  }));

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

  const payloadRaw = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payloadRaw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload user tidak valid", 422, parsed.error.flatten());

  const roleRows = await prisma.tenantRole.findMany({ where: { code: { in: parsed.data.roles } } });
  if (roleRows.length !== parsed.data.roles.length) {
    return errorResponse("VALIDATION_ERROR", "Role tenant tidak valid", 422);
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.platformUser.upsert({
    where: { email: parsed.data.email.toLowerCase() },
    create: {
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      passwordHash: hashed
    },
    update: {
      name: parsed.data.name
    }
  });

  const member = await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    create: {
      tenantId,
      userId: user.id,
      status: "ACTIVE"
    },
    update: {
      status: "ACTIVE"
    }
  });

  await prisma.tenantMemberRole.deleteMany({ where: { memberId: member.id } });
  await prisma.tenantMemberRole.createMany({
    data: roleRows.map((role) => ({ memberId: member.id, roleId: role.id }))
  });

  await writeTenantAudit({
    tenantId,
    actorId: session.userId,
    actorRole: session.tenantRoles.join(",") || "UNKNOWN",
    entity: "TenantMember",
    entityId: member.id,
    action: "CREATE",
    oldValue: {},
    newValue: { userId: user.id, roles: parsed.data.roles }
  });

  return ok({ id: user.id, email: user.email, name: user.name, roles: parsed.data.roles }, 201);
}

