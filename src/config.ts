import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for env var ${name}: ${raw}`);
  }
  return parsed;
}

function csvEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: intEnv("PORT", 3000),
  databaseUrl: required("DATABASE_URL"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? "30d",
  idempotencyTtlHours: intEnv("IDEMPOTENCY_TTL_HOURS", 24),
  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  supabasePublishableKey: optional("SUPABASE_PUBLISHABLE_KEY"),
  supabaseBuckets: {
    deliveryProofs: process.env.SUPABASE_BUCKET_DELIVERY_PROOFS ?? "delivery-proofs",
    qcProofs: process.env.SUPABASE_BUCKET_QC_PROOFS ?? "qc-proofs",
    incidentProofs: process.env.SUPABASE_BUCKET_INCIDENT_PROOFS ?? "incident-proofs",
    invoices: process.env.SUPABASE_BUCKET_INVOICES ?? "invoices",
    exports: process.env.SUPABASE_BUCKET_EXPORTS ?? "exports"
  },
  storageSignedUrlTtlSeconds: intEnv("STORAGE_SIGNED_URL_TTL_SECONDS", 300),
  storageUploadSignedUrlTtlSeconds: intEnv("STORAGE_UPLOAD_SIGNED_URL_TTL_SECONDS", 900),
  maxUploadBytes: intEnv("MAX_UPLOAD_BYTES", 15 * 1024 * 1024),
  corsAllowedOrigins: csvEnv("CORS_ALLOWED_ORIGINS", ["http://localhost:3001", "http://127.0.0.1:3001"])
};
