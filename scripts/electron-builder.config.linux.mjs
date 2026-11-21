/**
 * electron-builder config for Linux packages (AppImage or tar.gz).
 *
 * Env vars:
 *   LUMINA_LINUX_VARIANT=cpu|cuda   (default: cpu)
 *   LUMINA_LINUX_TARGET=AppImage|tar.gz (default: AppImage)
 */
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VARIANT = (process.env.LUMINA_LINUX_VARIANT || "cpu").toLowerCase();
const TARGET = process.env.LUMINA_LINUX_TARGET || "AppImage";
const VARIANT_TAG = VARIANT === "cuda" ? "CUDA" : "CPU";

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.lumina.app",
  productName: "Lumina",
  directories: {
    output: `dist/linux-${VARIANT}`,
    buildResources: "assets",
  },
  files: ["dist/main/**", "dist/preload/**", "dist/renderer/**"],
  extraResources: [
    {
      from: path.join(ROOT, "build", `bundle-linux-${VARIANT}`),
      to: ".",
      filter: ["**/*"],
    },
    {
      from: path.join(ROOT, "assets", "icon.png"),
      to: "icon.png",
    },
  ],
  linux: {
    target: [{ target: TARGET, arch: ["x64"] }],
    icon: "assets/icon.png",
    category: "Graphics",
    executableName: "lumina",
    artifactName: `Lumina-${VARIANT_TAG}-\${version}-linux-\${arch}.\${ext}`,
    mimeTypes: ["application/x-lumina-project"],
    desktop: {
      entry: {
        Name: "Lumina",
        Comment: "Manga, Manhwa, and Manhua Translation Studio",
        Categories: "Graphics;Utility;",
        StartupWMClass: "Lumina",
      },
    },
  },
  fileAssociations: [
    {
      ext: "lmi",
      name: "Lumina Project",
      description: "Lumina Project File",
      mimeType: "application/x-lumina-project",
    },
  ],
};

export default config;
