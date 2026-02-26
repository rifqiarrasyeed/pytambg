import { z } from "zod";

const schema = z.object({
  entity_table: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  action: z.string().max(40).optional(),
  actor_user_id: z.string().uuid().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export type AuditLogFilter = z.infer<typeof schema>;

export function parseAuditLogFilter(input: unknown): AuditLogFilter {
  return schema.parse(input);
}
