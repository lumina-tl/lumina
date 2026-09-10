/** Backend spawn — launch, health-check, stop Python. */
import { spawn, ChildProcess } from "child_process";
import { app } from "electron";
import http from "http";
import path from "path";
import { PROJECT_ROOT } from "../core/paths";
import { resolveModelsDir } from "../system/config";
import { activeOrtDir } from "../models/runtime/variant";
import { BACKEND_PORT } from "./client";
import { CACHE_DIR, clearSessionCache } from "./cache";
import { loadEnvFile } from "./env";

loadEnvFile();

let pythonProcess: ChildProcess | null = null;

interface PythonLaunch {
  dir: string;
  entry: string;
  executable: string;
  pythonPath: string | null;
}

function resolveLaunch(): PythonLaunch {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    const pyRoot = path.join(res, "python");
    const pyApp = path.join(res, "backend");
    const sitePkgs = path.join(pyRoot, "Lib", "site-packages");
    const ortDir = activeOrtDir();
    const extra = ortDir ? [ortDir, sitePkgs] : [sitePkgs];
    return {
      dir: pyApp,
      entry: path.join(pyApp, "run_backend.py"),
      executable: path.join(pyRoot, "python.exe"),
      pythonPath: extra.join(path.delimiter),
    };
  }
  const dir = path.join(PROJECT_ROOT, "python");
  return {
    dir,
    entry: path.join(dir, "main.py"),
    executable:
      process.platform === "win32"
        ? path.join(PROJECT_ROOT, "venv", "Scripts", "python.exe")
        : path.join(PROJECT_ROOT, "venv", "bin", "python"),
    pythonPath: null,
  };
}

function waitForHealth(
  resolve: () => void,
  reject: (err: Error) => void,
  retries: number,
): void {
  if (retries <= 0) {
    reject(new Error("Python backend did not become ready in time"));
    return;
  }
  const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
    if (res.statusCode === 200) {
      console.log("[Lumina] Python backend is ready");
      resolve();
    } else {
      setTimeout(() => waitForHealth(resolve, reject, retries - 1), 500);
    }
  });
  req.on("error", () => {
    setTimeout(() => waitForHealth(resolve, reject, retries - 1), 500);
  });
  req.end();
}

export function spawnBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const launch = resolveLaunch();
    const modelsDir = resolveModelsDir().path;
    console.log(`[Lumina] Starting Python backend at ${launch.entry}`);
    pythonProcess = spawn(
      launch.executable,
      [launch.entry, "--port", String(BACKEND_PORT)],
      {
        cwd: launch.dir,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          LUMINA_MODEL_DIR: modelsDir,
          HF_HOME: process.env.HF_HOME || path.join(modelsDir, "huggingface"),
          LUMINA_CACHE_DIR: CACHE_DIR,
          ...(launch.pythonPath
            ? { LUMINA_PYTHONPATH: launch.pythonPath }
            : {}),
        },
      },
    );

    pythonProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[Python] ${data.toString().trim()}`);
    });
    pythonProcess.stderr?.on("data", (data: Buffer) => {
      console.log(`[Python stderr] ${data.toString().trim()}`);
    });
    pythonProcess.on("error", (err) => {
      console.error("[Lumina] Failed to start Python backend:", err.message);
      reject(err);
    });
    pythonProcess.on("exit", (code) => {
      console.log(`[Lumina] Python backend exited with code ${code}`);
    });

    waitForHealth(resolve, reject, 30);
  });
}

export function stopBackend(): void {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
    console.log("[Lumina] Python backend stopped");
  }
  clearSessionCache();
}
