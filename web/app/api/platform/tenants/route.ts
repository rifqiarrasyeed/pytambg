import { NextRequest } from "next/server";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const denied = enforcePlatformPermission(session, "platform.tenants.read");
  if (denied) return denied;

  const q = parseListQuery(request.nextUrl.searchParams);
  const [rows, total] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
        members: {
          include: { user: true, roles: { include: { role: true } } },
          where: { roles: { some: { role: { code: "TENANT_OWNER" } } } }
        }
      },
      skip: (q.page - 1) * q.page_size,
      take: q.page_size,
      orderBy: { createdAt: "desc" }
    }),
    prisma.tenant.count()
  ]);

  const mapped = rows.map((tenant) => {
    const owner = tenant.members[0]?.user;
    const sub = tenant.subscriptions[0];

    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      ownerEmail: owner?.email ?? null,
      subscriptionStatus: sub?.status ?? "TRIAL",
      planName: sub?.plan.name ?? null,
      lastActiveAt: owner?.lastActiveAt ?? null
    };
  });

  return ok(toListResponse(mapped, total, q.page, q.page_size));
}

