import { PERMISSIONS, type Permission, type Role } from "../types";

const rolePermissions: Record<Role, Set<Permission>> = {
  SUPER_ADMIN: new Set(Object.values(PERMISSIONS)),
  ADMIN_SPPG: new Set([
    PERMISSIONS.MASTER_READ,
    PERMISSIONS.MASTER_WRITE,
    PERMISSIONS.PLANNING_APPROVE,
    PERMISSIONS.PLANNING_WRITE,
    PERMISSIONS.PROCUREMENT_APPROVE,
    PERMISSIONS.PROCUREMENT_WRITE,
    PERMISSIONS.RECEIPT_POST,
    PERMISSIONS.INVENTORY_APPROVE,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.PRODUCTION_WRITE,
    PERMISSIONS.DELIVERY_MANAGE,
    PERMISSIONS.DISPUTE_MANAGE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.PERIOD_LOCK,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.ATTACHMENT_WRITE
  ]),
  NUTRITIONIST: new Set([
    PERMISSIONS.MASTER_READ,
    PERMISSIONS.MASTER_WRITE,
    PERMISSIONS.PLANNING_WRITE,
    PERMISSIONS.REPORT_VIEW
  ]),
  INVENTORY: new Set([
    PERMISSIONS.MASTER_READ,
    PERMISSIONS.MASTER_WRITE,
    PERMISSIONS.PROCUREMENT_WRITE,
    PERMISSIONS.RECEIPT_POST,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.ATTACHMENT_WRITE
  ]),
  KITCHEN_PRODUCTION: new Set([
    PERMISSIONS.MASTER_READ,
    PERMISSIONS.PRODUCTION_WRITE,
    PERMISSIONS.PRODUCTION_FINALIZE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.ATTACHMENT_WRITE
  ]),
  DRIVER: new Set([
    PERMISSIONS.DELIVERY_UPDATE_STATUS,
    PERMISSIONS.DELIVERY_UPLOAD_PROOF,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.ATTACHMENT_WRITE
  ]),
  SCHOOL_VERIFIER: new Set([
    PERMISSIONS.DELIVERY_VERIFY,
    PERMISSIONS.DISPUTE_MANAGE,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.ATTACHMENT_WRITE
  ]),
  AUDITOR_VIEWER: new Set([
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.ATTACHMENT_READ,
    PERMISSIONS.PERIOD_UNLOCK
  ])
};

export function hasPermission(roles: Role[], permission: Permission): boolean {
  for (const role of roles) {
    const permissions = rolePermissions[role];
    if (permissions?.has(permission)) {
      return true;
    }
  }
  return false;
}

export function permissionsForRoles(roles: Role[]): Permission[] {
  const merged = new Set<Permission>();
  for (const role of roles) {
    const permissions = rolePermissions[role];
    if (!permissions) {
      continue;
    }
    for (const permission of permissions) {
      merged.add(permission);
    }
  }
  return [...merged].sort();
}

export function requiresAnyRole(roles: Role[], allowed: Role[]): boolean {
  return roles.some((role) => allowed.includes(role));
}
