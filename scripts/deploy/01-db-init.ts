import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import "./_env";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function applySql(client: Client, filePath: string): Promise<void> {
  const sql = await readFile(filePath, "utf8");
  await client.query(sql);
  // eslint-disable-next-line no-console
  console.info(`[db-init] applied ${filePath}`);
}

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");
  const root = resolve(process.cwd());

  const schemaPath = resolve(root, "sql", "schema.sql");
  const seedPath = resolve(root, "sql", "seed.sql");
  const refreshPath = resolve(root, "sql", "refresh_stock_balances.sql");
  const integrityPath = resolve(root, "sql", "check_integrity.sql");
  const rlsCheckPath = resolve(root, "sql", "check_rls.sql");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await applySql(client, schemaPath);
    await applySql(client, seedPath);
    await applySql(client, refreshPath);
    await applySql(client, integrityPath);
    await applySql(client, rlsCheckPath);
    // eslint-disable-next-line no-console
    console.info("[db-init] complete");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[db-init] failed", error);
  process.exit(1);
});
