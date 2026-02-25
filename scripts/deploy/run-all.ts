import { spawn } from "node:child_process";
import { resolve } from "node:path";
import "./_env";

function resolveSteps(): string[] {
  const includeRender = (process.env.DEPLOY_INCLUDE_RENDER ?? "false").toLowerCase() === "true";
  const steps = [
    "scripts/deploy/00-preflight.ts",
    "scripts/deploy/01-db-init.ts",
    "scripts/deploy/06-db-assert.ts",
    "scripts/deploy/02-storage-init.ts"
  ];
  if (includeRender) {
    steps.push("scripts/deploy/03-render-provision.ts");
  }
  steps.push("scripts/deploy/04-vercel-provision.ts");
  steps.push("scripts/deploy/05-smoke-test.ts");
  return steps;
}

async function runStep(file: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", resolve(process.cwd(), file)], {
      stdio: "inherit",
      shell: false
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Step failed (${code}): ${file}`));
      }
    });
    child.on("error", rejectPromise);
  });
}

async function main(): Promise<void> {
  const steps = resolveSteps();
  for (const step of steps) {
    // eslint-disable-next-line no-console
    console.info(`[deploy] run ${step}`);
    await runStep(step);
  }
  // eslint-disable-next-line no-console
  console.info("[deploy] all steps completed");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[deploy] failed", error);
  process.exit(1);
});
