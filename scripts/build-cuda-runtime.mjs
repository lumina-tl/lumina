/**
 * Build standalone CUDA runtime archives for Lumina (Windows and Linux).
 *
 * Usage:
 *   node scripts/build-cuda-runtime.mjs --platform=win32
 *   node scripts/build-cuda-runtime.mjs --platform=linux
 *   node scripts/build-cuda-runtime.mjs --merge-manifest
 *
 * Outputs:
 *   Windows:
 *     build/cuda-runtime-win.7z     onnxruntime-gpu + nvidia DLLs (LZMA2 -mx=9)
 *     build/cuda-runtime.7z         Backward-compatible copy of cuda-runtime-win.7z
 *     build/cuda-runtime-win.json   Platform manifest metadata
 *
 *   Linux:
 *     build/cuda-runtime-linux.tar.gz  onnxruntime-gpu + nvidia SOs (tar.gz)
 *     build/cuda-runtime-linux.json    Platform manifest metadata
 *
 *   Merged:
 *     build/cuda-runtime.json       Universal manifest with multi-platform URLs
 */
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const BUILD = path.join(ROOT, "build");
const WHEELS_CUDA = path.join(BUILD, "wheels-cuda");
const REQ_ORT_CUDA = path.join(SCRIPTS, "requirements-ort-cuda.txt");

const SEVENZR_URL = "https://www.7-zip.org/a/7zr.exe";
const SEVENZR_EXE = path.join(BUILD, "7zr.exe");
const SEVENZR_MIN_BYTES = 300 * 1024;

