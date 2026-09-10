/** App config — models dir resolve + persist. */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { IPC } from "../../shared/bridge";
import type { ModelsPathState } from "../../shared/bridge";
import { handle, windowFromEvent } from "../core/ipc";

const CONFIG_FILE = "config.json";

interface AppConfig {
  modelsPath: string;
}

const DEFAULT_CONFIG: AppConfig = {
  modelsPath: "",
};

function configFilePath(): string {
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

export function readConfig(): AppConfig {
  try {
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(fs.readFileSync(configFilePath(), "utf-8")),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const config = { ...readConfig(), ...patch };
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  return config;
}

/** Effective models directory: env override > saved config > userData default. */
export function resolveModelsDir(): ModelsPathState {
  const env = process.env.LUMINA_MODEL_DIR;
  if (env) return { path: env, envOverride: true };
  const saved = readConfig().modelsPath;
  if (saved) return { path: saved, envOverride: false };
  return {
    path: path.join(app.getPath("userData"), "models"),
    envOverride: false,
  };
}

export function registerConfigHandlers(): void {
  handle(IPC.modelsPathGet, () => resolveModelsDir());
  handle(IPC.modelsPathSet, (_e, value: string) => {
    const v = String(value ?? "").trim();
    writeConfig({ modelsPath: v });
    return resolveModelsDir();
  });
  handle(IPC.modelsPathChoose, async (e) => {
    const win = windowFromEvent(e) ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      title: "Choose models directory",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
