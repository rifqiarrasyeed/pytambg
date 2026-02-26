import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();

vi.mock("@/lib/core/midtrans", () => ({
  verifyMidtransSignature: vi.fn(() => true)
}));

vi.mock("@/lib/core/db", () => ({
  prisma: {
    midtransEvent: {
      findUnique,
      create,
      update: vi.fn()
    },
    invoice: {
      findFirst: vi.fn()
    },
    payment: {
      create: vi.fn()
    },
    subscription: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  }
}));

describe("midtrans webhook idempotency", () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
  });

  it("tidak memproses ganda bila event sudah ada", async () => {
    findUnique.mockResolvedValue({ id: "evt_existing" });

    const { POST } = await import("@/app/api/billing/midtrans/webhook/route");
    const request = new Request("http://localhost/api/billing/midtrans/webhook", {
      method: "POST",
      body: JSON.stringify({
        order_id: "ORD-1",
        transaction_status: "settlement",
        transaction_id: "tx-1",
        status_code: "200",
        gross_amount: "100000",
        signature_key: "dummy"
      })
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});

