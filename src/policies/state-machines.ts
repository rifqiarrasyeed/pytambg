import { conflict } from "../utils/api-error";

export type StateName = string;

export function assertTransition(
  current: StateName,
  next: StateName,
  transitions: Record<string, readonly string[]>,
  entity: string
): void {
  if (current === next) {
    return;
  }

  const allowed = transitions[current] ?? [];
  if (!allowed.includes(next)) {
    throw conflict("STATE_TRANSITION_INVALID", `Transisi ${entity} tidak valid: ${current} -> ${next}`, {
      current,
      next,
      allowed
    });
  }
}

export const MENU_PLAN_TRANSITIONS = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED", "REVISED"],
  REJECTED: ["DRAFT"],
  PUBLISHED: ["LOCKED"],
  LOCKED: [] as string[],
  REVISED: ["SUBMITTED"]
} as const;

export const PO_TRANSITIONS = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["ISSUED", "CANCELLED"],
  ISSUED: ["PARTIALLY_RECEIVED", "RECEIVED_COMPLETE"],
  PARTIALLY_RECEIVED: ["RECEIVED_COMPLETE", "CLOSED"],
  RECEIVED_COMPLETE: ["CLOSED"],
  REJECTED: ["DRAFT"],
  CLOSED: [] as string[],
  CANCELLED: [] as string[]
} as const;

export const PRODUCTION_TRANSITIONS = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["QC_PENDING", "CANCELLED"],
  QC_PENDING: ["FINALIZED"],
  FINALIZED: ["CLOSED", "REOPEN_REQUESTED"],
  REOPEN_REQUESTED: ["IN_PROGRESS"],
  CLOSED: [] as string[],
  CANCELLED: [] as string[]
} as const;

export const DELIVERY_TRANSITIONS = {
  PLANNED: ["LOADED"],
  LOADED: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: ["VERIFIED", "DISPUTED"],
  DISPUTED: ["RESOLVED"],
  RESOLVED: ["VERIFIED"],
  VERIFIED: ["CLOSED"],
  CLOSED: [] as string[]
} as const;

export const STOP_TRANSITIONS = {
  PLANNED: ["LOADED"],
  LOADED: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: ["VERIFIED", "DISPUTED"],
  DISPUTED: ["RESOLVED"],
  RESOLVED: ["VERIFIED"],
  VERIFIED: ["LOCKED"],
  LOCKED: [] as string[]
} as const;

export const OPNAME_TRANSITIONS = {
  DRAFT: ["COUNTED", "CANCELLED"],
  COUNTED: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["POSTED"],
  REJECTED: ["COUNTED"],
  POSTED: [] as string[],
  CANCELLED: [] as string[]
} as const;

export const PERIOD_LOCK_TRANSITIONS = {
  OPEN: ["LOCKED"],
  LOCKED: ["UNLOCK_REQUESTED"],
  UNLOCK_REQUESTED: ["UNLOCKED"],
  UNLOCKED: ["RELOCKED"],
  RELOCKED: ["UNLOCK_REQUESTED"]
} as const;
