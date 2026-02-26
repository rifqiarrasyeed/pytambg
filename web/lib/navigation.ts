export type AppRole =
  | "SUPER_ADMIN"
  | "ADMIN_SPPG"
  | "NUTRITIONIST"
  | "INVENTORY"
  | "KITCHEN_PRODUCTION"
  | "DRIVER"
  | "SCHOOL_VERIFIER"
  | "AUDITOR_VIEWER";

export type MainRoute = "/planning" | "/procurement" | "/inventory" | "/production" | "/delivery" | "/reports";

export type DeliveryTab = "manifest" | "verification" | "disputes";
export type ReportsTab = "overview" | "audit" | "settings" | "master" | "admin" | "incidents";

export type RoleHomeRouteMap = Record<AppRole, string>;

export const ROLE_HOME_ROUTE_MAP: RoleHomeRouteMap = {
  SUPER_ADMIN: "/reports?tab=overview",
  ADMIN_SPPG: "/planning",
  NUTRITIONIST: "/planning",
  INVENTORY: "/procurement",
  KITCHEN_PRODUCTION: "/production",
  DRIVER: "/delivery?tab=manifest",
  SCHOOL_VERIFIER: "/delivery?tab=verification",
  AUDITOR_VIEWER: "/reports?tab=audit"
};

const rolePriority: AppRole[] = [
  "SUPER_ADMIN",
  "ADMIN_SPPG",
  "NUTRITIONIST",
  "INVENTORY",
  "KITCHEN_PRODUCTION",
  "DRIVER",
  "SCHOOL_VERIFIER",
  "AUDITOR_VIEWER"
];

export function resolvePrimaryRole(roles: string[]): AppRole | null {
  for (const role of rolePriority) {
    if (roles.includes(role)) {
      return role;
    }
  }
  return null;
}

export function resolveRoleHomeRoute(roles: string[]): string {
  const primaryRole = resolvePrimaryRole(roles);
  if (!primaryRole) {
    return "/reports?tab=overview";
  }
  return ROLE_HOME_ROUTE_MAP[primaryRole];
}

export const deliveryTabRoles: Record<DeliveryTab, AppRole[]> = {
  manifest: ["SUPER_ADMIN", "ADMIN_SPPG", "DRIVER", "KITCHEN_PRODUCTION"],
  verification: ["SUPER_ADMIN", "ADMIN_SPPG", "SCHOOL_VERIFIER"],
  disputes: ["SUPER_ADMIN", "ADMIN_SPPG", "SCHOOL_VERIFIER"]
};

export const reportsTabRoles: Record<ReportsTab, AppRole[]> = {
  overview: ["SUPER_ADMIN", "ADMIN_SPPG", "NUTRITIONIST", "INVENTORY", "KITCHEN_PRODUCTION", "AUDITOR_VIEWER"],
  audit: ["SUPER_ADMIN", "ADMIN_SPPG", "AUDITOR_VIEWER"],
  settings: ["SUPER_ADMIN", "ADMIN_SPPG"],
  master: ["SUPER_ADMIN", "ADMIN_SPPG"],
  admin: ["SUPER_ADMIN"],
  incidents: ["SUPER_ADMIN", "ADMIN_SPPG", "INVENTORY", "KITCHEN_PRODUCTION"]
};

export function hasAccessToDeliveryTab(roles: string[], tab: DeliveryTab): boolean {
  if (roles.includes("SUPER_ADMIN")) {
    return true;
  }
  return deliveryTabRoles[tab].some((role) => roles.includes(role));
}

export function hasAccessToReportsTab(roles: string[], tab: ReportsTab): boolean {
  if (roles.includes("SUPER_ADMIN")) {
    return true;
  }
  return reportsTabRoles[tab].some((role) => roles.includes(role));
}

export function resolveAllowedDeliveryTab(roles: string[], requestedTab: string | null | undefined): DeliveryTab {
  const normalized = requestedTab === "verification" || requestedTab === "disputes" ? requestedTab : "manifest";
  if (hasAccessToDeliveryTab(roles, normalized)) {
    return normalized;
  }

  const fallbackOrder: DeliveryTab[] = ["manifest", "verification", "disputes"];
  for (const tab of fallbackOrder) {
    if (hasAccessToDeliveryTab(roles, tab)) {
      return tab;
    }
  }
  return "manifest";
}

export function resolveAllowedReportsTab(roles: string[], requestedTab: string | null | undefined): ReportsTab {
  const normalized: ReportsTab =
    requestedTab === "audit" ||
    requestedTab === "settings" ||
    requestedTab === "master" ||
    requestedTab === "admin" ||
    requestedTab === "incidents"
      ? requestedTab
      : "overview";

  if (hasAccessToReportsTab(roles, normalized)) {
    return normalized;
  }

  const fallbackOrder: ReportsTab[] = ["overview", "audit", "settings", "master", "incidents", "admin"];
  for (const tab of fallbackOrder) {
    if (hasAccessToReportsTab(roles, tab)) {
      return tab;
    }
  }

  return "overview";
}

export function roleHasMainRouteAccess(roles: string[], route: MainRoute): boolean {
  if (roles.includes("SUPER_ADMIN")) {
    return true;
  }

  const routeRoles: Record<MainRoute, AppRole[]> = {
    "/planning": ["ADMIN_SPPG", "NUTRITIONIST", "KITCHEN_PRODUCTION"],
    "/procurement": ["ADMIN_SPPG", "INVENTORY"],
    "/inventory": ["ADMIN_SPPG", "INVENTORY"],
    "/production": ["ADMIN_SPPG", "KITCHEN_PRODUCTION", "NUTRITIONIST"],
    "/delivery": ["ADMIN_SPPG", "DRIVER", "SCHOOL_VERIFIER", "KITCHEN_PRODUCTION"],
    "/reports": ["ADMIN_SPPG", "NUTRITIONIST", "INVENTORY", "KITCHEN_PRODUCTION", "AUDITOR_VIEWER"]
  };

  return routeRoles[route].some((role) => roles.includes(role));
}

export const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  "/dashboard": "/planning",
  "/verification": "/delivery?tab=verification",
  "/disputes": "/delivery?tab=disputes",
  "/audit": "/reports?tab=audit",
  "/settings": "/reports?tab=settings",
  "/master-data": "/reports?tab=master",
  "/sppg-admin": "/reports?tab=admin",
  "/incidents": "/reports?tab=incidents"
};
