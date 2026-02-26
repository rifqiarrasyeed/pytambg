import { NextRequest } from "next/server";
import { enforcePlatformPermission, requireSession } from "@/lib/core/auth";
import { prisma } from "@/lib/core/db";
import { isResponse, ok } from "@/lib/core/errors";
import { parseListQuery, toListResponse } from "@/lib/core/pagination";

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (isResponse(session)) return session;
  const denied = enforcePlatformPermission(session, "platform.billing.read");
  if (denied) return denied;

  const q = parseListQuery(request.nextUrl.searchParams);

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      include: { tenant: true },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.page_size,
      take: q.page_size
    }),
    prisma.invoice.count()
  ]);

  return ok(
    toListResponse(
      rows.map((row) => ({
        id: row.id,
        invoiceNo: row.invoiceNo,
        amount: row.amount.toString(),
        status: row.status,
        tenantName: row.tenant.name,
        createdAt: row.createdAt
      })),
      total,
      q.page,
      q.page_size
    )
  );
}

