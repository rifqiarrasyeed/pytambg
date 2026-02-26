const deliveryTransitions: Record<string, string[]> = {
  PLANNED: ["LOADED", "IN_TRANSIT"],
  LOADED: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: ["VERIFIED", "DISPUTED"],
  DISPUTED: ["RESOLVED"],
  RESOLVED: ["VERIFIED"],
  VERIFIED: []
};

const productionTransitions: Record<string, string[]> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["DONE"],
  DONE: []
};

const planTransitions: Record<string, string[]> = {
  DRAFT: ["APPROVED"],
  APPROVED: ["LOCKED", "ADJUSTMENT_REQUESTED"],
  ADJUSTMENT_REQUESTED: ["APPROVED_ADJUSTMENT"],
  APPROVED_ADJUSTMENT: ["LOCKED"],
  LOCKED: []
};

export function canTransition(kind: "delivery" | "production" | "plan", from: string, to: string) {
  const map = kind === "delivery" ? deliveryTransitions : kind === "production" ? productionTransitions : planTransitions;
  return map[from]?.includes(to) ?? false;
}

