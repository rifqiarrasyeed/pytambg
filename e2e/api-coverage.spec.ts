import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

type LoginResponse = {
  access_token: string;
  active_sppg_id: string | null;
  assignments: Array<{ sppg_id: string; sppg_code?: string }>;
};

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";

async function login(request: APIRequestContext, email: string, password: string): Promise<LoginResponse> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password }
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as LoginResponse;
}

function futureDate(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

test("login invalid ditolak", async ({ request }) => {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { email: "superadmin@mbg.local", password: "salah-total" }
  });
  expect(response.status()).toBe(401);
});

test("switch active_sppg unassigned ditolak", async ({ request }) => {
  const auth = await login(request, "admin.sppga@mbg.local", "Passw0rd!");
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const response = await request.post(`${API_BASE}/me/active-sppg`, {
    headers,
    data: { sppg_id: randomUUID() }
  });
  expect([403, 409]).toContain(response.status());
});

test("sort_by invalid pada list stok ditolak", async ({ request }) => {
  const auth = await login(request, "superadmin@mbg.local", "Passw0rd!");
  const response = await request.get(`${API_BASE}/stock?sort_by=drop_table&sort_dir=asc`, {
    headers: { Authorization: `Bearer ${auth.access_token}` }
  });
  expect(response.status()).toBe(422);
});

test("self approval PO ditolak untuk non-superadmin", async ({ request }) => {
  const auth = await login(request, "admin.sppga@mbg.local", "Passw0rd!");
  const headers = { Authorization: `Bearer ${auth.access_token}` };

  const lookupsRes = await request.get(`${API_BASE}/lookups/master?include=vendors,items`, { headers });
  expect(lookupsRes.status()).toBe(200);
  const lookups = (await lookupsRes.json()) as {
    vendors: Array<{ id: string }>;
    items: Array<{ id: string }>;
  };

  const poRes = await request.post(`${API_BASE}/purchases`, {
    headers,
    data: {
      vendor_id: lookups.vendors[0].id,
      eta_date: futureDate(30),
      items: [{ item_id: lookups.items[0].id, ordered_qty: 3, unit_price: 1000 }]
    }
  });
  expect(poRes.status(), await poRes.text()).toBe(201);
  const po = (await poRes.json()) as { id: string };

  expect((await request.post(`${API_BASE}/purchases/${po.id}/submit`, { headers, data: {} })).status()).toBe(200);
  const approveRes = await request.post(`${API_BASE}/purchases/${po.id}/approve`, { headers, data: {} });
  expect(approveRes.status()).toBe(409);
});

test("GRN tanpa Idempotency-Key ditolak", async ({ request }) => {
  const auth = await login(request, "superadmin@mbg.local", "Passw0rd!");
  const response = await request.post(`${API_BASE}/receipts`, {
    headers: { Authorization: `Bearer ${auth.access_token}` },
    data: {
      purchase_id: randomUUID(),
      received_at: new Date().toISOString(),
      items: [
        {
          purchase_item_id: randomUUID(),
          received_qty: 1,
          lot_no: "LOT-X",
          expiry_date: futureDate(60),
          price: 1000
        }
      ],
      attachments: [{ attachment_id: randomUUID() }]
    }
  });
  expect(response.status()).toBe(422);
});

test("unlock period tanpa reason ditolak", async ({ request }) => {
  const auth = await login(request, "superadmin@mbg.local", "Passw0rd!");
  const date = futureDate(40);
  const response = await request.post(`${API_BASE}/period-locks/${date}/unlock`, {
    headers: { Authorization: `Bearer ${auth.access_token}` },
    data: {}
  });
  expect(response.status()).toBe(422);
});

test("period lock memblokir mutasi planning tanggal yang sama", async ({ request }) => {
  const auth = await login(request, "superadmin@mbg.local", "Passw0rd!");
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const targetDate = futureDate(60);

  const lookupsRes = await request.get(`${API_BASE}/lookups/master?include=schools,recipes`, { headers });
  expect(lookupsRes.status()).toBe(200);
  const lookups = (await lookupsRes.json()) as {
    schools: Array<{ id: string }>;
    recipes: Array<{ id: string }>;
  };

  const lockRes = await request.post(`${API_BASE}/period-locks/${targetDate}/lock`, { headers, data: {} });
  expect(lockRes.status(), await lockRes.text()).toBe(200);

  const planRes = await request.post(`${API_BASE}/menu-plans`, {
    headers,
    data: {
      plan_date: targetDate,
      buffer_pct: 5,
      items: [{ school_id: lookups.schools[0].id, recipe_id: lookups.recipes[0].id, target_portions: 20 }]
    }
  });
  expect(planRes.status()).toBe(409);
});

test("sppg_id pada body diabaikan server", async ({ request }) => {
  const auth = await login(request, "superadmin@mbg.local", "Passw0rd!");
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const code = `VEN-E2E-${Date.now()}`;

  const createRes = await request.post(`${API_BASE}/vendors`, {
    headers,
    data: {
      sppg_id: randomUUID(),
      code,
      name: "Vendor Body Scope Test",
      status: "ACTIVE"
    }
  });
  expect(createRes.status(), await createRes.text()).toBe(201);

  const listRes = await request.get(`${API_BASE}/vendors?search=${encodeURIComponent(code)}`, { headers });
  expect(listRes.status()).toBe(200);
  const list = (await listRes.json()) as { data: Array<{ code: string }> };
  expect(list.data.some((row) => row.code === code)).toBe(true);
});

test("proof delivery tanpa attachment ditolak validasi", async ({ request }) => {
  const auth = await login(request, "superadmin@mbg.local", "Passw0rd!");
  const response = await request.post(`${API_BASE}/deliveries/${randomUUID()}/proof`, {
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Idempotency-Key": `e2e-proof-missing-att-${Date.now()}`
    },
    data: {
      delivery_stop_id: randomUUID(),
      proof_type: "PHOTO",
      captured_at: new Date().toISOString()
    }
  });
  expect(response.status()).toBe(422);
});

test("qa health-integrity endpoint bisa diakses auditor/superadmin", async ({ request }) => {
  const auth = await login(request, "superadmin@mbg.local", "Passw0rd!");
  const response = await request.get(`${API_BASE}/qa/health-integrity`, {
    headers: { Authorization: `Bearer ${auth.access_token}` }
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as { ok: boolean; checks: Record<string, number> };
  expect(typeof body.ok).toBe("boolean");
  expect(typeof body.checks).toBe("object");
});
