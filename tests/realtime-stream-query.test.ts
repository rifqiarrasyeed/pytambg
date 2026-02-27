import { describe, expect, it } from "vitest";
import { ApiError } from "../src/utils/api-error";
import { parseWorkspaceStreamQuery } from "../src/modules/reports/realtime-stream-query";

describe("parseWorkspaceStreamQuery", () => {
  it("pakai default aman jika query kosong", () => {
    const parsed = parseWorkspaceStreamQuery({});
    expect(parsed.topics).toEqual(["reports"]);
    expect(parsed.interval_seconds).toBe(10);
    expect(parsed.delivery_id).toBeUndefined();
  });

  it("mendukung kombinasi topics valid dan deduplicate", () => {
    const parsed = parseWorkspaceStreamQuery({
      topics: "reports,delivery,reports",
      interval_seconds: "15"
    });
    expect(parsed.topics).toEqual(["reports", "delivery"]);
    expect(parsed.interval_seconds).toBe(15);
  });

  it("menolak topic tidak dikenal", () => {
    expect(() =>
      parseWorkspaceStreamQuery({
        topics: "reports,unknown"
      })
    ).toThrowError(ApiError);
  });
});
