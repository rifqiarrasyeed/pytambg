import { z } from "zod";
import { unprocessable } from "../../utils/api-error";

export const realtimeTopics = ["reports", "delivery"] as const;
export type RealtimeTopic = (typeof realtimeTopics)[number];

const streamQuerySchema = z.object({
  topics: z.string().optional().default("reports"),
  delivery_id: z.string().uuid().optional(),
  interval_seconds: z.coerce.number().int().min(5).max(60).default(10)
});

export type WorkspaceStreamQuery = {
  topics: RealtimeTopic[];
  delivery_id?: string;
  interval_seconds: number;
};

export function parseWorkspaceStreamQuery(input: unknown): WorkspaceStreamQuery {
  const parsed = streamQuerySchema.parse(input);
  const requested = parsed.topics
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  const topics = requested.length === 0 ? ["reports"] : requested;
  const invalid = topics.filter((topic) => !realtimeTopics.includes(topic as RealtimeTopic));
  if (invalid.length > 0) {
    throw unprocessable("topics tidak valid untuk workspace stream", {
      invalid_topics: invalid,
      allowed_topics: realtimeTopics
    });
  }

  return {
    topics: Array.from(new Set(topics)) as RealtimeTopic[],
    delivery_id: parsed.delivery_id,
    interval_seconds: parsed.interval_seconds
  };
}
