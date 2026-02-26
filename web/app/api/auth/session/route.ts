import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/core/auth-options";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  return Response.json({
    authenticated: true,
    user: session.user,
    active_tenant_id: session.activeTenantId,
    tenant_roles: session.tenantRoles,
    platform_roles: session.platformRoles
  });
}

