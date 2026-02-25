import "./_env";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function callJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Smoke call failed ${response.status} ${url}: ${text}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function main(): Promise<void> {
  const apiBase = required("SMOKE_API_BASE_URL").replace(/\/+$/, "");
  const health = await callJson<{ ok: boolean }>(`${apiBase}/health`);
  if (!health.ok) {
    throw new Error("Health response is not ok=true");
  }
  // eslint-disable-next-line no-console
  console.info("[smoke] /health OK");

  const email = process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_USER_PASSWORD;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.info("[smoke] skip auth flow (set SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD)");
    return;
  }

  const login = await callJson<{
    access_token: string;
    active_sppg_id: string | null;
  }>(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const authHeader = { Authorization: `Bearer ${login.access_token}` };
  await callJson(`${apiBase}/me/sppg`, { headers: authHeader });
  // eslint-disable-next-line no-console
  console.info("[smoke] /me/sppg OK");

  if (login.active_sppg_id) {
    await callJson(`${apiBase}/reports/kpi`, { headers: authHeader });
    // eslint-disable-next-line no-console
    console.info("[smoke] /reports/kpi OK");
    await callJson(`${apiBase}/reports/kpi-trend?date_from=2026-01-01&date_to=2026-01-07&granularity=day`, { headers: authHeader });
    // eslint-disable-next-line no-console
    console.info("[smoke] /reports/kpi-trend OK");
    await callJson(`${apiBase}/qa/health-integrity`, { headers: authHeader });
    // eslint-disable-next-line no-console
    console.info("[smoke] /qa/health-integrity OK");
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[smoke] failed", error);
  process.exit(1);
});
