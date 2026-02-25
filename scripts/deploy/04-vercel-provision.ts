type VercelProject = { id: string; name: string };
import "./_env";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function vercelRequest<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.vercel.com${path}`, {
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

  return (await response.json()) as T;
}

function collectFrontendEnv(): Array<{ key: string; value: string }> {
  const keys = [
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  ];
  const result: Array<{ key: string; value: string }> = [];
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      result.push({ key, value });
    }
  }
  return result;
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

async function upsertEnv(token: string, projectId: string, key: string, value: string): Promise<void> {
  await vercelRequest(
    token,
    "POST",
    `/v10/projects/${projectId}/env`,
    {
      key,
      value,
      target: ["production", "preview", "development"],
      type: "encrypted"
    }
  );
}

async function deployProduction(token: string, projectName: string): Promise<void> {
  const repo = process.env.VERCEL_GIT_REPO;
  if (!repo) {
    // eslint-disable-next-line no-console
    console.info("[vercel] skip deploy trigger (set VERCEL_GIT_REPO=owner/repo to auto trigger)");
    return;
  }

  const provider = process.env.VERCEL_GIT_PROVIDER ?? "github";
  const ref = process.env.VERCEL_GIT_REF ?? "main";
  const rootDirectory = process.env.VERCEL_ROOT_DIRECTORY ?? "web";

  await vercelRequest(
    token,
    "POST",
    "/v13/deployments",
    {
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
    }
  );

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
