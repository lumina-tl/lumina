/** Lumina Pipeline — Facade */
import * as storage from "../storage";
import { detection } from "./detection";
import { ocr } from "./ocr";
import { inpaint } from "./inpaint";
import { translate } from "./translate";
import { state } from "../state";
import { canvas } from "../canvas/index";
import type { PipelineStepInfo } from "./ocr";
import type { Page } from "../../types";

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
const MODE_KEY = "lumina-pipeline-mode";
export type PipelineMode = "single" | "batch";
let _pipelineRunning = false;

type PipelineStageKey =
  | "_pipelineDetectionDone"
  | "_pipelineOcrDone"
  | "_pipelineTranslationDone"
  | "_pipelineInpaintDone";

interface PipelineStage {
  key: PipelineStageKey;
  run(stepInfo?: PipelineStepInfo): Promise<void>;
  hasWork?(page: Page): boolean;
}

const DETECTION_STAGE: PipelineStage = {
  key: "_pipelineDetectionDone",
  run: detection.run,
};
const OCR_STAGE: PipelineStage = {
  key: "_pipelineOcrDone",
  run: ocr.run,
  hasWork: (page) => page.textDetections.length > 0,
};
const TRANSLATION_STAGE: PipelineStage = {
  key: "_pipelineTranslationDone",
  run: translate.run,
  hasWork: (page) =>
    page.textDetections.some((d) => (d.text || "").trim().length > 0),
};
const INPAINT_STAGE: PipelineStage = {
  key: "_pipelineInpaintDone",
  run: inpaint.run,
  hasWork: (page) => page.textDetections.length > 0,
};

function inferPageStageState(page: Page): void {
  const detections = page.textDetections;
  const detectionDone = Boolean(
    page._cleanOnlyDetectionDone || detections.length > 0,
  );
  if (page._pipelineDetectionDone === undefined) {
    page._pipelineDetectionDone = detectionDone;
  }
  if (page._pipelineOcrDone === undefined) {
    page._pipelineOcrDone =
      detectionDone &&
      (detections.length === 0 ||
        detections.every((d) => Boolean(d.text?.trim())));
  }
  if (page._pipelineTranslationDone === undefined) {
    page._pipelineTranslationDone =
      detectionDone &&
      (detections.length === 0 ||
        detections.every(
          (d) => Boolean(d.text?.trim()) && Boolean(d.translated?.trim()),
        ));
  }
  if (page._pipelineInpaintDone === undefined) {
    page._pipelineInpaintDone = Boolean(
      page._cleanOnlyProcessed ||
        page.inpaintMasks.length > 0 ||
        (detectionDone && detections.length === 0),
    );
  }
}

async function runPipelineForOpenPages(
  stages: PipelineStage[],
  pagesToProcess: Page[] = [...state.pages],
  skipCompleted = true,
): Promise<void> {
  if (
    _pipelineRunning ||
    state.isRunning ||
    pagesToProcess.length === 0
  ) {
    return;
  }
  _pipelineRunning = true;

  const pages = [...pagesToProcess];
  const originalPage = state.getActivePage();
  const runButton = document.getElementById(
    "btn-pipeline-all",
  ) as HTMLButtonElement | null;
  const wasRunButtonDisabled = runButton?.disabled ?? false;
  if (runButton) runButton.disabled = true;

  try {
    for (const page of pages) {
      const pageIndex = state.pages.indexOf(page);
      if (pageIndex < 0) continue;

      inferPageStageState(page);
      stages.forEach((stage) => {
        if (
          !page[stage.key] &&
          stage.hasWork &&
          !stage.hasWork(page)
        ) {
          page[stage.key] = true;
        }
      });
      if (skipCompleted && stages.every((stage) => page[stage.key])) continue;

      await canvas.switchPage(pageIndex);
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (skipCompleted && page[stage.key]) continue;
        if (stage.hasWork && !stage.hasWork(page)) {
          page[stage.key] = true;
          continue;
        }
        page[stage.key] = false;
        await stage.run({ current: i + 1, total: stages.length });
        if (!page[stage.key]) break;
      }
    }
  } finally {
    try {
      const originalPageIndex = originalPage
        ? state.pages.indexOf(originalPage)
        : -1;
      if (originalPageIndex >= 0) await canvas.switchPage(originalPageIndex);
    } finally {
      if (runButton) runButton.disabled = wasRunButtonDisabled;
      _pipelineRunning = false;
    }
  }
}

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

/** Load saved pipeline mode (default: single). */
export function loadMode(): PipelineMode {
  try {
    const raw = storage.getItem(MODE_KEY);
    if (raw === "batch") return "batch";
  } catch {
    /* ignore */
  }
  return "single";
}

/** Persist pipeline mode selection. */
export function saveMode(mode: PipelineMode): void {
  try {
    storage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export const pipeline = {
  runDetection: detection.run,
  runOcr: ocr.run,
  async runTranslate(): Promise<void> {
    if (loadMode() === "single") {
      await translate.run();
      return;
    }
    const pages = state.pages.filter((page) =>
      page.textDetections.some((d) => (d.text || "").trim().length > 0),
    );
    if (!pages.length) {
      await translate.run();
      return;
    }
    await runPipelineForOpenPages([TRANSLATION_STAGE], pages, false);
  },
  runInpaint: inpaint.run,
  async runAll(): Promise<void> {
    await pipeline.runPreset("full");
  },
  /** Run the given preset by id. */
  async runPreset(
    id: PresetId,
    options?: { includeOcr?: boolean; mode?: PipelineMode },
  ): Promise<void> {
    const mode = options?.mode ?? loadMode();
    const active = state.getActivePage();
    const pagesToProcess =
      mode === "batch" ? [...state.pages] : active ? [active] : [];
    const skipCompleted = mode === "batch";
    try {
      if (id === "clean") {
        const stages = options?.includeOcr
          ? [DETECTION_STAGE, OCR_STAGE, TRANSLATION_STAGE, INPAINT_STAGE]
          : [DETECTION_STAGE, INPAINT_STAGE];
        await runPipelineForOpenPages(stages, pagesToProcess, skipCompleted);
      } else {
        await runPipelineForOpenPages(
          [DETECTION_STAGE, OCR_STAGE, TRANSLATION_STAGE, INPAINT_STAGE],
          pagesToProcess,
          skipCompleted,
        );
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
