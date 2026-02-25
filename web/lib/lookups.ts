"use client";

import { apiClient } from "./api-client";
import type { LookupMasterResponse } from "./contracts";

export async function fetchMasterLookups(
  include = ["schools", "routes", "vendors", "items", "recipes", "drivers", "units"]
): Promise<LookupMasterResponse> {
  const query = include.join(",");
  return apiClient<LookupMasterResponse>(`/api/proxy/lookups/master?include=${encodeURIComponent(query)}`);
}

