"use client";

import { AlertCircle, Inbox } from "lucide-react";

export function ErrorState({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="feedback feedback-error">
      <AlertCircle size={16} />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="feedback feedback-empty">
      <Inbox size={16} />
      <span>{message}</span>
    </div>
  );
}

