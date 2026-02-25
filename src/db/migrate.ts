import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "./pool";

async function applySql(filePath: string): Promise<void> {
  const sql = await readFile(filePath, "utf8");
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.info(`[migrate] applied ${filePath}`);
}

async function run(): Promise<void> {
  const root = process.cwd();
  const schemaPath = resolve(root, "sql", "schema.sql");
  const migrationsDir = resolve(root, "sql", "migrations");

  try {
    await applySql(schemaPath);

    const entries = await readdir(migrationsDir, { withFileTypes: true }).catch(() => []);
    const migrationFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    for (const fileName of migrationFiles) {
      await applySql(resolve(migrationsDir, fileName));
    }

    console.info("Schema + migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
