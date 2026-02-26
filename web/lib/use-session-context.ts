"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";

type SessionEnvelope = {
  assignments?: Array<{ sppg_id: string; roles?: string[] }>;
  active_sppg_id?: string | null;
  context?: {
    roles?: string[];
    permissions?: string[];
  };
};

export function useSessionContext() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
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
        const activeRoles =
          session.assignments?.find((assignment) => assignment.sppg_id === session.active_sppg_id)?.roles ??
          session.context?.roles ??
          [];
        setRoles(activeRoles);
      } catch {
        if (!mounted) {
          return;
        }
        setPermissions([]);
        setRoles([]);
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
  const roleSet = useMemo(() => new Set(roles), [roles]);

  return {
    loaded,
    permissions,
    roles,
    hasAnyPermission(...required: string[]) {
      if (required.length === 0) {
        return true;
      }
      return required.some((permission) => permissionSet.has(permission));
    },
    hasAnyRole(...required: string[]) {
      if (required.length === 0) {
        return true;
      }
      return required.some((role) => roleSet.has(role));
    }
  };
}
