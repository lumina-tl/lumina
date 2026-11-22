/**
 * Dev runner — launches Electron with platform-specific flags.
 *
 * Reads .env before spawning Electron so flags like --no-sandbox can be
 * passed on the CLI (Chromium ignores no-sandbox if appended inside main.js).
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import electron from "electron";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env before Electron boots
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const args = [];
if (process.platform === "linux" && process.env.LUMINA_NO_SANDBOX === "1") {
  args.push("--no-sandbox");
}
args.push(path.join(ROOT, "dist", "main", "main.js"), ...process.argv.slice(2));

const child = spawn(electron, args, { stdio: "inherit" });
child.on("close", (code) => process.exit(code ?? 0));
