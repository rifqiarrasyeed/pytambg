import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { requireActiveSppg, requireAuth, requirePermission } from "../src/policies/guards";
import { ApiError } from "../src/utils/api-error";

function makeRequest(
  patch: Partial<Pick<FastifyRequest, "auth" | "activeSppgId">> = {}
): FastifyRequest {
  return {
    auth: patch.auth,
    activeSppgId: patch.activeSppgId
  } as FastifyRequest;
}

describe("guards", () => {
  it("requireAuth menolak request tanpa auth", () => {
    const request = makeRequest();
    expect(() => requireAuth(request)).toThrow(ApiError);
    try {
      requireAuth(request);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("UNAUTHORIZED");
    }
  });

  it("requireActiveSppg menolak non-superadmin tanpa active_sppg", () => {
    const request = makeRequest({
      auth: {
        user_id: "user-1",
        active_sppg_id: null,
        roles: ["ADMIN_SPPG"],
        is_super_admin: false,
        session_id: "sess-1"
      }
    });

    expect(() => requireActiveSppg(request)).toThrow(ApiError);
    try {
      requireActiveSppg(request);
    } catch (error) {
      expect((error as ApiError).code).toBe("ACTIVE_SPPG_REQUIRED");
    }
  });

  it("requireActiveSppg mengizinkan superadmin tanpa active_sppg", () => {
    const request = makeRequest({
      auth: {
        user_id: "user-1",
        active_sppg_id: null,
        roles: ["SUPER_ADMIN"],
        is_super_admin: true,
        session_id: "sess-1"
      }
    });
    expect(requireActiveSppg(request)).toBe("");
  });

  it("requirePermission menolak role tanpa izin", () => {
    const request = makeRequest({
      auth: {
        user_id: "user-1",
        active_sppg_id: "sppg-1",
        roles: ["DRIVER"],
        is_super_admin: false,
        session_id: "sess-1"
      },
      activeSppgId: "sppg-1"
    });

    expect(() => requirePermission(request, "planning.approve")).toThrow(ApiError);
    try {
      requirePermission(request, "planning.approve");
    } catch (error) {
      expect((error as ApiError).code).toBe("PERMISSION_DENIED");
    }
  });

  it("requirePermission mengizinkan role yang punya izin", () => {
    const request = makeRequest({
      auth: {
        user_id: "user-1",
        active_sppg_id: "sppg-1",
        roles: ["ADMIN_SPPG"],
        is_super_admin: false,
        session_id: "sess-1"
      },
      activeSppgId: "sppg-1"
    });

    expect(() => requirePermission(request, "planning.approve")).not.toThrow();
  });
});

