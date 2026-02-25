"use client";

export type ApiError = {
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
    timestamp?: string;
  };
};

export type DataEnvelope<T> = {
  data: T[];
};

export function readData<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === "object" && "data" in payload) {
    const maybe = (payload as DataEnvelope<T>).data;
    if (Array.isArray(maybe)) {
      return maybe;
    }
  }
  return [];
}

export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const err = parsed as ApiError;
    const code = err.error?.code ? `[${err.error.code}] ` : "";
    throw new Error(`${code}${err.error?.message ?? `HTTP ${response.status}`}`);
  }

  return parsed as T;
}
