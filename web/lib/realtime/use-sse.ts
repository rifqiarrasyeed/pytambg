"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DeliverySnapshotEvent,
  RealtimeConnectionState,
  RealtimeTopic,
  ReportsSnapshotEvent
} from "../contracts";

type UseSseOptions = {
  enabled?: boolean;
  topics: RealtimeTopic[];
  deliveryId?: string;
  intervalSeconds?: number;
  fallbackIntervalMs?: number;
  onReportsSnapshot?: (event: ReportsSnapshotEvent) => void;
  onDeliverySnapshot?: (event: DeliverySnapshotEvent) => void;
  onFallbackPoll?: () => Promise<void> | void;
};

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function reconnectDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 5));
  return Math.min(30_000, 1_000 * 2 ** exponent);
}

export function useSse(options: UseSseOptions): RealtimeConnectionState {
  const {
    enabled = true,
    topics,
    deliveryId,
    intervalSeconds = 10,
    fallbackIntervalMs = 20_000,
    onReportsSnapshot,
    onDeliverySnapshot,
    onFallbackPoll
  } = options;

  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("connecting");
  const reportsRef = useRef(onReportsSnapshot);
  const deliveryRef = useRef(onDeliverySnapshot);
  const fallbackPollRef = useRef(onFallbackPoll);

  useEffect(() => {
    reportsRef.current = onReportsSnapshot;
  }, [onReportsSnapshot]);

  useEffect(() => {
    deliveryRef.current = onDeliverySnapshot;
  }, [onDeliverySnapshot]);

  useEffect(() => {
    fallbackPollRef.current = onFallbackPoll;
  }, [onFallbackPoll]);

  const topicsKey = Array.from(new Set(topics)).join(",");

  useEffect(() => {
    if (!enabled || topicsKey.length === 0) {
      setConnectionState("connecting");
      return;
    }

    let disposed = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let consecutiveFailures = 0;

    const runFallbackPoll = () => {
      const runner = fallbackPollRef.current;
      if (!runner) {
        return;
      }
      void Promise.resolve(runner()).catch(() => undefined);
    };

    const stopFallbackPolling = () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const startFallbackPolling = () => {
      setConnectionState("fallback");
      runFallbackPoll();
      if (!fallbackTimer) {
        fallbackTimer = setInterval(() => {
          runFallbackPoll();
        }, fallbackIntervalMs);
      }
    };

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const cleanup = () => {
      clearReconnect();
      stopFallbackPolling();
      if (source) {
        source.close();
        source = null;
      }
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      clearReconnect();
      setConnectionState((previous) => (previous === "fallback" ? previous : "connecting"));

      const url = new URL("/api/proxy/workspace/stream", window.location.origin);
      url.searchParams.set("topics", topicsKey);
      url.searchParams.set("interval_seconds", String(intervalSeconds));
      if (deliveryId) {
        url.searchParams.set("delivery_id", deliveryId);
      }

      source = new EventSource(url.toString(), { withCredentials: true });

      source.onopen = () => {
        consecutiveFailures = 0;
        stopFallbackPolling();
        setConnectionState("live");
      };

      source.onerror = () => {
        if (source) {
          source.close();
          source = null;
        }

        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          startFallbackPolling();
        } else {
          setConnectionState("connecting");
        }

        reconnectTimer = setTimeout(() => {
          connect();
        }, reconnectDelayMs(consecutiveFailures));
      };

      source.addEventListener("reports.snapshot", (event: MessageEvent) => {
        const payload = parseJson<ReportsSnapshotEvent>(event.data);
        if (payload && reportsRef.current) {
          reportsRef.current(payload);
        }
      });

      source.addEventListener("delivery.snapshot", (event: MessageEvent) => {
        const payload = parseJson<DeliverySnapshotEvent>(event.data);
        if (payload && deliveryRef.current) {
          deliveryRef.current(payload);
        }
      });

    };

    connect();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [deliveryId, enabled, fallbackIntervalMs, intervalSeconds, topicsKey]);

  return connectionState;
}
