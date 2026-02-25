import type { PoolClient } from "pg";
import { config } from "../config";
import { query } from "../db/pool";
import { conflict } from "../utils/api-error";

export type IdempotencyReplay = {
  replay: true;
  responseCode: number;
  responseBody: unknown;
};

export type IdempotencyLock = {
  replay: false;
};

export async function acquireIdempotency(
  client: PoolClient,
  args: {
    sppgId: string;
    endpoint: string;
    key: string;
    requestHash: string;
  }
): Promise<IdempotencyReplay | IdempotencyLock> {
  const existing = await client.query<{
    request_hash: string;
    response_code: number | null;
    response_body: unknown;
    expires_at: string;
  }>(
    `
      SELECT request_hash, response_code, response_body, expires_at
      FROM idempotency_keys
      WHERE sppg_id = $1 AND endpoint = $2 AND key = $3
      FOR UPDATE
    `,
    [args.sppgId, args.endpoint, args.key]
  );

  if (existing.rowCount && existing.rows[0]) {
    const row = existing.rows[0];
    if (row.request_hash !== args.requestHash) {
      throw conflict("IDEMPOTENCY_CONFLICT", "Idempotency key sudah digunakan untuk payload berbeda");
    }
    if (row.response_code !== null) {
      return {
        replay: true,
        responseCode: row.response_code,
        responseBody: row.response_body
      };
    }

    throw conflict("IDEMPOTENCY_CONFLICT", "Permintaan idempotent masih diproses");
  }

  await client.query(
    `
      INSERT INTO idempotency_keys (
        id,
        sppg_id,
        key,
        endpoint,
        request_hash,
        response_code,
        response_body,
        expires_at,
        created_at,
        created_by,
        updated_at,
        updated_by
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        NULL,
        '{}'::jsonb,
        now() + ($5 || ' hour')::interval,
        now(),
        '00000000-0000-0000-0000-000000000000',
        now(),
        '00000000-0000-0000-0000-000000000000'
      )
    `,
    [args.sppgId, args.key, args.endpoint, args.requestHash, String(config.idempotencyTtlHours)]
  );

  return { replay: false };
}

export async function saveIdempotencyResult(
  client: PoolClient,
  args: {
    sppgId: string;
    endpoint: string;
    key: string;
    responseCode: number;
    responseBody: unknown;
  }
): Promise<void> {
  await client.query(
    `
      UPDATE idempotency_keys
      SET response_code = $4,
          response_body = $5::jsonb,
          updated_at = now()
      WHERE sppg_id = $1 AND endpoint = $2 AND key = $3
    `,
    [args.sppgId, args.endpoint, args.key, args.responseCode, JSON.stringify(args.responseBody)]
  );
}

export async function purgeExpiredIdempotency(): Promise<number> {
  const result = await query("DELETE FROM idempotency_keys WHERE expires_at < now()");
  return result.rowCount ?? 0;
}