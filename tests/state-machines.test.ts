import { describe, expect, it } from "vitest";
import {
  assertTransition,
  DELIVERY_TRANSITIONS,
  MENU_PLAN_TRANSITIONS,
  OPNAME_TRANSITIONS,
  PERIOD_LOCK_TRANSITIONS
} from "../src/policies/state-machines";

describe("state machine guard", () => {
  it("menu plan valid transition DRAFT->SUBMITTED", () => {
    expect(() => assertTransition("DRAFT", "SUBMITTED", MENU_PLAN_TRANSITIONS, "menu plan")).not.toThrow();
  });

  it("menu plan invalid transition DRAFT->APPROVED ditolak", () => {
    expect(() => assertTransition("DRAFT", "APPROVED", MENU_PLAN_TRANSITIONS, "menu plan")).toThrow();
  });

  it("delivery valid transition IN_TRANSIT->DELIVERED", () => {
    expect(() => assertTransition("IN_TRANSIT", "DELIVERED", DELIVERY_TRANSITIONS, "delivery")).not.toThrow();
  });

  it("delivery invalid transition PLANNED->DELIVERED", () => {
    expect(() => assertTransition("PLANNED", "DELIVERED", DELIVERY_TRANSITIONS, "delivery")).toThrow();
  });

  it("opname invalid transition COUNTED->APPROVED", () => {
    expect(() => assertTransition("COUNTED", "APPROVED", OPNAME_TRANSITIONS, "opname")).toThrow();
  });

  it("period lock valid transition LOCKED->UNLOCK_REQUESTED", () => {
    expect(() => assertTransition("LOCKED", "UNLOCK_REQUESTED", PERIOD_LOCK_TRANSITIONS, "period lock")).not.toThrow();
  });
});
