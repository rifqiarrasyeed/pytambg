"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";

type SessionEnvelope = {
  context?: {
    permissions?: string[];
  };
};

export function useSessionContext() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const session = await apiClient<SessionEnvelope>("/api/session");
        if (!mounted) {
          return;
        }
        setPermissions(session.context?.permissions ?? []);
      } catch {
        if (!mounted) {
          return;
        }
        setPermissions([]);
      } finally {
        if (mounted) {
          setLoaded(true);
        }
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  return {
    loaded,
    permissions,
    hasAnyPermission(...required: string[]) {
      if (required.length === 0) {
        return true;
      }
      return required.some((permission) => permissionSet.has(permission));
    }
  };
}
