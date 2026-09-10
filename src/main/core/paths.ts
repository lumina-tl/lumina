/** App paths — bundle dir, repo root, backend source. */
import { fileURLToPath } from "url";
import path from "path";
import { app } from "electron";

/** Directory of the compiled main bundle (dist/main). */
export const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Repo root — dist/main is always two levels below the project root. */
export const PROJECT_ROOT = path.join(MAIN_DIR, "../..");

/** Backend source dir: resources/backend when packaged, python/ in dev. */
export function backendSourceDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "backend")
    : path.join(PROJECT_ROOT, "python");
}
