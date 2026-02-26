import { z } from "zod";

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean());

const schema = z.object({
  audit_window_hours: z.coerce.number().int().min(1).max(168).default(24),
  include_samples: booleanQuerySchema.default(false),
  sample_limit: z.coerce.number().int().min(1).max(50).default(10)
});

export type HealthIntegrityQuery = z.infer<typeof schema>;

export function parseHealthIntegrityQuery(input: unknown): HealthIntegrityQuery {
  return schema.parse(input);
}