const ORT_VERSION = "1.24.4+cuda12";

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error) {
    console.error(`Failed to run ${cmd}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function sha512File(file) {
  const h = createHash("sha512");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}

async function fetchFile(url, dest, minBytes = 0) {
  console.log(`Downloading ${url}`);
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    const size = statSync(tmp).size;
    if (size < minBytes) throw new Error(`Download too small: ${size} bytes`);
    rmSync(dest, { force: true });
    copyFileSync(tmp, dest);
    console.log(`  -> ${(size / 1024 / 1024).toFixed(1)} MB`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function ensureSevenZr() {
  if (existsSync(SEVENZR_EXE) && statSync(SEVENZR_EXE).size > SEVENZR_MIN_BYTES) {
    return;
  }
  mkdirSync(BUILD, { recursive: true });
  rmSync(SEVENZR_EXE, { force: true });
  await fetchFile(SEVENZR_URL, SEVENZR_EXE, SEVENZR_MIN_BYTES);
}

function listWheels(dir) {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".whl"))
        .sort()
    : [];
}

function extractZip(zip, dest) {
  mkdirSync(dest, { recursive: true });
  const r = spawnSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    throw new Error(`Failed to extract ${zip} with tar (exit ${r.status})`);
  }
}

function pipCmd() {
  const venv = path.join(ROOT, "venv", "Scripts", "python.exe");
  if (existsSync(venv)) return [venv, "-m", "pip"];
  return ["python", "-m", "pip"];
}

async function buildWindows() {
  console.log("=== Building Windows CUDA runtime archive ===");
  mkdirSync(BUILD, { recursive: true });
  await ensureSevenZr();

  mkdirSync(WHEELS_CUDA, { recursive: true });
  if (listWheels(WHEELS_CUDA).length === 0) {
    console.log("Downloading Windows CUDA wheels...");
    const [pip, ...pipArgs] = pipCmd();
    sh(pip, [
      ...pipArgs,
      "download",
      "-r",
      REQ_ORT_CUDA,
      "--only-binary=:all:",
      "--platform",
      "win_amd64",
      "--python-version",
      "313",
      "--implementation",
      "cp",
      "--dest",
      WHEELS_CUDA,
    ]);
  }

  const staging = path.join(BUILD, "ort-cuda-win");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const wheels = listWheels(WHEELS_CUDA).filter((w) => w.startsWith("onnxruntime"));
  const ortWheel = wheels.find((w) => !w.includes("onnxruntime_gpu")) || wheels[0];
  if (!ortWheel) throw new Error(`onnxruntime wheel not found in ${WHEELS_CUDA}`);

  console.log(`Extracting ${ortWheel}...`);
  extractZip(path.join(WHEELS_CUDA, ortWheel), staging);

  for (const w of listWheels(WHEELS_CUDA).filter((w) => w.startsWith("nvidia_"))) {
    console.log(`Extracting ${w}...`);
    extractZip(path.join(WHEELS_CUDA, w), staging);
  }

  const archiveWin = path.join(BUILD, "cuda-runtime-win.7z");
  const archiveLegacy = path.join(BUILD, "cuda-runtime.7z");
  rmSync(archiveWin, { force: true });
  rmSync(archiveLegacy, { force: true });

  console.log("Compressing cuda-runtime-win.7z (LZMA2 -mx=9)...");
  sh(SEVENZR_EXE, ["a", "-t7z", "-mx=9", archiveWin, "."], { cwd: staging });

  copyFileSync(archiveWin, archiveLegacy);
  rmSync(staging, { recursive: true, force: true });

  const sha512 = await sha512File(archiveWin);
  const manifestWin = {
    platform: "win32",
    version: ORT_VERSION,
    url: "cuda-runtime-win.7z",
    legacyUrl: "cuda-runtime.7z",
    sha512,
    size: statSync(archiveWin).size,
  };
  writeFileSync(
    path.join(BUILD, "cuda-runtime-win.json"),
    JSON.stringify(manifestWin, null, 2),
  );
  console.log(`Windows archive ready: ${(manifestWin.size / 1024 / 1024).toFixed(0)} MB`);
}

function pruneLinuxTree(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === "__pycache__" || entry === "tests") {
        rmSync(full, { recursive: true, force: true });
      } else {
        pruneLinuxTree(full);
      }
    } else if (entry.endsWith(".a") || entry.endsWith(".pyc")) {
      rmSync(full, { force: true });
    }
  }
}

async function buildLinux() {
  console.log("=== Building Linux CUDA runtime archive ===");
  mkdirSync(BUILD, { recursive: true });

  const staging = path.join(BUILD, "ort-cuda-linux");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  console.log("Installing ONNX Runtime GPU and NVIDIA libs via uv...");
  sh("uv", [
    "pip",
    "install",
    "--target",
    staging,
    "--python",
    "3.12",
    "--no-compile",
    "onnxruntime-gpu[cuda,cudnn]==1.24.4",
  ]);

  pruneLinuxTree(staging);

  const archiveLinux = path.join(BUILD, "cuda-runtime-linux.tar.gz");
  rmSync(archiveLinux, { force: true });

  console.log("Compressing cuda-runtime-linux.tar.gz...");
  sh("tar", ["-czf", archiveLinux, "-C", staging, "."]);
  rmSync(staging, { recursive: true, force: true });

  const sha512 = await sha512File(archiveLinux);
  const manifestLinux = {
    platform: "linux",
    version: ORT_VERSION,
    url: "cuda-runtime-linux.tar.gz",
    sha512,
    size: statSync(archiveLinux).size,
  };
  writeFileSync(
    path.join(BUILD, "cuda-runtime-linux.json"),
    JSON.stringify(manifestLinux, null, 2),
  );
  console.log(`Linux archive ready: ${(manifestLinux.size / 1024 / 1024).toFixed(0)} MB`);
}

function mergeManifest() {
  console.log("=== Merging CUDA runtime manifest ===");
  mkdirSync(BUILD, { recursive: true });

  let existing = {};
  const manifestPath = path.join(BUILD, "cuda-runtime.json");
  if (existsSync(manifestPath)) {
    try {
      existing = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      existing = {};
    }
  }

  const platforms = existing.platforms || {};

  const winPath = path.join(BUILD, "cuda-runtime-win.json");
  if (existsSync(winPath)) {
    const win = JSON.parse(readFileSync(winPath, "utf-8"));
    platforms.win32 = {
      url: win.url,
      sha512: win.sha512,
    };
    existing.legacyWinSha512 = win.sha512;
  }

  const linuxPath = path.join(BUILD, "cuda-runtime-linux.json");
  if (existsSync(linuxPath)) {
    const linux = JSON.parse(readFileSync(linuxPath, "utf-8"));
    platforms.linux = {
      url: linux.url,
      sha512: linux.sha512,
    };
  }

  const finalManifest = {
    version: ORT_VERSION,
    platforms,
    // Root fallback for legacy clients expecting direct url/sha512 (Windows)
    url: platforms.win32?.url || "cuda-runtime.7z",
    sha512: platforms.win32?.sha512 || existing.sha512 || "",
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2));
  console.log("Unified manifest written to build/cuda-runtime.json");
  console.log(JSON.stringify(finalManifest, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const isMerge = args.includes("--merge-manifest");
  const platformArg = args.find((a) => a.startsWith("--platform="));
  const platform = platformArg ? platformArg.split("=")[1] : null;

  if (isMerge) {
    mergeManifest();
    return;
  }

  const targetPlatform = platform || process.platform;
  if (targetPlatform === "win32" || targetPlatform === "win") {
    await buildWindows();
    mergeManifest();
  } else if (targetPlatform === "linux") {
    await buildLinux();
    mergeManifest();
  } else if (targetPlatform === "all") {
    await buildWindows();
    await buildLinux();
    mergeManifest();
  } else {
    throw new Error(`Unsupported platform: ${targetPlatform}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
