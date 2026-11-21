/** Runtime variant — detect cuda/dml/none. */
import { app } from "electron";
import fs from "fs";
import path from "path";

export function runtimeDir(): string {
  return path.join(app.getPath("userData"), "runtime");
}

export function cudaDir(): string {
  return path.join(runtimeDir(), "cuda");
}

export function markerFile(): string {
  return path.join(runtimeDir(), "cuda-runtime.json");
}

export interface RuntimeMarker {
  version: string;
  sha512: string;
  size: number;
}

export function readMarker(): RuntimeMarker | null {
  try {
    if (!fs.existsSync(markerFile())) return null;
    return JSON.parse(fs.readFileSync(markerFile(), "utf-8")) as RuntimeMarker;
  } catch {
    return null;
  }
}

export function installerVariant(): string {
  const res = process.resourcesPath;
  const has = (d: string) => fs.existsSync(path.join(d, "onnxruntime"));
  if (has(path.join(res, "ort", "cuda"))) return "cuda";
  if (has(path.join(res, "ort", "dml"))) return "dml";
  if (has(path.join(res, "ort", "cpu"))) return "cpu";
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(res, "manifest.json"), "utf-8"),
    ) as { variant?: string };
    if (
      manifest?.variant === "cuda" ||
      manifest?.variant === "dml" ||
      manifest?.variant === "cpu"
    ) {
      return manifest.variant;
    }
  } catch {
    /* no manifest */
  }
  return "none";
}

export function activeOrtDir(): string | null {
  const has = (d: string) => fs.existsSync(path.join(d, "onnxruntime"));
  const res = process.resourcesPath;
  const userCuda = cudaDir();
  if (has(userCuda)) return userCuda;
  const bundledCuda = path.join(res, "ort", "cuda");
  if (has(bundledCuda)) return bundledCuda;
  const bundledDml = path.join(res, "ort", "dml");
  if (has(bundledDml)) return bundledDml;
  const bundledCpu = path.join(res, "ort", "cpu");
  if (has(bundledCpu)) return bundledCpu;
  return null;
}

/** Check whether an ONNX Runtime native library exists in a capi folder. */
function hasOrtNativeLib(baseDir: string): boolean {
  const capi = path.join(baseDir, "onnxruntime", "capi");
  if (process.platform === "win32") {
    return fs.existsSync(path.join(capi, "onnxruntime.dll"));
  }
  if (!fs.existsSync(capi)) return false;
  return fs
    .readdirSync(capi)
    .some((f) => f.startsWith("libonnxruntime") && f.includes(".so"));
}

export function isCudaRuntimeReady(): boolean {
  if (installerVariant() !== "cuda") return true;
  const res = process.resourcesPath;
  if (hasOrtNativeLib(path.join(res, "ort", "cuda"))) {
    return true;
  }
  const m = readMarker();
  if (!m) return false;
  return hasOrtNativeLib(cudaDir());
}
