import type { PoolClient } from "pg";
import { query } from "../db/pool";

export type AuditEventInput = {
  sppgId: string;
  entityTable: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  actorUserId: string;
  actorRole: string;
  requestId: string;
  deviceId?: string;
  ip?: string;
  userAgent?: string;
};

async function runQuery(text: string, params: unknown[], client?: PoolClient): Promise<void> {
  if (client) {
    await client.query(text, params);
    return;
  }
  await query(text, params);
}

export async function writeAudit(event: AuditEventInput, client?: PoolClient): Promise<void> {
  await runQuery(
    `
      INSERT INTO audit_logs (
        id,
        sppg_id,
        entity_table,
        entity_id,
        action,
        old_value,
        new_value,
        actor_user_id,
        actor_role,
        occurred_at,
        request_id,
        device_id,
        ip,
        user_agent,
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
        $5::jsonb,
        $6::jsonb,
        $7,
        $8,
        now(),
        $9,
        $10,
        $11,
        $12,
        now(),
        $7,
        now(),
        $7
      )
    `,
    [
      event.sppgId,
      event.entityTable,
      event.entityId,
      event.action,
      JSON.stringify(event.oldValue ?? {}),
      JSON.stringify(event.newValue ?? {}),
      event.actorUserId,
      event.actorRole,
      event.requestId,
      event.deviceId ?? null,
      event.ip ?? null,
      event.userAgent ?? null
    ],
    client
  );
}