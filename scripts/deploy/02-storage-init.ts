import { createClient } from "@supabase/supabase-js";
import "./_env";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

const BUCKETS = [
  process.env.SUPABASE_BUCKET_DELIVERY_PROOFS ?? "delivery-proofs",
  process.env.SUPABASE_BUCKET_QC_PROOFS ?? "qc-proofs",
  process.env.SUPABASE_BUCKET_INCIDENT_PROOFS ?? "incident-proofs",
  process.env.SUPABASE_BUCKET_INVOICES ?? "invoices",
  process.env.SUPABASE_BUCKET_EXPORTS ?? "exports"
];

async function ensureBucket(client: ReturnType<typeof createClient>, bucket: string): Promise<void> {
  const check = await client.storage.getBucket(bucket);
  if (!check.error && check.data) {
    // eslint-disable-next-line no-console
    console.info(`[storage-init] bucket exists: ${bucket}`);
    return;
  }

  const created = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: "15MB"
  });
  if (created.error) {
    throw new Error(`Failed to create bucket ${bucket}: ${created.error.message}`);
  }
  // eslint-disable-next-line no-console
  console.info(`[storage-init] bucket created: ${bucket}`);
}

async function main(): Promise<void> {
  const url = required("SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  for (const bucket of BUCKETS) {
    await ensureBucket(client, bucket);
  }

  // eslint-disable-next-line no-console
  console.info("[storage-init] complete");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[storage-init] failed", error);
  process.exit(1);
});
