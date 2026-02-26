import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { authHeaders, futureDateSafe, futureDateTime, loginAs, uniqueSuffix } from "./support";

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";

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

async function createPlanWithFallback(
  request: APIRequestContext,
  headers: Record<string, string>,
  schoolId: string,
  recipeId: string,
  targetPortions = 80,
  seed = uniqueSuffix("plan")
): Promise<{ id: string; planDate: string }> {
  const seedValue = seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const dates = Array.from({ length: 20 }, (_, index) => {
    const offset = 365 + ((seedValue + index * 97) % 6000);
    return futureDateSafe(offset, offset + 7).primary;
  });
  const payload = (planDate: string) => ({
    plan_date: planDate,
    buffer_pct: 5,
    items: [{ school_id: schoolId, recipe_id: recipeId, target_portions: targetPortions }]
  });

  for (const planDate of dates) {
    const response = await request.post(`${API_BASE}/menu-plans`, {
      headers,
      data: payload(planDate)
    });
    if (response.status() === 201) {
      const plan = (await response.json()) as { id: string };
      return { id: plan.id, planDate };
    }
    if (response.status() !== 409) {
      expect(response.status(), await response.text()).toBe(201);
    }
  }

  throw new Error("Tidak menemukan tanggal menu plan yang tersedia untuk E2E.");
}

