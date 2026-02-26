import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const COMMAND = "npx playwright test";
const blockedMarkers = [
  "allowedDevOrigins",
  "Cross origin request detected",
  "width(-1)",
  "height(-1)"
];

function cleanupPorts(): void {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
      return;
    }
    execSync(`sh -c "lsof -ti tcp:3000,tcp:3001 | xargs -r kill -9"`, { stdio: "ignore" });
  } catch {
    // Best effort cleanup only.
  }
}

cleanupPorts();

const useProdServer = existsSync("dist/index.js") && existsSync("web/.next/BUILD_ID");
if (!useProdServer) {
  console.warn("[E2E STRICT] Build produksi tidak ditemukan, fallback ke dev server.");
}

const child = spawn(COMMAND, {
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
  env: {
    ...process.env,
    E2E_USE_PROD: useProdServer ? "1" : "0"
  }
});

let output = "";

child.stdout.on("data", (chunk: Buffer) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});

child.stderr.on("data", (chunk: Buffer) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

child.on("close", (code) => {
  if ((code ?? 1) !== 0) {
    process.exit(code ?? 1);
  }

  const found = blockedMarkers.filter((marker) => output.includes(marker));
  if (found.length > 0) {
    console.error(`\n[E2E STRICT] Warning marker terdeteksi: ${found.join(", ")}`);
    process.exit(1);
  }

  console.log("\n[E2E STRICT] Pass tanpa warning marker kritis.");
});
