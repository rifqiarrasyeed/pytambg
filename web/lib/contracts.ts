export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

export type ThemeMode = "light" | "dark" | "system";

export type NavItemMeta = {
  href: string;
  label: string;
  permissionAny?: string[];
  rolesAny?: string[];
  section?: "operasional" | "master" | "kontrol";
};

export type LookupMasterResponse = {
  schools?: Array<{ id: string; code: string; name: string; sla_minutes: number }>;
  routes?: Array<{ id: string; code: string; name: string; status: string }>;
  vendors?: Array<{ id: string; code: string; name: string; status: string }>;
  units?: Array<{ id: string; code: string; name: string }>;
  items?: Array<{ id: string; sku: string; name: string; unit_id: string; track_expiry: boolean; standard_cost: number }>;
  recipes?: Array<{ id: string; code: string; name: string; yield_portions: number; status: string }>;
  drivers?: Array<{ id: string; full_name: string; email: string }>;
  verifiers?: Array<{ id: string; full_name: string; email: string }>;
};

export type SessionContextResponse = {
  user: { id: string; email: string | null; full_name: string | null };
  active_sppg_id: string | null;
  roles: string[];
  permissions: string[];
  is_super_admin: boolean;
};

export type KpiTrendPoint = {
  date: string;
  planned: number;
  produced: number;
  delivered: number;
  verified: number;
  waste_rate: number;
};

export type KpiTrendResponse = {
  date_from: string;
  date_to: string;
  granularity: "day";
  series: KpiTrendPoint[];
};

export type MeSppgAssignment = {
  sppg_id: string;
  sppg_code: string;
  sppg_name: string;
  roles: string[];
  is_default: boolean;
};

export type UserLookup = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  is_super_admin: boolean;
};

export type RouteSchoolMap = {
  school_id: string;
  school_code: string;
  school_name: string;
  stop_order: number;
};

export type SchoolVerifierMap = {
  user_id: string;
  full_name: string;
  email: string;
};

export type RecipePatchPayload = {
  code?: string;
  name?: string;
  yield_portions?: number;
  status?: "DRAFT" | "APPROVED" | "ARCHIVED";
  items?: Array<{ item_id: string; qty_per_portion: number; loss_factor: number }>;
};
