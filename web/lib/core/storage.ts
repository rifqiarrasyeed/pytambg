import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/core/env";

function createS3Client() {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    throw new Error("S3 env belum lengkap");
  }

  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY
    },
    forcePathStyle: true
  });
}

export function randomObjectKey(tenantId: string, moduleName: string, fileName: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const token = crypto.randomBytes(5).toString("hex");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${tenantId}/${moduleName}/${y}/${m}/${token}-${safeName}`;
}

export async function createUploadUrl(objectKey: string, mimeType: string) {
  if (env.STORAGE_DRIVER === "s3") {
    const client = createS3Client();
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
      ContentType: mimeType
    });
    const url = await getSignedUrl(client, command, { expiresIn: 900 });
    return { url, method: "PUT" as const };
  }

  const payload = `${objectKey}|${Date.now() + 1000 * 60 * 15}`;
  const signature = crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(payload).digest("hex");
  const url = `/api/files/local-upload?payload=${encodeURIComponent(payload)}&signature=${signature}`;
  return { url, method: "PUT" as const };
}

export async function createReadUrl(objectKey: string) {
  if (env.STORAGE_DRIVER === "s3") {
    const client = createS3Client();
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey
    });
    const url = await getSignedUrl(client, command, { expiresIn: 300 });
    return url;
  }

  const payload = `${objectKey}|${Date.now() + 1000 * 60 * 5}`;
  const signature = crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(payload).digest("hex");
  return `/api/files/local-download?payload=${encodeURIComponent(payload)}&signature=${signature}`;
}

export function verifyLocalSignedPayload(payload: string, signature: string): { valid: boolean; objectKey?: string; expiresAt?: number } {
  const expected = crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(payload).digest("hex");
  if (expected !== signature) {
    return { valid: false };
  }

  const [objectKey, expiresRaw] = payload.split("|");
  const expiresAt = Number.parseInt(expiresRaw ?? "0", 10);
  if (!objectKey || !Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { valid: false };
  }

  return { valid: true, objectKey, expiresAt };
}

export async function writeLocalFile(objectKey: string, data: Buffer) {
  const root = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
  const target = path.join(root, objectKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
}

export async function readLocalFile(objectKey: string) {
  const root = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
  const target = path.join(root, objectKey);
  return fs.readFile(target);
}

