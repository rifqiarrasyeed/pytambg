export type TenantRoleCode = "TENANT_OWNER" | "TENANT_OPERATOR" | "TENANT_DRIVER" | "TENANT_VIEWER" | "SCHOOL_VERIFIER";
export type PlatformRoleCode = "PLATFORM_ADMIN" | "PLATFORM_OPS";

export const tenantPermissions: Record<TenantRoleCode, string[]> = {
  TENANT_OWNER: [
    "master.read",
    "master.write",
    "plan.read",
    "plan.write",
    "plan.approve",
    "production.read",
    "production.write",
    "delivery.read",
    "delivery.write",
    "verification.read",
    "verification.write",
    "reports.read",
    "reports.export",
    "audit.read",
    "settings.write"
  ],
  TENANT_OPERATOR: ["plan.read", "production.read", "production.write", "delivery.read", "reports.read"],
  TENANT_DRIVER: ["delivery.read", "delivery.status", "delivery.proof"],
  TENANT_VIEWER: ["plan.read", "production.read", "delivery.read", "reports.read", "reports.export"],
  SCHOOL_VERIFIER: ["delivery.read", "verification.write", "verification.read"]
};

export const platformPermissions: Record<PlatformRoleCode, string[]> = {
  PLATFORM_ADMIN: [
    "platform.tenants.read",
    "platform.tenants.write",
    "platform.billing.read",
    "platform.billing.write",
    "platform.staff.write",
    "platform.audit.read"
  ],
  PLATFORM_OPS: ["platform.tenants.read", "platform.billing.read", "platform.audit.read"]
};

export function hasTenantPermission(roles: string[], permission: string): boolean {
  return roles.some((role) => {
    const list = tenantPermissions[role as TenantRoleCode];
    return list?.includes(permission) ?? false;
  });
}

export function hasPlatformPermission(roles: string[], permission: string): boolean {
  return roles.some((role) => {
    const list = platformPermissions[role as PlatformRoleCode];
    return list?.includes(permission) ?? false;
  });
}

