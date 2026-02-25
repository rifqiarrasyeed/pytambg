import "./_env";

type VercelProject = { id: string; name: string };
type VercelEnv = { id: string; key: string; target?: string[] };
type VercelEnvListResponse = { envs?: VercelEnv[] };

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function shouldTriggerDeploy(): boolean {
  return (process.env.VERCEL_TRIGGER_DEPLOY ?? "true").toLowerCase() === "true";
}

function withTeam(path: string): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!teamId) {
    return path;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}teamId=${encodeURIComponent(teamId)}`;
}

async function vercelRequest<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.vercel.com${withTeam(path)}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vercel API ${method} ${path} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json()) as T;
}

function collectFrontendEnv(): Array<{ key: string; value: string }> {
  const keys = ["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  return keys.map((key) => ({ key, value: required(key) }));
}

async function ensureProject(token: string, projectName: string): Promise<VercelProject> {
  try {
    return await vercelRequest<VercelProject>(token, "GET", `/v9/projects/${projectName}`);
  } catch {
    const framework = process.env.VERCEL_FRAMEWORK ?? "nextjs";
    const rootDirectory = process.env.VERCEL_ROOT_DIRECTORY ?? "web";
    const created = await vercelRequest<{ id: string; name: string }>(token, "POST", "/v10/projects", {
      name: projectName,
      framework,
      rootDirectory
    });
    return { id: created.id, name: created.name };
  }
}

async function listEnvs(token: string, projectId: string): Promise<VercelEnv[]> {
  const response = await vercelRequest<VercelEnvListResponse>(token, "GET", `/v10/projects/${projectId}/env?decrypt=true`);
  return response.envs ?? [];
}

async function deleteEnv(token: string, projectId: string, envId: string): Promise<void> {
  await vercelRequest(token, "DELETE", `/v10/projects/${projectId}/env/${envId}`);
}

async function createEnv(token: string, projectId: string, key: string, value: string): Promise<void> {
  await vercelRequest(token, "POST", `/v10/projects/${projectId}/env`, {
    key,
    value,
    target: ["production", "preview", "development"],
    type: "encrypted"
  });
}

async function upsertEnv(token: string, projectId: string, key: string, value: string): Promise<void> {
  const existing = await listEnvs(token, projectId);
  const duplicates = existing.filter((envVar) => envVar.key === key);
  for (const item of duplicates) {
    await deleteEnv(token, projectId, item.id);
  }
  await createEnv(token, projectId, key, value);
}

async function deployProduction(token: string, projectName: string): Promise<void> {
  if (!shouldTriggerDeploy()) {
    // eslint-disable-next-line no-console
    console.info("[vercel] skip deploy trigger (VERCEL_TRIGGER_DEPLOY=false)");
    return;
  }

  const repo = required("VERCEL_GIT_REPO");
  const provider = process.env.VERCEL_GIT_PROVIDER ?? "github";
  const ref = process.env.VERCEL_GIT_REF ?? "main";
  const rootDirectory = process.env.VERCEL_ROOT_DIRECTORY ?? "web";

  await vercelRequest(token, "POST", "/v13/deployments", {
    name: projectName,
    target: "production",
    gitSource: {
      type: provider,
      repo,
      ref
    },
    projectSettings: {
      framework: "nextjs",
      rootDirectory
    }
  });

  // eslint-disable-next-line no-console
  console.info("[vercel] production deployment triggered");
}

async function main(): Promise<void> {
  const token = required("VERCEL_TOKEN");
  const projectName = process.env.VERCEL_PROJECT_NAME ?? "mbg-ops-web";
  const project = await ensureProject(token, projectName);

  // eslint-disable-next-line no-console
  console.info(`[vercel] project ready: ${project.id} (${project.name})`);

  for (const envVar of collectFrontendEnv()) {
    await upsertEnv(token, project.id, envVar.key, envVar.value);
  }
  // eslint-disable-next-line no-console
  console.info("[vercel] env vars synced");

  await deployProduction(token, projectName);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[vercel] provision failed", error);
  process.exit(1);
});
