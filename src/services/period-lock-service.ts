import { query } from "../db/pool";
import { conflict } from "../utils/api-error";

export async function assertPeriodUnlocked(sppgId: string, date: string): Promise<void> {
  const result = await query<{ status: string }>(
    `
      SELECT status
      FROM period_locks
      WHERE sppg_id = $1 AND period_date = $2::date
      LIMIT 1
    `,
    [sppgId, date]
  );

  const row = result.rows[0];
  if (!row) {
    return;
  }

  if (row.status === "LOCKED" || row.status === "RELOCKED") {
    throw conflict("PERIOD_LOCKED", "Periode sudah dikunci");
  }
}