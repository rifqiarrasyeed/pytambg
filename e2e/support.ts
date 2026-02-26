import { expect, type APIRequestContext } from "@playwright/test";

export type LoginResponse = {
  access_token: string;
  active_sppg_id: string | null;
  assignments: Array<{ sppg_id: string; sppg_code?: string }>;
};

type RoleKey =
  | "superadmin"
  | "admin_sppga"
  | "admin_sppgb"
  | "inventory_sppga"
  | "driver_sppga"
  | "verifier_sppga"
  | "auditor";

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";

const ROLE_CREDENTIALS: Record<RoleKey, { email: string; password: string }> = {
  superadmin: {
    email: process.env.E2E_USER_EMAIL ?? "superadmin@mbg.local",
    password: process.env.E2E_USER_PASSWORD ?? "Passw0rd!"
  },
  admin_sppga: { email: "admin.sppga@mbg.local", password: "Passw0rd!" },
  admin_sppgb: { email: "admin.sppgb@mbg.local", password: "Passw0rd!" },
  inventory_sppga: { email: "inventory.sppga@mbg.local", password: "Passw0rd!" },
  driver_sppga: { email: "driver.sppga@mbg.local", password: "Passw0rd!" },
  verifier_sppga: { email: "verifier.sppga@mbg.local", password: "Passw0rd!" },
  auditor: { email: "auditor@mbg.local", password: "Passw0rd!" }
};

export function uniqueSuffix(prefix = "e2e"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

export function futureDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function futureDateTime(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

export function futureDateSafe(primaryOffset: number, fallbackOffset: number) {
  return {
    primary: futureDate(primaryOffset),
    fallback: futureDate(fallbackOffset)
  };
}

export async function loginAs(request: APIRequestContext, role: RoleKey = "superadmin"): Promise<LoginResponse> {
  const credentials = ROLE_CREDENTIALS[role];
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: {
      email: credentials.email,
      password: credentials.password
    }
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as LoginResponse;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
