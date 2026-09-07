/**
 * electron-builder config for the Lumina CUDA installer.
 *
 * Builds dist/cuda/Lumina-Setup-CUDA-<version>.exe (CUDA 12 EP, NVIDIA-only).
 * The ~1.4GB onnxruntime-gpu runtime is NOT bundled — the app downloads it
 * once at first run (into userData, verified + extracted by the app). The
 * installer is small (~DML size), so app updates stay differential.
 * - publish.channel "cuda" -> cuda.yml feed so CUDA installs only ever
 *   update from CUDA artifacts (DML channel is separate).
 */
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.lumina.app",
  productName: "Lumina",
  directories: {
    output: "dist/cuda",
    buildResources: "assets",
  },
  // Only the compiled app code goes into app.asar. Never use dist/** here:
  // electron-builder writes its output into dist/dml + dist/cuda, so a
  // dist/** glob would pack the whole previous installer output (including
  // a full Electron runtime) into the asar.
  files: ["dist/main/**", "dist/preload/**", "dist/renderer/**"],
  // Generates cuda.yml + .blockmap so electron-updater can resolve the
  // CUDA channel feed. Actual upload happens in CI (draft release) —
  // publishing itself is disabled so the workflow keeps full control.
  publish: {
    provider: "github",
    owner: "lumina-tl",
    repo: "lumina",
    channel: "cuda",
  },
  extraResources: [
    {
      from: path.join(ROOT, "build", "bundle-cuda"),
      to: ".",
      filter: ["**/*"],
    },
  ],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    fileAssociations: [
      {
        ext: "lmi",
        name: "Lumina Project",
        description: "Lumina Project File",
      },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "Lumina-Setup-CUDA-${version}.exe",
    // No runtime extraction at setup anymore — the app fetches it at first
    // run. Small installer => differential app updates.
  },
  // Small payload now — default compression is plenty fast.
  compression: "normal",
};

export default config;
