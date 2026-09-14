/** Lumina Pipeline — Facade */
import { detection } from "./detection";
import { ocr } from "./ocr";
import { translate } from "./translate";
import { inpaint } from "./inpaint";

/* ── Pipeline Presets ── */

export type PresetId = "full" | "clean";

export interface PresetDef {
  id: PresetId;
  label: string;
}

export const PRESETS: PresetDef[] = [
  { id: "full", label: "Full Pipeline" },
  { id: "clean", label: "Clean Only" },
];

const PRESET_KEY = "lumina-pipeline-preset";

/** Load saved preset (default: full). */
export function loadPreset(): PresetId {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw === "clean") return "clean";
  } catch {
    /* ignore */
  }
  return "full";
}

/** Persist preset selection. */
export function savePreset(id: PresetId): void {
  try {
    localStorage.setItem(PRESET_KEY, id);
  } catch {
    /* ignore */
  }
}

export const pipeline = {
  runDetection: detection.run,
  runDetectionAll: detection.runAll,
  runOcr: ocr.run,
  runTranslate: translate.run,
  runInpaint: inpaint.run,
  async runAll(): Promise<void> {
    await detection.run();
    await ocr.run();
    await translate.run();
    await inpaint.run();
  },
  /** Run the given preset by id. */
  async runPreset(id: PresetId): Promise<void> {
    if (id === "clean") {
      await detection.run();
      await inpaint.run();
    } else {
      // "full"
      await detection.run();
      await ocr.run();
      await translate.run();
      await inpaint.run();
    }
  },
};
