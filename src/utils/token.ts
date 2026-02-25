import crypto from "node:crypto";

export function randomToken(size = 48): string {
  return crypto.randomBytes(size).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function composeRefreshToken(sessionId: string, secretPart: string): string {
  return `${sessionId}.${secretPart}`;
}

export function parseRefreshToken(token: string): { sessionId: string; secretPart: string } {
  const pieces = token.split(".");
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) {
    throw new Error("Invalid refresh token format");
  }
  return { sessionId: pieces[0], secretPart: pieces[1] };
}