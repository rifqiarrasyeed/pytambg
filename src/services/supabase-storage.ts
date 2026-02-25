import { createHash } from "node:crypto";
import { extname } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { ApiError } from "../utils/api-error";

export type AttachmentModule = "delivery" | "qc" | "incident" | "invoice" | "export";

const moduleToBucket: Record<AttachmentModule, string> = {
  delivery: config.supabaseBuckets.deliveryProofs,
  qc: config.supabaseBuckets.qcProofs,
  incident: config.supabaseBuckets.incidentProofs,
  invoice: config.supabaseBuckets.invoices,
  export: config.supabaseBuckets.exports
};

let supabaseAdminClient: SupabaseClient | null = null;

function ensureSupabaseConfig(): { url: string; serviceKey: string } {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return {
    url: config.supabaseUrl,
    serviceKey: config.supabaseServiceRoleKey
  };
}

export function supabaseAdmin(): SupabaseClient {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const cfg = ensureSupabaseConfig();
  supabaseAdminClient = createClient(cfg.url, cfg.serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  return supabaseAdminClient;
}

export function resolveBucket(moduleName: AttachmentModule): string {
  return moduleToBucket[moduleName];
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildObjectKey(args: {
  sppgId: string;
  moduleName: AttachmentModule;
  entityId: string;
  fileName: string;
  now?: Date;
}): string {
  const current = args.now ?? new Date();
  const yyyy = current.getUTCFullYear().toString();
  const mm = String(current.getUTCMonth() + 1).padStart(2, "0");
  const base = sanitizeSegment(args.fileName.replace(extname(args.fileName), "")) || "file";
  const ext = extname(args.fileName).toLowerCase() || ".bin";
  const stamp = `${current.getUTCHours()}${current.getUTCMinutes()}${current.getUTCSeconds()}${current.getUTCMilliseconds()}`;
  return `${args.sppgId}/${args.moduleName}/${yyyy}/${mm}/${args.entityId}/${base}-${stamp}${ext}`;
}

export async function createSignedUpload(args: {
  bucket: string;
  objectKey: string;
}): Promise<{ token: string; signedUrl: string; path: string }> {
  const admin = supabaseAdmin();
  const result = await admin.storage.from(args.bucket).createSignedUploadUrl(args.objectKey);
  if (result.error || !result.data) {
    throw new ApiError(500, "INTERNAL_ERROR", `Gagal membuat signed upload URL: ${result.error?.message ?? "unknown"}`);
  }

  return {
    token: result.data.token,
    signedUrl: result.data.signedUrl,
    path: args.objectKey
  };
}

export async function verifyUploadedObject(args: {
  bucket: string;
  objectKey: string;
  checksumSha256?: string;
}): Promise<{ sizeBytes: number; checksumSha256?: string }> {
  const admin = supabaseAdmin();
  const download = await admin.storage.from(args.bucket).download(args.objectKey);
  if (download.error || !download.data) {
    throw new ApiError(422, "VALIDATION_ERROR", `Object belum tersedia di storage: ${download.error?.message ?? "unknown"}`);
  }

  const bytes = Buffer.from(await download.data.arrayBuffer());
  if (bytes.length > config.maxUploadBytes) {
    throw new ApiError(422, "VALIDATION_ERROR", "Ukuran file melebihi batas upload");
  }

  if (args.checksumSha256) {
    const calculated = createHash("sha256").update(bytes).digest("hex");
    if (calculated !== args.checksumSha256.toLowerCase()) {
      throw new ApiError(422, "VALIDATION_ERROR", "Checksum file tidak cocok", {
        expected: args.checksumSha256.toLowerCase(),
        actual: calculated
      });
    }
  }

  return {
    sizeBytes: bytes.length,
    checksumSha256: args.checksumSha256?.toLowerCase()
  };
}

export async function createSignedReadUrl(args: {
  bucket: string;
  objectKey: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const admin = supabaseAdmin();
  const result = await admin.storage
    .from(args.bucket)
    .createSignedUrl(args.objectKey, args.expiresInSeconds ?? config.storageSignedUrlTtlSeconds);

  if (result.error || !result.data?.signedUrl) {
    throw new ApiError(500, "INTERNAL_ERROR", `Gagal membuat signed read URL: ${result.error?.message ?? "unknown"}`);
  }

  return result.data.signedUrl;
}

export async function uploadTextObject(args: {
  bucket: string;
  objectKey: string;
  content: string;
  contentType: string;
}): Promise<void> {
  const admin = supabaseAdmin();
  const upload = await admin.storage
    .from(args.bucket)
    .upload(args.objectKey, Buffer.from(args.content, "utf8"), {
      contentType: args.contentType,
      upsert: true
    });

  if (upload.error) {
    throw new ApiError(500, "INTERNAL_ERROR", `Gagal upload object: ${upload.error.message}`);
  }
}