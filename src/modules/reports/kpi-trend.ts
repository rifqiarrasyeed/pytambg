import { z } from "zod";
import { unprocessable } from "../../utils/api-error";

export const kpiTrendSchema = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  granularity: z.enum(["day"]).default("day")
});

function daysBetween(dateFrom: Date, dateTo: Date): number {
  return Math.floor((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24));
}

export function resolveKpiTrendRange(input: unknown): {
  dateFrom: string;
  dateTo: string;
  granularity: "day";
} {
  const parsed = kpiTrendSchema.parse(input);
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const fallbackFrom = new Date(today);
  fallbackFrom.setDate(today.getDate() - 13);

  const dateFrom = parsed.date_from ?? fallbackFrom.toISOString().slice(0, 10);
  const dateTo = parsed.date_to ?? todayIso;

  const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
  const toDate = new Date(`${dateTo}T00:00:00.000Z`);

  if (fromDate > toDate) {
    throw unprocessable("date_from tidak boleh lebih besar dari date_to");
  }
  if (daysBetween(fromDate, toDate) > 120) {
    throw unprocessable("Rentang tanggal maksimal 120 hari");
  }

  return {
    dateFrom,
    dateTo,
    granularity: parsed.granularity
  };
}

