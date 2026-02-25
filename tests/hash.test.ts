import { describe, expect, it } from "vitest";
import { hashPayload } from "../src/utils/hash";

describe("hash payload", () => {
  it("menghasilkan hash yang konsisten walau urutan key berbeda", () => {
    const a = { b: 2, a: 1, c: { z: 9, y: 8 } };
    const b = { a: 1, c: { y: 8, z: 9 }, b: 2 };
    expect(hashPayload(a)).toEqual(hashPayload(b));
  });

  it("menghasilkan hash berbeda untuk payload berbeda", () => {
    const a = { qty: 10 };
    const b = { qty: 11 };
    expect(hashPayload(a)).not.toEqual(hashPayload(b));
  });
});