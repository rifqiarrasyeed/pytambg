type SortDirection = "ASC" | "DESC";

export function resolveOrderBy(
  args: {
    sortBy?: string;
    sortDir?: string;
    allowed: Record<string, string>;
    fallback: string;
  }
): { sql: string; valid: boolean } {
  if (!args.sortBy) {
    return { sql: args.fallback, valid: true };
  }

  const column = args.allowed[args.sortBy];
  if (!column) {
    return { sql: args.fallback, valid: false };
  }

  const direction: SortDirection = args.sortDir?.toLowerCase() === "asc" ? "ASC" : "DESC";
  return { sql: `${column} ${direction}`, valid: true };
}
