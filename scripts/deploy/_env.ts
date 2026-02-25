import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "scripts", "deploy", ".env.local")
];

for (const filePath of candidates) {
  if (existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}
