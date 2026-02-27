import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { env } from "@/lib/core/env";
import { ACCESS_COOKIE } from "@/lib/constants";

const PUBLIC_PATHS = ["/", "/pricing", "/login"];
const APP_COMPAT_REDIRECTS: Record<string, string> = {
  "/app": "/planning",
  "/app/dashboard": "/planning",
  "/app/plans": "/planning",
  "/app/production": "/production",
  "/app/deliveries": "/delivery",
  "/app/reports": "/reports",
  "/app/master": "/master-data",
  "/app/master/schools": "/master-data",
  "/app/master/routes": "/master-data",
  "/app/master/users": "/master-data",
  "/app/settings": "/settings",
  "/app/billing": "/reports?tab=overview"
};

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/auth") || pathname.startsWith("/api/billing/midtrans/webhook");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname === "/verification") {
    const target = new URL("/delivery", request.url);
    target.searchParams.set("tab", "verification");
    return NextResponse.redirect(target);
  }
  if (pathname === "/disputes") {
    const target = new URL("/delivery", request.url);
    target.searchParams.set("tab", "disputes");
    return NextResponse.redirect(target);
  }
  if (pathname === "/audit") {
    const target = new URL("/reports", request.url);
    target.searchParams.set("tab", "audit");
    return NextResponse.redirect(target);
  }
  if (pathname === "/dashboard") {
    return NextResponse.redirect(new URL("/planning", request.url));
  }

  const compatTarget = APP_COMPAT_REDIRECTS[pathname];
  if (compatTarget) {
    return NextResponse.redirect(new URL(compatTarget, request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: env.NEXTAUTH_SECRET });

  if (!token) {
    const legacyAccess = request.cookies.get(ACCESS_COOKIE)?.value;
    const legacyRoute = !pathname.startsWith("/app") && !pathname.startsWith("/platform");
    if (legacyAccess && legacyRoute) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/platform")) {
    const platformRoles = (token.platformRoles as string[] | undefined) ?? [];
    const allowed = platformRoles.includes("PLATFORM_ADMIN") || platformRoles.includes("PLATFORM_OPS");
    if (!allowed) {
      return NextResponse.redirect(new URL("/reports", request.url));
    }
  }

  if (pathname.startsWith("/app")) {
    const activeTenantId = request.cookies.get("mbg_active_tenant")?.value ?? (token.activeTenantId as string | undefined);
    if (!activeTenantId) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
