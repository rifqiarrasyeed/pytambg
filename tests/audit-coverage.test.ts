import { describe, expect, it } from "vitest";
import { parseHealthIntegrityQuery } from "../src/modules/qa/health-integrity-query";
import { parseAuditLogFilter } from "../src/modules/audit/audit-log-filter";

describe("audit coverage parsers", () => {
  it("parseHealthIntegrityQuery memakai default aman", () => {
    const parsed = parseHealthIntegrityQuery({});
    expect(parsed.audit_window_hours).toBe(24);
    expect(parsed.include_samples).toBe(false);
    expect(parsed.sample_limit).toBe(10);
  });

  it("parseHealthIntegrityQuery menerima query eksplisit", () => {
    const parsed = parseHealthIntegrityQuery({
      audit_window_hours: "48",
      include_samples: "true",
      sample_limit: "25"
    });
    expect(parsed.audit_window_hours).toBe(48);
    expect(parsed.include_samples).toBe(true);
    expect(parsed.sample_limit).toBe(25);
  });

  it("parseAuditLogFilter mendukung entity_id dan action", () => {
    const parsed = parseAuditLogFilter({
      entity_table: "sessions_tokens",
      entity_id: "11111111-1111-4111-8111-111111111111",
      action: "ACTIVE_SPPG_SWITCH",
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      start_at: "2026-02-26T00:00:00.000Z",
      end_at: "2026-02-26T23:59:59.000Z",
      limit: "30"
    });

    expect(parsed.entity_table).toBe("sessions_tokens");
    expect(parsed.entity_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.action).toBe("ACTIVE_SPPG_SWITCH");
    expect(parsed.actor_user_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.limit).toBe(30);
  });
});
