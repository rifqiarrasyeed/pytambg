import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { authHeaders, futureDate, loginAs, uniqueSuffix } from "./support";

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";

test("login invalid ditolak", async ({ request }) => {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { email: "superadmin@mbg.local", password: "salah-total" }
  });
  expect(response.status()).toBe(401);
});

test("switch active_sppg unassigned ditolak", async ({ request }) => {
  const auth = await loginAs(request, "admin_sppga");
  const response = await request.post(`${API_BASE}/me/active-sppg`, {
    headers: authHeaders(auth.access_token),
    data: { sppg_id: randomUUID() }
  });
  expect([403, 409]).toContain(response.status());
});

test("sort_by invalid pada list stok ditolak", async ({ request }) => {
  const auth = await loginAs(request, "superadmin");
  const response = await request.get(`${API_BASE}/stock?sort_by=drop_table&sort_dir=asc`, {
    headers: authHeaders(auth.access_token)
  });
  expect(response.status()).toBe(422);
});

test("self approval PO ditolak untuk non-superadmin", async ({ request }) => {
  const auth = await loginAs(request, "admin_sppga");
  const headers = authHeaders(auth.access_token);

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
  const auth = await loginAs(request, "superadmin");
  const response = await request.post(`${API_BASE}/receipts`, {
    headers: authHeaders(auth.access_token),
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
  const auth = await loginAs(request, "superadmin");
  const date = futureDate(40);
  const response = await request.post(`${API_BASE}/period-locks/${date}/unlock`, {
    headers: authHeaders(auth.access_token),
    data: {}
  });
  expect(response.status()).toBe(422);
});

test("period lock memblokir mutasi planning tanggal yang sama", async ({ request }) => {
  const auth = await loginAs(request, "superadmin");
  const headers = authHeaders(auth.access_token);
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
  const auth = await loginAs(request, "superadmin");
  const headers = authHeaders(auth.access_token);
  const code = `VEN-${uniqueSuffix("scope")}`;

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
  const auth = await loginAs(request, "superadmin");
  const response = await request.post(`${API_BASE}/deliveries/${randomUUID()}/proof`, {
    headers: {
      ...authHeaders(auth.access_token),
      "Idempotency-Key": uniqueSuffix("proof-missing")
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
  const auth = await loginAs(request, "superadmin");
  const response = await request.get(
    `${API_BASE}/qa/health-integrity?audit_window_hours=24&include_samples=true&sample_limit=5`,
    {
      headers: authHeaders(auth.access_token)
    }
  );
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as {
    ok: boolean;
    audit_window_hours: number;
    checks: Record<string, number>;
    samples?: Record<string, Array<unknown>>;
  };
  expect(typeof body.ok).toBe("boolean");
  expect(body.audit_window_hours).toBe(24);
  expect(typeof body.checks).toBe("object");
  expect(typeof body.checks.audit_create_gap_count).toBe("number");
  expect(typeof body.checks.audit_update_gap_count).toBe("number");
  expect(typeof body.checks.audit_missing_request_id_count).toBe("number");
  expect(typeof body.checks.audit_missing_actor_meta_count).toBe("number");
  expect(body.samples).toBeTruthy();
});

test("switch active_sppg menghasilkan audit ACTIVE_SPPG_SWITCH", async ({ request }) => {
  const auth = await loginAs(request, "superadmin");
  const headers = authHeaders(auth.access_token);

  const mySppgRes = await request.get(`${API_BASE}/me/sppg`, { headers });
  expect(mySppgRes.status(), await mySppgRes.text()).toBe(200);
  const mySppg = (await mySppgRes.json()) as { assignments: Array<{ sppg_id: string }> };
  expect(mySppg.assignments.length).toBeGreaterThan(0);

  const switchRes = await request.post(`${API_BASE}/me/active-sppg`, {
    headers: authHeaders(auth.access_token)
  });
  expect(switchRes.status(), await switchRes.text()).toBe(422);

  const switchOkRes = await request.post(`${API_BASE}/me/active-sppg`, {
    headers,
    data: { sppg_id: mySppg.assignments[0].sppg_id }
  });
  expect(switchOkRes.status(), await switchOkRes.text()).toBe(200);

  const auditRes = await request.get(
    `${API_BASE}/audit-logs?entity_table=sessions_tokens&action=ACTIVE_SPPG_SWITCH&page=1&page_size=20`,
    { headers }
  );
  expect(auditRes.status(), await auditRes.text()).toBe(200);
  const auditBody = (await auditRes.json()) as {
    data: Array<{ action: string; entity_table: string; old_value: Record<string, unknown>; new_value: Record<string, unknown> }>;
  };
  expect(auditBody.data.length).toBeGreaterThan(0);
  const row = auditBody.data[0];
  expect(row.action).toBe("ACTIVE_SPPG_SWITCH");
  expect(row.entity_table).toBe("sessions_tokens");
  expect(typeof row.old_value).toBe("object");
  expect(typeof row.new_value).toBe("object");
});

test("filter audit-logs by entity_id dan action berjalan", async ({ request }) => {
  const auth = await loginAs(request, "superadmin");
  const headers = authHeaders(auth.access_token);

  const contextRes = await request.get(`${API_BASE}/me/context`, { headers });
  expect(contextRes.status(), await contextRes.text()).toBe(200);
  const context = (await contextRes.json()) as { user: { id: string } };

  const auditRes = await request.get(
    `${API_BASE}/audit-logs?entity_table=sessions_tokens&entity_id=${context.user.id}&action=LOGIN_SUCCESS&page=1&page_size=20`,
    { headers }
  );
  expect(auditRes.status(), await auditRes.text()).toBe(200);
  const body = (await auditRes.json()) as {
    data: Array<{ entity_table: string; entity_id: string; action: string }>;
  };

  expect(body.data.length).toBeGreaterThan(0);
  for (const row of body.data) {
    expect(row.entity_table).toBe("sessions_tokens");
    expect(row.entity_id).toBe(context.user.id);
    expect(row.action).toBe("LOGIN_SUCCESS");
  }
});

test("workspace summary/alerts/kpi tersedia untuk laporan harian", async ({ request }) => {
  const auth = await loginAs(request, "superadmin");
  const headers = authHeaders(auth.access_token);

  const summary = await request.get(`${API_BASE}/workspace/summary`, { headers });
  expect(summary.status(), await summary.text()).toBe(200);
  const summaryBody = (await summary.json()) as {
    date: string;
    counters: Record<string, number>;
  };
  expect(typeof summaryBody.date).toBe("string");
  expect(typeof summaryBody.counters).toBe("object");

  const alerts = await request.get(`${API_BASE}/workspace/alerts`, { headers });
  expect(alerts.status(), await alerts.text()).toBe(200);
  const alertsBody = (await alerts.json()) as { data: Array<{ kind: string; severity: string; count: number }> };
  expect(Array.isArray(alertsBody.data)).toBe(true);

  const kpi = await request.get(`${API_BASE}/workspace/kpi`, { headers });
  expect(kpi.status(), await kpi.text()).toBe(200);
  const kpiBody = (await kpi.json()) as { planned: number; produced: number; delivered: number; verified: number };
  expect(typeof kpiBody.planned).toBe("number");
  expect(typeof kpiBody.produced).toBe("number");
  expect(typeof kpiBody.delivered).toBe("number");
  expect(typeof kpiBody.verified).toBe("number");
});
