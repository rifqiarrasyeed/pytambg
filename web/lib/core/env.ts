import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/postgres"),
  NEXTAUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-at-least-32chars"),
  NEXTAUTH_URL: z.string().url().optional(),
  APP_URL: z.string().url().default("http://localhost:3001"),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_MERCHANT_ID: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: z.enum(["true", "false"]).default("false"),
  MIDTRANS_WEBHOOK_SIGNATURE_MODE: z.enum(["sha512", "none"]).default("sha512"),
  SUBSCRIPTION_GRACE_DAYS: z.string().default("7"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_UPLOAD_DIR: z.string().default("./.uploads"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default("ap-southeast-1")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment: ${message}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  midtransIsProduction: raw.MIDTRANS_IS_PRODUCTION === "true",
  subscriptionGraceDays: Number.parseInt(raw.SUBSCRIPTION_GRACE_DAYS, 10)
};

