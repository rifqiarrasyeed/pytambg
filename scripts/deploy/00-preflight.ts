import "./_env";

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

function requireKeys(keys: string[], missing: Set<string>): void {
  for (const key of keys) {
    if (!hasEnv(key)) {
      missing.add(key);
    }
  }
}

async function main(): Promise<void> {
  const missing = new Set<string>();
  const includeRender = (process.env.DEPLOY_INCLUDE_RENDER ?? "false").toLowerCase() === "true";
  const triggerVercelDeploy = (process.env.VERCEL_TRIGGER_DEPLOY ?? "true").toLowerCase() === "true";

  requireKeys(["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], missing);
  requireKeys(["VERCEL_TOKEN", "VERCEL_PROJECT_NAME", "NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], missing);

  if (includeRender) {
    requireKeys(["RENDER_API_KEY"], missing);
  }

  if (triggerVercelDeploy) {
    requireKeys(["VERCEL_GIT_REPO"], missing);
  }

  if (missing.size > 0) {
    const list = Array.from(missing).sort();
    throw new Error(`Preflight gagal, env wajib belum terisi: ${list.join(", ")}`);
  }

  // eslint-disable-next-line no-console
  console.info(`[preflight] ok (include_render=${includeRender}, vercel_trigger=${triggerVercelDeploy})`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[preflight] failed", error);
  process.exit(1);
});
