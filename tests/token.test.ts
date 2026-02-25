import { describe, expect, it } from "vitest";
import { composeRefreshToken, parseRefreshToken } from "../src/utils/token";

describe("refresh token helpers", () => {
  it("compose + parse token valid", () => {
    const token = composeRefreshToken("session-1", "secret-1");
    const parsed = parseRefreshToken(token);
    expect(parsed.sessionId).toBe("session-1");
    expect(parsed.secretPart).toBe("secret-1");
  });

  it("parse token invalid melempar error", () => {
    expect(() => parseRefreshToken("invalidtoken")).toThrow();
  });
});