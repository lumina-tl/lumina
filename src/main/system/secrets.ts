/** Secrets — encrypted API key store. */
import { app } from "electron";
import fs from "fs";
import path from "path";
import { safeStorage } from "electron";
import { IPC } from "../../shared/bridge";
import { handle } from "../core/ipc";

const FILE_NAME = "secrets.json";

function filePath(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

let cache: Record<string, string> | null = null;

function readAll(): Record<string, string> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), "utf-8"));
    cache = typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    cache = {};
  }
  return cache as Record<string, string>;
}

function writeAll(data: Record<string, string>): void {
  cache = data;
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function setSecret(key: string, plain: string): void {
  if (!isVaultAvailable()) {
    const data = readAll();
    data[key] = Buffer.from(plain, "utf-8").toString("base64");
    writeAll(data);
    return;
  }
  const data = readAll();
  if (plain === "") {
    delete data[key];
  } else {
    data[key] = safeStorage.encryptString(plain).toString("base64");
  }
  writeAll(data);
}

export function getSecret(key: string): string | null {
  const value = readAll()[key];
  if (value === undefined) return null;
  try {
    const buf = Buffer.from(value, "base64");
    if (isVaultAvailable()) return safeStorage.decryptString(buf);
    return buf.toString("utf-8");
  } catch {
    return null;
  }
}

export function deleteSecret(key: string): void {
  const data = readAll();
  delete data[key];
  writeAll(data);
}

export function registerSecretHandlers(): void {
  handle(IPC.secretsSet, (_e, key: string, value: string) => {
    setSecret(String(key), String(value ?? ""));
  });
  handle(IPC.secretsGet, (_e, key: string) => getSecret(String(key)));
  handle(IPC.secretsGetMany, (_e, keys: string[]) => {
    const out: Record<string, string | null> = {};
    const list = Array.isArray(keys) ? keys : [];
    for (const k of list) out[String(k)] = getSecret(String(k));
    return out;
  });
  handle(IPC.secretsDelete, (_e, key: string) => deleteSecret(String(key)));
}
