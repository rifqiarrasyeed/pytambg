import { describe, expect, it } from "vitest";
import { hasPermission, permissionsForRoles } from "../src/policies/permissions";

describe("permission policy", () => {
  it("SUPER_ADMIN memiliki semua permission operasional", () => {
    expect(hasPermission(["SUPER_ADMIN"], "audit.view")).toBe(true);
    expect(hasPermission(["SUPER_ADMIN"], "delivery.verify")).toBe(true);
    expect(hasPermission(["SUPER_ADMIN"], "period.unlock")).toBe(true);
  });

  it("DRIVER tidak boleh approve planning", () => {
    expect(hasPermission(["DRIVER"], "planning.approve")).toBe(false);
  });

  it("SCHOOL_VERIFIER boleh verify delivery", () => {
    expect(hasPermission(["SCHOOL_VERIFIER"], "delivery.verify")).toBe(true);
  });

  it("AUDITOR_VIEWER tidak boleh mutate master", () => {
    expect(hasPermission(["AUDITOR_VIEWER"], "master.write")).toBe(false);
  });

  it("ADMIN_SPPG boleh export report", () => {
    expect(hasPermission(["ADMIN_SPPG"], "report.export")).toBe(true);
  });

  it("permissionsForRoles merge seluruh izin role aktif", () => {
    const permissions = permissionsForRoles(["DRIVER", "SCHOOL_VERIFIER"]);
    expect(permissions).toContain("delivery.upload_proof");
    expect(permissions).toContain("delivery.verify");
    expect(permissions).not.toContain("planning.approve");
  });
});
