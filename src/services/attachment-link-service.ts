import { ApiError } from "../utils/api-error";

type QueryResultRow = Record<string, unknown>;
type QueryResult<T extends QueryResultRow> = {
  rows: T[];
  rowCount: number | null;
};
type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export async function assertAttachmentsOwned(
  client: Queryable,
  args: {
    sppgId: string;
    attachmentIds: string[];
  }
): Promise<string[]> {
  const ids = uniqueIds(args.attachmentIds);
  if (ids.length === 0) {
    return [];
  }

  const owned = await client.query<{ id: string }>(
    `
      SELECT id
      FROM attachments
      WHERE sppg_id = $1
        AND id = ANY($2::uuid[])
    `,
    [args.sppgId, ids]
  );

  const ownedIds = new Set(owned.rows.map((row) => row.id));
  if (ownedIds.size !== ids.length) {
    const invalidIds = ids.filter((id) => !ownedIds.has(id));
    throw new ApiError(422, "VALIDATION_ERROR", "Attachment tidak valid untuk SPPG aktif", {
      invalid_attachment_ids: invalidIds
    });
  }

  return ids;
}

export async function linkAttachments(
  client: Queryable,
  args: {
    sppgId: string;
    entityTable: string;
    entityId: string;
    attachmentIds: string[];
    actorUserId: string;
    attachmentRole?: string;
  }
): Promise<void> {
  const ids = await assertAttachmentsOwned(client, {
    sppgId: args.sppgId,
    attachmentIds: args.attachmentIds
  });

  if (ids.length === 0) {
    return;
  }

  for (const attachmentId of ids) {
    await client.query(
      `
        INSERT INTO entity_attachments (
          id, sppg_id, entity_table, entity_id, attachment_id, attachment_role,
          created_at, created_by, updated_at, updated_by
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          now(), $6, now(), $6
        )
        ON CONFLICT (sppg_id, entity_table, entity_id, attachment_id) DO NOTHING
      `,
      [
        args.sppgId,
        args.entityTable,
        args.entityId,
        attachmentId,
        args.attachmentRole ?? "EVIDENCE",
        args.actorUserId
      ]
    );
  }
}
