/** Translations — i18n + default prompt load. */
import fs from "fs";
import path from "path";
import { IPC } from "../../shared/bridge";
import { handle } from "../core/ipc";
import { MAIN_DIR } from "../core/paths";
import { backendSourceDir } from "../core/paths";

function loadAll(): Record<string, Record<string, string>> {
  const dir = path.join(MAIN_DIR, "../renderer/i18n");
  const out: Record<string, Record<string, string>> = {};
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      out[name.replace(".json", "")] = JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf-8"),
      );
    }
  } catch (err) {
    console.error("Failed to load translations:", err);
  }
  return out;
}

export function registerTranslationHandlers(): void {
  handle(IPC.loadTranslations, async () => loadAll());
  handle(IPC.loadDefaultInstruction, async () => {
    try {
      return fs.readFileSync(
        path.join(backendSourceDir(), "prompts/translate-default.md"),
        "utf-8",
      );
    } catch {
      return "";
    }
  });
}
