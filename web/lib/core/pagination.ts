import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort_by: z.string().optional(),
  sort_dir: z.enum(["asc", "desc"]).default("desc")
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function parseListQuery(input: URLSearchParams): ListQuery {
  return listQuerySchema.parse({
    page: input.get("page") ?? undefined,
    page_size: input.get("page_size") ?? undefined,
    search: input.get("search") ?? undefined,
    status: input.get("status") ?? undefined,
    date_from: input.get("date_from") ?? undefined,
    date_to: input.get("date_to") ?? undefined,
    sort_by: input.get("sort_by") ?? undefined,
    sort_dir: input.get("sort_dir") ?? undefined
  });
}

export function toListResponse<T>(rows: T[], total: number, page: number, pageSize: number) {
  return {
    data: rows,
    page,
    page_size: pageSize,
    total,
    has_next: page * pageSize < total
  };
}

