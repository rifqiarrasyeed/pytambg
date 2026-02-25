import { Client } from "pg";
import "./_env";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: required("DATABASE_URL") });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE;");
    await client.query("CREATE SCHEMA public;");
    await client.query("GRANT ALL ON SCHEMA public TO public;");
    await client.query("GRANT ALL ON SCHEMA public TO postgres;");
    // eslint-disable-next-line no-console
    console.info("[db-reset] public schema reset complete");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[db-reset] failed", error);
  process.exit(1);
});
