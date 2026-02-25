import { describe, expect, it } from "vitest";
import { resolveOrderBy } from "../src/utils/sorting";

describe("sorting utils", () => {
  it("mengembalikan fallback saat sort_by tidak diisi", () => {
    const order = resolveOrderBy({
      allowed: { created_at: "created_at" },
      fallback: "created_at DESC"
    });
    expect(order).toEqual({ sql: "created_at DESC", valid: true });
  });

  it("menolak sort_by di luar allowlist", () => {
    const order = resolveOrderBy({
      sortBy: "drop_table",
      sortDir: "asc",
      allowed: { created_at: "created_at" },
      fallback: "created_at DESC"
    });
    expect(order).toEqual({ sql: "created_at DESC", valid: false });
  });

  it("membentuk ORDER BY yang valid dari allowlist", () => {
    const asc = resolveOrderBy({
      sortBy: "created_at",
      sortDir: "asc",
      allowed: { created_at: "created_at" },
      fallback: "created_at DESC"
    });
    const desc = resolveOrderBy({
      sortBy: "created_at",
      sortDir: "desc",
      allowed: { created_at: "created_at" },
      fallback: "created_at DESC"
    });

    expect(asc).toEqual({ sql: "created_at ASC", valid: true });
    expect(desc).toEqual({ sql: "created_at DESC", valid: true });
  });
});

