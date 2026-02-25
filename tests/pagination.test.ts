import { describe, expect, it } from "vitest";
import { buildPagingMeta, parseListQuery } from "../src/utils/pagination";

describe("pagination utils", () => {
  it("parseListQuery mengisi default paging", () => {
    const result = parseListQuery({});
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("parseListQuery menghitung offset", () => {
    const result = parseListQuery({ page: 3, page_size: 15 });
    expect(result.offset).toBe(30);
  });

  it("buildPagingMeta menghitung has_next", () => {
    expect(buildPagingMeta(1, 20, 25).has_next).toBe(true);
    expect(buildPagingMeta(2, 20, 25).has_next).toBe(false);
  });
});

