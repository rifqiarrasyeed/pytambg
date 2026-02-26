import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/constants";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const LEGACY_REDIRECTS: Record<string, string> = {
  "/dashboard": "/",
  "/verification": "/delivery?tab=verification",
  "/disputes": "/delivery?tab=disputes",
  "/audit": "/reports?tab=audit",
  "/settings": "/reports?tab=settings",
  "/master-data": "/reports?tab=master",
  "/sppg-admin": "/reports?tab=admin",
  "/incidents": "/reports?tab=incidents"
};

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/switch-sppg") ||
    pathname.startsWith("/api/session")
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path);
  const hasAccess = Boolean(request.cookies.get(ACCESS_COOKIE)?.value);

  if (!hasAccess && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasAccess && Object.prototype.hasOwnProperty.call(LEGACY_REDIRECTS, pathname)) {
    return NextResponse.redirect(new URL(LEGACY_REDIRECTS[pathname], request.url));
  }

  if (hasAccess && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
