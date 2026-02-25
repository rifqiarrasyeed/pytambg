"use client";

import { AlertTriangle, Ban, CheckCircle2, Clock3, HelpCircle, ShieldAlert } from "lucide-react";

type StatusTone = "ok" | "warn" | "danger" | "neutral";

function resolveTone(status: string): StatusTone {
  const normalized = status.toUpperCase();
  if (["APPROVED", "VERIFIED", "ACTIVE", "POSTED", "CLOSED", "FINALIZED", "RESOLVED", "SUCCEEDED", "LOCKED", "RELOCKED"].includes(normalized)) {
    return "ok";
  }
  if (["REJECTED", "FAILED", "VOIDED", "DISPUTED", "CANCELLED", "SUSPENDED", "ARCHIVED", "CRITICAL"].includes(normalized)) {
    return "danger";
  }
  if (["PENDING", "DRAFT", "SUBMITTED", "IN_PROGRESS", "IN_TRANSIT", "OPEN", "IN_REVIEW", "QC_PENDING", "UNLOCKED", "UNLOCK_REQUESTED"].includes(normalized)) {
    return "warn";
  }
  return "neutral";
}

function iconFor(tone: StatusTone) {
  if (tone === "ok") return <CheckCircle2 size={14} />;
  if (tone === "warn") return <Clock3 size={14} />;
  if (tone === "danger") return <ShieldAlert size={14} />;
  return <HelpCircle size={14} />;
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const text = value ? String(value) : "-";
  const tone = resolveTone(text);
  return (
    <span className={`status-badge status-${tone}`}>
      {iconFor(tone)}
      <span>{text}</span>
    </span>
  );
}

export function SeverityBadge({ value }: { value: string | null | undefined }) {
  const text = value ? String(value).toUpperCase() : "-";
  const tone = text === "LOW" ? "ok" : text === "MEDIUM" ? "warn" : "danger";
  const icon = tone === "ok" ? <CheckCircle2 size={14} /> : tone === "warn" ? <AlertTriangle size={14} /> : <Ban size={14} />;
  return (
    <span className={`status-badge status-${tone}`}>
      {icon}
      <span>{text}</span>
    </span>
  );
}

