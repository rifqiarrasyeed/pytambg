import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { errorResponse, isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";
import { writePlatformAudit } from "@/lib/core/audit";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  platformRoles: z.array(z.enum(["PLATFORM_ADMIN", "PLATFORM_OPS"]))
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = enforcePlatformPermission(session, "platform.tenants.read");
  if (denied) return denied;

  const q = parseListQuery(request.nextUrl.searchParams);
  const [rows, total] = await Promise.all([
    prisma.platformUser.findMany({
      include: { platformRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.page_size,
      take: q.page_size
    }),
    prisma.platformUser.count()
  ]);

  return ok(
    toListResponse(
      rows.map((row) => ({ id: row.id, email: row.email, name: row.name, roles: row.platformRoles.map((r) => r.role.code) })),
      total,
      q.page,
      q.page_size
    )
  );
}

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = enforcePlatformPermission(session, "platform.staff.write");
  if (denied) return denied;

  const raw = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Payload staff tidak valid", 422, parsed.error.flatten());

  const roles = await prisma.platformRole.findMany({ where: { code: { in: parsed.data.platformRoles } } });
  if (roles.length !== parsed.data.platformRoles.length) return errorResponse("VALIDATION_ERROR", "Role platform tidak valid", 422);

  const hashed = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.platformUser.upsert({
    where: { email: parsed.data.email.toLowerCase() },
    create: {
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      passwordHash: hashed
    },
    update: {
      name: parsed.data.name,
      isActive: true
    }
  });

  await prisma.platformUserRole.deleteMany({ where: { userId: user.id } });
  await prisma.platformUserRole.createMany({ data: roles.map((r) => ({ userId: user.id, roleId: r.id })) });

  await writePlatformAudit({
    actorId: session.userId,
    actorRole: session.platformRoles.join(",") || "UNKNOWN",
    entity: "PlatformUser",
    entityId: user.id,
    action: "UPSERT_STAFF",
    oldValue: {},
    newValue: { email: user.email, roles: parsed.data.platformRoles }
  });

  return ok({ id: user.id, email: user.email, name: user.name, roles: parsed.data.platformRoles }, 201);
}

