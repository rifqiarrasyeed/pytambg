import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "./pool";

async function run(): Promise<void> {
  const schemaPath = resolve(process.cwd(), "sql", "schema.sql");
  const sql = await readFile(schemaPath, "utf8");

  try {
    await pool.query(sql);
    console.info("Schema migrated successfully.");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});