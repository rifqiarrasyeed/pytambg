import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  sort_by: z.string().trim().min(1).optional(),
  sort_dir: z.enum(["asc", "desc"]).optional()
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export type PagingMeta = {
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

export function parseListQuery(value: unknown): ListQuery & { offset: number } {
  const parsed = listQuerySchema.parse(value);
  const offset = (parsed.page - 1) * parsed.page_size;
  return { ...parsed, offset };
}

export function buildPagingMeta(page: number, pageSize: number, total: number): PagingMeta {
  return {
    page,
    page_size: pageSize,
    total,
    has_next: page * pageSize < total
  };
}

