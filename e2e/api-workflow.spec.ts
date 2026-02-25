import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

type AuthLoginResponse = {
  access_token: string;
  active_sppg_id: string | null;
  assignments: Array<{ sppg_id: string }>;
};

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.E2E_USER_EMAIL ?? "superadmin@mbg.local";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Passw0rd!";

function isoDate(daysFromNow = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function isoDateTime(daysFromNow = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
}

function checksum(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

async function refreshStockBalancesMv(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("REFRESH MATERIALIZED VIEW stock_balances_mv");
  } finally {
    await client.end();
  }
}

async function loginViaApi(request: APIRequestContext) {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD }
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as AuthLoginResponse;
  expect(body.access_token).toBeTruthy();
  return body;
}

test("workflow API kritikal + idempotency + dispute resolve berjalan", async ({ request }) => {
  const auth = await loginViaApi(request);
  const token = auth.access_token;
  const authHeader = { Authorization: `Bearer ${token}` };

  const lookupsRes = await request.get(
    `${API_BASE}/lookups/master?include=schools,routes,vendors,items,recipes,drivers`,
    { headers: authHeader }
  );
  expect(lookupsRes.status()).toBe(200);
  const lookups = (await lookupsRes.json()) as {
    schools: Array<{ id: string }>;
    routes: Array<{ id: string }>;
    vendors: Array<{ id: string }>;
    items: Array<{ id: string }>;
    recipes: Array<{ id: string }>;
    drivers: Array<{ id: string }>;
  };

  const schoolId = lookups.schools[0]?.id;
  const routeId = lookups.routes[0]?.id;
  const vendorId = lookups.vendors[0]?.id;
  const driverUserId = lookups.drivers[0]?.id;
  const itemA = lookups.items[0]?.id;
  expect(schoolId).toBeTruthy();
  expect(routeId).toBeTruthy();
  expect(vendorId).toBeTruthy();
  expect(driverUserId).toBeTruthy();
  expect(itemA).toBeTruthy();

  const recipeCreateRes = await request.post(`${API_BASE}/recipes`, {
    headers: authHeader,
    data: {
      code: `E2E-RCP-${Date.now()}`,
      name: "Recipe E2E Single Item",
      yield_portions: 20,
      status: "APPROVED",
      items: [{ item_id: itemA, qty_per_portion: 0.5, loss_factor: 0 }]
    }
  });
  expect(recipeCreateRes.status()).toBe(201);
  const createdRecipe = (await recipeCreateRes.json()) as { id: string };
  const recipeId = createdRecipe.id;

  let planDate = isoDate(2 + Math.floor(Math.random() * 90));
  let planCreateRes = await request.post(`${API_BASE}/menu-plans`, {
    headers: authHeader,
    data: {
      plan_date: planDate,
      buffer_pct: 5,
      items: [{ school_id: schoolId, recipe_id: recipeId, target_portions: 80 }]
    }
  });
  if (planCreateRes.status() === 409) {
    planDate = isoDate(120 + Math.floor(Math.random() * 180));
    planCreateRes = await request.post(`${API_BASE}/menu-plans`, {
      headers: authHeader,
      data: {
        plan_date: planDate,
        buffer_pct: 5,
        items: [{ school_id: schoolId, recipe_id: recipeId, target_portions: 80 }]
      }
    });
  }
  expect(planCreateRes.status()).toBe(201);
  const plan = (await planCreateRes.json()) as { id: string };

  expect((await request.post(`${API_BASE}/menu-plans/${plan.id}/submit`, { headers: authHeader, data: {} })).status()).toBe(200);
  expect((await request.post(`${API_BASE}/menu-plans/${plan.id}/approve`, { headers: authHeader, data: {} })).status()).toBe(200);

  const poRes = await request.post(`${API_BASE}/purchases`, {
    headers: authHeader,
    data: {
      vendor_id: vendorId,
      eta_date: planDate,
      items: [
        { item_id: itemA, ordered_qty: 50, unit_price: 10000 }
      ]
    }
  });
  expect(poRes.status()).toBe(201);
  const po = (await poRes.json()) as { id: string };

  expect((await request.post(`${API_BASE}/purchases/${po.id}/submit`, { headers: authHeader, data: {} })).status()).toBe(200);
  expect((await request.post(`${API_BASE}/purchases/${po.id}/approve`, { headers: authHeader, data: {} })).status()).toBe(200);

  const poItemsRes = await request.get(`${API_BASE}/purchases/${po.id}/items`, { headers: authHeader });
  expect(poItemsRes.status()).toBe(200);
  const poItems = (await poItemsRes.json()) as {
    data: Array<{ id: string; item_id: string; track_expiry: boolean }>;
  };
  const selectedPoItem = poItems.data.find((item) => item.item_id === itemA) ?? poItems.data[0];
  expect(selectedPoItem?.id).toBeTruthy();

  const attachmentRes = await request.post(`${API_BASE}/attachments`, {
    headers: authHeader,
    data: {
      bucket_name: "invoices",
      object_key: `e2e/invoice/${Date.now()}.txt`,
      file_name: "invoice-e2e.txt",
      mime_type: "text/plain",
      size_bytes: 32,
      checksum_sha256: checksum(String(Date.now()))
    }
  });
  expect(attachmentRes.status(), await attachmentRes.text()).toBe(201);
  const attachment = (await attachmentRes.json()) as { id: string };

  const receiptPayload = {
    purchase_id: po.id,
    received_at: isoDateTime(0),
    items: [
      {
        purchase_item_id: selectedPoItem.id,
        received_qty: 45,
        lot_no: "E2E-LOT-01",
        expiry_date: isoDate(180),
        price: 10000,
        variance_reason: "Selisih terukur saat penerimaan"
      }
    ],
    attachments: [{ attachment_id: attachment.id }]
  };
  const idempoKey = `e2e-receipt-${Date.now()}`;

  const receiptFirst = await request.post(`${API_BASE}/receipts`, {
    headers: { ...authHeader, "Idempotency-Key": idempoKey },
    data: receiptPayload
  });
  expect(receiptFirst.status(), await receiptFirst.text()).toBe(201);
  const receiptFirstBody = (await receiptFirst.json()) as { id: string; status: string };

  const receiptReplay = await request.post(`${API_BASE}/receipts`, {
    headers: { ...authHeader, "Idempotency-Key": idempoKey },
    data: receiptPayload
  });
  expect(receiptReplay.status()).toBe(201);
  const receiptReplayBody = (await receiptReplay.json()) as { id: string; status: string };
  expect(receiptReplayBody.id).toBe(receiptFirstBody.id);

  const receiptConflict = await request.post(`${API_BASE}/receipts`, {
    headers: { ...authHeader, "Idempotency-Key": idempoKey },
    data: {
      ...receiptPayload,
      items: [{ ...receiptPayload.items[0], received_qty: 44 }]
    }
  });
  expect(receiptConflict.status()).toBe(409);

  const stockTopupRes = await request.post(`${API_BASE}/stock-moves`, {
    headers: authHeader,
    data: {
      move_type: "ADJUSTMENT",
      item_id: itemA,
      qty: 200,
      reason_code: "E2E_TOPUP",
      move_date: planDate
    }
  });
  expect(stockTopupRes.status()).toBe(201);

  await refreshStockBalancesMv();

  const runRes = await request.post(`${API_BASE}/production-runs`, {
    headers: authHeader,
    data: { menu_plan_id: plan.id, run_date: planDate }
  });
  expect(runRes.status()).toBe(201);
  const run = (await runRes.json()) as { id: string };

  const startRes = await request.post(`${API_BASE}/production-runs/${run.id}/start`, {
    headers: authHeader,
    data: {}
  });
  const startBody = await startRes.json();
  expect(startRes.status(), JSON.stringify(startBody)).toBe(200);

  const finalizeRes = await request.post(`${API_BASE}/production-runs/${run.id}/finalize`, {
    headers: authHeader,
    data: {
      outputs: [{ school_id: schoolId, recipe_id: recipeId, output_portions: 75 }],
      qc_checks: [{ check_type: "TEMPERATURE", temperature_c: 72, checked_at: isoDateTime(0) }]
    }
  });
  expect(finalizeRes.status()).toBe(200);

  const deliveryRes = await request.post(`${API_BASE}/deliveries`, {
    headers: authHeader,
    data: {
      route_id: routeId,
      driver_user_id: driverUserId,
      planned_departure: isoDateTime(1),
      production_run_id: run.id
    }
  });
  expect(deliveryRes.status()).toBe(201);
  const delivery = (await deliveryRes.json()) as { id: string };

  const stopsRes = await request.get(`${API_BASE}/deliveries/${delivery.id}/stops`, { headers: authHeader });
  expect(stopsRes.status()).toBe(200);
  const stops = (await stopsRes.json()) as { data: Array<{ id: string }> };
  const stopId = stops.data[0]?.id;
  expect(stopId).toBeTruthy();

  const loadedRes = await request.post(`${API_BASE}/deliveries/${delivery.id}/status`, {
    headers: authHeader,
    data: { status: "LOADED", delivery_stop_id: stopId }
  });
  expect(loadedRes.status(), await loadedRes.text()).toBe(200);

  const inTransitRes = await request.post(`${API_BASE}/deliveries/${delivery.id}/status`, {
    headers: authHeader,
    data: { status: "IN_TRANSIT", delivery_stop_id: stopId }
  });
  expect(inTransitRes.status(), await inTransitRes.text()).toBe(200);

  const deliveredRes = await request.post(`${API_BASE}/deliveries/${delivery.id}/status`, {
    headers: authHeader,
    data: { status: "DELIVERED", delivery_stop_id: stopId }
  });
  expect(deliveredRes.status(), await deliveredRes.text()).toBe(200);

  const proofAttachmentRes = await request.post(`${API_BASE}/attachments`, {
    headers: authHeader,
    data: {
      bucket_name: "delivery-proofs",
      object_key: `e2e/proof/${Date.now()}.jpg`,
      file_name: "proof-e2e.jpg",
      mime_type: "image/jpeg",
      size_bytes: 64,
      checksum_sha256: checksum(`proof-${Date.now()}`)
    }
  });
  expect(proofAttachmentRes.status(), await proofAttachmentRes.text()).toBe(201);
  const proofAttachment = (await proofAttachmentRes.json()) as { id: string };

  const proofKey = `e2e-proof-${Date.now()}`;
  const proofRes = await request.post(`${API_BASE}/deliveries/${delivery.id}/proof`, {
    headers: { ...authHeader, "Idempotency-Key": proofKey },
    data: {
      delivery_stop_id: stopId,
      proof_type: "PHOTO",
      attachment_id: proofAttachment.id,
      captured_at: isoDateTime(1)
    }
  });
  expect(proofRes.status()).toBe(201);

  const disputeAttachmentRes = await request.post(`${API_BASE}/attachments`, {
    headers: authHeader,
    data: {
      bucket_name: "incident-proofs",
      object_key: `e2e/dispute/${Date.now()}.jpg`,
      file_name: "dispute-e2e.jpg",
      mime_type: "image/jpeg",
      size_bytes: 64,
      checksum_sha256: checksum(`dispute-${Date.now()}`)
    }
  });
  expect(disputeAttachmentRes.status(), await disputeAttachmentRes.text()).toBe(201);
  const disputeAttachment = (await disputeAttachmentRes.json()) as { id: string };

  const createDisputeRes = await request.post(`${API_BASE}/deliveries/${delivery.id}/disputes`, {
    headers: authHeader,
    data: {
      delivery_stop_id: stopId,
      delta_portions: -2,
      reason: "Kemasan rusak saat serah terima",
      attachments: [{ attachment_id: disputeAttachment.id }]
    }
  });
  expect(createDisputeRes.status()).toBe(201);
  const dispute = (await createDisputeRes.json()) as { id: string };

  const resolveRes = await request.post(`${API_BASE}/disputes/${dispute.id}/resolve`, {
    headers: authHeader,
    data: {
      resolution: "ACCEPT",
      stock_action: "WASTE",
      item_id: itemA,
      qty: 1,
      reason_code: "DISPUTE_WASTE"
    }
  });
  expect(resolveRes.status()).toBe(200);
  const resolveBody = (await resolveRes.json()) as { stock_move_id?: string | null };
  expect(resolveBody.stock_move_id).toBeTruthy();
});

