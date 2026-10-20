/** Lumina Pipeline — Facade */
import * as storage from "../storage";
import { detection } from "./detection";
import { ocr } from "./ocr";
import { inpaint } from "./inpaint";
import { translate } from "./translate";
import { state } from "../state";
import { canvas } from "../canvas/index";

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
    const raw = storage.getItem(PRESET_KEY);
    if (raw === "clean") return "clean";
  } catch {
    /* ignore */
  }
  return "full";
}

/** Persist preset selection. */
export function savePreset(id: PresetId): void {
  try {
    storage.setItem(PRESET_KEY, id);
  } catch {
    /* ignore */
  }
}

export const pipeline = {
  runDetection: detection.run,
  runDetectionAll: detection.runAll,
  runOcr: ocr.run,
  runInpaint: inpaint.run,
  async runAll(): Promise<void> {
    await detection.run({ current: 1, total: 4 });
    await ocr.run({ current: 2, total: 4 });
    await translate.run({ current: 3, total: 4 });
    await inpaint.run({ current: 4, total: 4 });
  },
  /** Run the given preset by id. */
  async runPreset(id: PresetId): Promise<void> {
    try {
      if (id === "clean") {
        await detection.run({ current: 1, total: 2 });
        await inpaint.run({ current: 2, total: 2 });
      } else {
        await detection.run({ current: 1, total: 4 });
        await ocr.run({ current: 2, total: 4 });
        await translate.run({ current: 3, total: 4 });
        await inpaint.run({ current: 4, total: 4 });
      }
    } finally {
      if (id === "clean") {
        state.showDetBoxes = false;
        canvas.updateBoxToggle();
        canvas.render();
      }
    }
  },
};
