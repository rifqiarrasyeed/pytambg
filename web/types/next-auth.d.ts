import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
    };
    activeTenantId: string | null;
    tenantRoles: string[];
    platformRoles: string[];
  }

  interface User {
    activeTenantId: string | null;
    tenantRoles: string[];
    platformRoles: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    activeTenantId?: string | null;
    tenantRoles?: string[];
    platformRoles?: string[];
  }
}
