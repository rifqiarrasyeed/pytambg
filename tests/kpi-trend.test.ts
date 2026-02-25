import { describe, expect, it } from "vitest";
import { resolveKpiTrendRange } from "../src/modules/reports/kpi-trend";

describe("kpi trend range resolver", () => {
  it("menghasilkan default range 14 hari saat query kosong", () => {
    const result = resolveKpiTrendRange({});
    expect(result.granularity).toBe("day");
    expect(result.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("menolak date_from lebih besar dari date_to", () => {
    expect(() =>
      resolveKpiTrendRange({
        date_from: "2026-03-02",
        date_to: "2026-03-01"
      })
    ).toThrowError(/date_from/);
  });

  it("menolak rentang lebih dari 120 hari", () => {
    expect(() =>
      resolveKpiTrendRange({
        date_from: "2026-01-01",
        date_to: "2026-06-20"
      })
    ).toThrowError(/120 hari/);
  });
});

