type RenderEnvVar = { key: string; value: string };
import "./_env";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

async function renderRequest<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.render.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Render API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

function collectBackendEnv(): RenderEnvVar[] {
  const keys = [
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_ACCESS_TTL",
    "JWT_REFRESH_TTL",
    "IDEMPOTENCY_TTL_HOURS",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_BUCKET_DELIVERY_PROOFS",
    "SUPABASE_BUCKET_QC_PROOFS",
    "SUPABASE_BUCKET_INCIDENT_PROOFS",
    "SUPABASE_BUCKET_INVOICES",
    "SUPABASE_BUCKET_EXPORTS",
    "STORAGE_SIGNED_URL_TTL_SECONDS",
    "STORAGE_UPLOAD_SIGNED_URL_TTL_SECONDS",
    "MAX_UPLOAD_BYTES"
  ];

  const envs: RenderEnvVar[] = [];
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      envs.push({ key, value });
    }
  }
  return envs;
}

type RenderService = { service: { id: string; serviceDetails?: { url?: string } } };

async function main(): Promise<void> {
  const token = required("RENDER_API_KEY");
  const serviceId = optionalEnv("RENDER_SERVICE_ID");
  const serviceName = process.env.RENDER_SERVICE_NAME ?? "mbg-ops-api";
  const envVars = collectBackendEnv();
  if (envVars.length === 0) {
    throw new Error("No backend env vars detected. Export environment variables first.");
  }

  let resolvedServiceId = serviceId;

  if (!resolvedServiceId) {
    const ownerId = required("RENDER_OWNER_ID");
    const repo = required("RENDER_REPO_URL");
    const branch = process.env.RENDER_REPO_BRANCH ?? "main";
    const region = process.env.RENDER_REGION ?? "singapore";
    const plan = process.env.RENDER_PLAN ?? "starter";

    const created = await renderRequest<RenderService>(token, "POST", "/services", {
      type: "web_service",
      name: serviceName,
      ownerId,
      repo,
      branch,
      autoDeploy: "yes",
      serviceDetails: {
        env: "node",
        plan,
        region,
        buildCommand: "npm ci && npm run build",
        startCommand: "npm start",
        healthCheckPath: "/health",
        envVars
      }
    });

    resolvedServiceId = created.service.id;
    // eslint-disable-next-line no-console
    console.info(`[render] service created: ${resolvedServiceId}`);
  } else {
    // eslint-disable-next-line no-console
    console.info(`[render] using existing service: ${resolvedServiceId}`);
  }

  await renderRequest(token, "PUT", `/services/${resolvedServiceId}/env-vars`, envVars);
  // eslint-disable-next-line no-console
  console.info("[render] env vars synced");

  await renderRequest(token, "POST", `/services/${resolvedServiceId}/deploys`);
  // eslint-disable-next-line no-console
  console.info("[render] deploy triggered");

  const service = await renderRequest<RenderService>(token, "GET", `/services/${resolvedServiceId}`);
  // eslint-disable-next-line no-console
  console.info(`[render] service url: ${service.service.serviceDetails?.url ?? "n/a"}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[render] provision failed", error);
  process.exit(1);
});
