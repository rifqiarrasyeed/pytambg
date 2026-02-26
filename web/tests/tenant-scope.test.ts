import { describe, it, expect } from "vitest";
import { assertTenantResource } from "@/lib/core/tenant";

describe("tenant scope", () => {
  it("menolak akses lintas tenant", async () => {
    const result = await assertTenantResource({ tenantId: "tenant-b" }, "tenant-a");
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.error.code).toBe("TENANT_SCOPE_VIOLATION");
    }
  });

  it("menerima resource tenant yang sama", async () => {
    const result = await assertTenantResource({ tenantId: "tenant-a" }, "tenant-a");
    expect(result).toBeNull();
  });
});