test("workflow API kritikal + idempotency + dispute resolve berjalan", async ({ request }) => {
  const auth = await loginAs(request, "superadmin");
  const headers = authHeaders(auth.access_token);
  const suffix = uniqueSuffix("workflow");

  const lookupsRes = await request.get(
    `${API_BASE}/lookups/master?include=schools,routes,vendors,items,recipes,drivers`,
    { headers }
  );
  expect(lookupsRes.status()).toBe(200);
  const lookups = (await lookupsRes.json()) as {
    schools: Array<{ id: string }>;
    routes: Array<{ id: string }>;
    vendors: Array<{ id: string }>;
    items: Array<{ id: string }>;
    drivers: Array<{ id: string }>;
  };

  const schoolId = lookups.schools[0]?.id;
  const routeId = lookups.routes[0]?.id;
  const vendorId = lookups.vendors[0]?.id;
  const driverUserId = lookups.drivers[0]?.id;
  const itemId = lookups.items[0]?.id;
  expect(schoolId).toBeTruthy();
  expect(routeId).toBeTruthy();
  expect(vendorId).toBeTruthy();
  expect(driverUserId).toBeTruthy();
  expect(itemId).toBeTruthy();

  const recipeCreateRes = await request.post(`${API_BASE}/recipes`, {
    headers,
    data: {
      code: `E2E-RCP-${suffix}`,
      name: `Recipe ${suffix}`,
      yield_portions: 20,
      status: "APPROVED",
      items: [{ item_id: itemId, qty_per_portion: 0.5, loss_factor: 0 }]
    }
  });
  expect(recipeCreateRes.status(), await recipeCreateRes.text()).toBe(201);
  const recipe = (await recipeCreateRes.json()) as { id: string };

  const plan = await createPlanWithFallback(request, headers, schoolId!, recipe.id, 80, suffix);

  expect((await request.post(`${API_BASE}/menu-plans/${plan.id}/submit`, { headers, data: {} })).status()).toBe(200);
  expect((await request.post(`${API_BASE}/menu-plans/${plan.id}/approve`, { headers, data: {} })).status()).toBe(200);

  const poRes = await request.post(`${API_BASE}/purchases`, {
    headers,
    data: {
      vendor_id: vendorId,
      eta_date: plan.planDate,
      items: [{ item_id: itemId, ordered_qty: 50, unit_price: 10000 }]
    }
  });
  expect(poRes.status(), await poRes.text()).toBe(201);
  const po = (await poRes.json()) as { id: string };

  expect((await request.post(`${API_BASE}/purchases/${po.id}/submit`, { headers, data: {} })).status()).toBe(200);
  expect((await request.post(`${API_BASE}/purchases/${po.id}/approve`, { headers, data: {} })).status()).toBe(200);

  const poItemsRes = await request.get(`${API_BASE}/purchases/${po.id}/items`, { headers });
  expect(poItemsRes.status()).toBe(200);
  const poItems = (await poItemsRes.json()) as {
    data: Array<{ id: string; item_id: string }>;
  };
  const selectedPoItem = poItems.data.find((row) => row.item_id === itemId) ?? poItems.data[0];
  expect(selectedPoItem?.id).toBeTruthy();

  const attachmentRes = await request.post(`${API_BASE}/attachments`, {
    headers,
    data: {
      bucket_name: "invoices",
      object_key: `e2e/invoice/${suffix}.txt`,
      file_name: `invoice-${suffix}.txt`,
      mime_type: "text/plain",
      size_bytes: 32,
      checksum_sha256: checksum(`invoice-${suffix}`)
    }
  });
  expect(attachmentRes.status(), await attachmentRes.text()).toBe(201);
  const attachment = (await attachmentRes.json()) as { id: string };

  const receiptPayload = {
    purchase_id: po.id,
    received_at: futureDateTime(0),
    items: [
      {
        purchase_item_id: selectedPoItem.id,
        received_qty: 45,
        lot_no: `LOT-${suffix}`,
        expiry_date: futureDateSafe(180, 190).primary,
        price: 10000,
        variance_reason: "Selisih terukur saat penerimaan"
      }
    ],
    attachments: [{ attachment_id: attachment.id }]
  };
  const idempotencyKey = `e2e-receipt-${suffix}`;

  const receiptFirst = await request.post(`${API_BASE}/receipts`, {
    headers: { ...headers, "Idempotency-Key": idempotencyKey },
    data: receiptPayload
  });
  expect(receiptFirst.status(), await receiptFirst.text()).toBe(201);
  const receiptFirstBody = (await receiptFirst.json()) as { id: string };

  const receiptReplay = await request.post(`${API_BASE}/receipts`, {
    headers: { ...headers, "Idempotency-Key": idempotencyKey },
    data: receiptPayload
  });
  expect(receiptReplay.status()).toBe(201);
  const receiptReplayBody = (await receiptReplay.json()) as { id: string };
  expect(receiptReplayBody.id).toBe(receiptFirstBody.id);

  const receiptConflict = await request.post(`${API_BASE}/receipts`, {
    headers: { ...headers, "Idempotency-Key": idempotencyKey },
    data: {
      ...receiptPayload,
      items: [{ ...receiptPayload.items[0], received_qty: 44 }]
    }
  });
  expect(receiptConflict.status()).toBe(409);

  const stockTopupRes = await request.post(`${API_BASE}/stock-moves`, {
    headers,
    data: {
      move_type: "ADJUSTMENT",
      item_id: itemId,
      qty: 200,
      reason_code: "E2E_TOPUP",
      move_date: plan.planDate
    }
  });
  expect(stockTopupRes.status(), await stockTopupRes.text()).toBe(201);

  await refreshStockBalancesMv();

  const runRes = await request.post(`${API_BASE}/production-runs`, {
    headers,
    data: { menu_plan_id: plan.id, run_date: plan.planDate }
  });
  expect(runRes.status(), await runRes.text()).toBe(201);
  const run = (await runRes.json()) as { id: string };

  const startRes = await request.post(`${API_BASE}/production-runs/${run.id}/start`, {
    headers,
    data: {}
  });
  expect(startRes.status(), await startRes.text()).toBe(200);

  const finalizeRes = await request.post(`${API_BASE}/production-runs/${run.id}/finalize`, {
    headers,
    data: {
      outputs: [{ school_id: schoolId, recipe_id: recipe.id, output_portions: 75 }],
      qc_checks: [{ check_type: "TEMPERATURE", temperature_c: 72, checked_at: futureDateTime(0) }]
    }
  });
  expect(finalizeRes.status(), await finalizeRes.text()).toBe(200);

  const deliveryRes = await request.post(`${API_BASE}/deliveries`, {
    headers,
    data: {
      route_id: routeId,
      driver_user_id: driverUserId,
      planned_departure: futureDateTime(1),
      production_run_id: run.id
    }
  });
  expect(deliveryRes.status(), await deliveryRes.text()).toBe(201);
  const delivery = (await deliveryRes.json()) as { id: string };

  const stopsRes = await request.get(`${API_BASE}/deliveries/${delivery.id}/stops`, { headers });
  expect(stopsRes.status()).toBe(200);
  const stops = (await stopsRes.json()) as { data: Array<{ id: string }> };
  const stopId = stops.data[0]?.id;
  expect(stopId).toBeTruthy();

  expect(
    (
      await request.post(`${API_BASE}/deliveries/${delivery.id}/status`, {
        headers,
        data: { status: "LOADED", delivery_stop_id: stopId }
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await request.post(`${API_BASE}/deliveries/${delivery.id}/status`, {
        headers,
        data: { status: "IN_TRANSIT", delivery_stop_id: stopId }
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await request.post(`${API_BASE}/deliveries/${delivery.id}/status`, {
        headers,
        data: { status: "DELIVERED", delivery_stop_id: stopId }
      })
    ).status()
  ).toBe(200);

  const proofAttachmentRes = await request.post(`${API_BASE}/attachments`, {
    headers,
    data: {
      bucket_name: "delivery-proofs",
      object_key: `e2e/proof/${suffix}.jpg`,
      file_name: `proof-${suffix}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 64,
      checksum_sha256: checksum(`proof-${suffix}`)
    }
  });
  expect(proofAttachmentRes.status(), await proofAttachmentRes.text()).toBe(201);
  const proofAttachment = (await proofAttachmentRes.json()) as { id: string };

  const proofKey = `e2e-proof-${suffix}`;
  const proofRes = await request.post(`${API_BASE}/deliveries/${delivery.id}/proof`, {
    headers: { ...headers, "Idempotency-Key": proofKey },
    data: {
      delivery_stop_id: stopId,
      proof_type: "PHOTO",
      attachment_id: proofAttachment.id,
      captured_at: futureDateTime(1)
    }
  });
  expect(proofRes.status(), await proofRes.text()).toBe(201);

  const disputeAttachmentRes = await request.post(`${API_BASE}/attachments`, {
    headers,
    data: {
      bucket_name: "incident-proofs",
      object_key: `e2e/dispute/${suffix}.jpg`,
      file_name: `dispute-${suffix}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 64,
      checksum_sha256: checksum(`dispute-${suffix}`)
    }
  });
  expect(disputeAttachmentRes.status(), await disputeAttachmentRes.text()).toBe(201);
  const disputeAttachment = (await disputeAttachmentRes.json()) as { id: string };

  const createDisputeRes = await request.post(`${API_BASE}/deliveries/${delivery.id}/disputes`, {
    headers,
    data: {
      delivery_stop_id: stopId,
      delta_portions: -2,
      reason: "Kemasan rusak saat serah terima",
      attachments: [{ attachment_id: disputeAttachment.id }]
    }
  });
  expect(createDisputeRes.status(), await createDisputeRes.text()).toBe(201);
  const dispute = (await createDisputeRes.json()) as { id: string };

  const resolveRes = await request.post(`${API_BASE}/disputes/${dispute.id}/resolve`, {
    headers,
    data: {
      resolution: "ACCEPT",
      stock_action: "WASTE",
      item_id: itemId,
      qty: 1,
      reason_code: "DISPUTE_WASTE"
    }
  });
  expect(resolveRes.status(), await resolveRes.text()).toBe(200);
  const resolveBody = (await resolveRes.json()) as { stock_move_id?: string | null };
  expect(resolveBody.stock_move_id).toBeTruthy();
});

test("negative tenancy: user tenant B tidak boleh akses resource tenant A", async ({ request }) => {
  const superAdmin = await loginAs(request, "superadmin");
  const superHeaders = authHeaders(superAdmin.access_token);

  const lookupsRes = await request.get(`${API_BASE}/lookups/master?include=schools,recipes`, { headers: superHeaders });
  expect(lookupsRes.status()).toBe(200);
  const lookups = (await lookupsRes.json()) as { schools: Array<{ id: string }>; recipes: Array<{ id: string }> };

  const plan = await createPlanWithFallback(
    request,
    superHeaders,
    lookups.schools[0].id,
    lookups.recipes[0].id,
    50,
    uniqueSuffix("tenant-neg")
  );

  const tenantB = await loginAs(request, "admin_sppgb");
  const tenantBHeaders = authHeaders(tenantB.access_token);

  const crossRead = await request.post(`${API_BASE}/menu-plans/${plan.id}/submit`, {
    headers: tenantBHeaders,
    data: {}
  });
  expect([403, 404]).toContain(crossRead.status());
});