test("negative tenancy: user tenant B tidak boleh akses resource tenant A", async ({ request }) => {
  const superAdmin = await loginViaApi(request);
  const superToken = superAdmin.access_token;
  const superHeaders = { Authorization: `Bearer ${superToken}` };

  let planDate = isoDate(200 + Math.floor(Math.random() * 100));
  const lookupsRes = await request.get(`${API_BASE}/lookups/master?include=schools,recipes`, { headers: superHeaders });
  const lookups = (await lookupsRes.json()) as { schools: Array<{ id: string }>; recipes: Array<{ id: string }> };

  let planRes = await request.post(`${API_BASE}/menu-plans`, {
    headers: superHeaders,
    data: {
      plan_date: planDate,
      buffer_pct: 5,
      items: [{ school_id: lookups.schools[0].id, recipe_id: lookups.recipes[0].id, target_portions: 50 }]
    }
  });
  if (planRes.status() === 409) {
    planDate = isoDate(400 + Math.floor(Math.random() * 120));
    planRes = await request.post(`${API_BASE}/menu-plans`, {
      headers: superHeaders,
      data: {
        plan_date: planDate,
        buffer_pct: 5,
        items: [{ school_id: lookups.schools[0].id, recipe_id: lookups.recipes[0].id, target_portions: 50 }]
      }
    });
  }
  expect(planRes.status(), await planRes.text()).toBe(201);
  const plan = (await planRes.json()) as { id: string };

  const tenantBLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email: "admin.sppgb@mbg.local", password: "Passw0rd!" }
  });
  expect(tenantBLogin.status()).toBe(200);
  const tenantBToken = ((await tenantBLogin.json()) as AuthLoginResponse).access_token;
  const tenantBHeaders = { Authorization: `Bearer ${tenantBToken}` };

  const crossRead = await request.post(`${API_BASE}/menu-plans/${plan.id}/submit`, {
    headers: tenantBHeaders,
    data: {}
  });
  expect([403, 404]).toContain(crossRead.status());
});
