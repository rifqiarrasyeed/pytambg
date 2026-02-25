import { pool, query } from "../db/pool";

async function runOnce(): Promise<void> {
  const purge = await query<{ count: string }>(
    `
      WITH deleted AS (
        DELETE FROM idempotency_keys
        WHERE expires_at < now()
        RETURNING 1
      )
      SELECT COUNT(*)::text AS count FROM deleted
    `
  );

  await query("REFRESH MATERIALIZED VIEW CONCURRENTLY stock_balances_mv");

  // eslint-disable-next-line no-console
  console.info(`[maintenance-worker] purged idempotency keys: ${purge.rows[0]?.count ?? "0"}`);
}

async function run(): Promise<void> {
  const once = process.argv.includes("--once");
  const intervalMs = Number.parseInt(process.env.MAINTENANCE_INTERVAL_MS ?? "600000", 10);

  if (once) {
    await runOnce();
    await pool.end();
    return;
  }

  // eslint-disable-next-line no-console
  console.info(`[maintenance-worker] started interval=${intervalMs}ms`);
  const timer = setInterval(async () => {
    try {
      await runOnce();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[maintenance-worker] loop error", error);
    }
  }, intervalMs);

  const stop = async () => {
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[maintenance-worker] fatal", error);
  await pool.end();
  process.exit(1);
});
