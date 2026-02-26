import { NextRequest } from "next/server";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;

  const denied = enforcePlatformPermission(session, "platform.audit.read");
  if (denied) return denied;

  const q = parseListQuery(request.nextUrl.searchParams);

  const [rows, total] = await Promise.all([
    prisma.platformAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.page_size,
      take: q.page_size
    }),
    prisma.platformAuditLog.count()
  ]);

  return ok(toListResponse(rows, total, q.page, q.page_size));
}

