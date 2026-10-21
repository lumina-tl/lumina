/** Lumina Pipeline — OCR (manga-ocr via Python backend) */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { models } from "../models";
import { normalizeAutoText } from "./text-norm";
import { flushDetBboxes } from "../canvas/detection/groups";
import {
  alignDialogueLayerToDet,
  dialogueLayerForTextIdx,
} from "../canvas/detection/selection";
import type { OcrResult } from "../../types";
import { log } from "../logger";

export interface PipelineStepInfo {
  current: number;
  total: number;
}

export const ocr = {
  /** Run OCR on all text detections of the active page */
  run: async function (stepInfo?: PipelineStepInfo): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    if (!page.textDetections.length) {
      ui.toast(i18n.t("toast.ocrNoText"), "warn");
      return;
    }
    // Pull latest box geometry off the stage (move/resize) before cropping.
    flushDetBboxes();

    state.isRunning = true;

    const btn = document.getElementById("btn-ocr") as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    const stepPrefix = stepInfo ? `[${stepInfo.current}/${stepInfo.total}] ` : "";
    const totalCount = page.textDetections.length;
    const loadingToast = ui.toast(
      `${stepPrefix}${i18n.t("toast.ocrProgress", { current: 0, total: totalCount })}`,
      "running",
      0,
    );

    try {
      const model = models.selectedModel("ocr") || "manga_ocr";
      log.debug(
        "fe",
        `ocr: start model=${model} boxes=${page.textDetections.length}`,
      );
      const result = await window.lumina.apiPostStream<{
        results?: OcrResult[];
        detail?: string;
      }>(
        "/ocr/stream",
        {
          imagePath: page.filePath,
          boxes: page.textDetections.map((d) => d.bbox),
          model,
        },
        (p) => {
          ui.updateToast(
            loadingToast,
            `${stepPrefix}${i18n.t("toast.ocrProgress", { current: p.current, total: p.total })}`,
          );
        },
      );
      if (!result || !result.results)
        throw new Error(result?.detail || "OCR failed");

      log.debug("fe", `ocr: done ${(result.results || []).length} result(s)`);
      let wrote = false;
      (result.results || []).forEach(function (r) {
        const text = normalizeAutoText(r.text || "");
        const det = page.textDetections[r.index];
        if (det) det.text = text;
        const layer = dialogueLayerForTextIdx(page, r.index);
        if (layer) {
          layer.source = text;
          alignDialogueLayerToDet(page, r.index);
        }
      });

      // Boxes stay visible after OCR (toggle in the header) — they only
      // disappear once inpainting produces masks.
      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.ocrDone", { count: (result.results || []).length }),
        "success",
        3000,
      );
    } catch (err) {
      log.error("fe", `OCR: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.ocrFailed"), "error");
    } finally {
      state.isRunning = false;
      const btn2 = document.getElementById(
        "btn-ocr",
      ) as HTMLButtonElement | null;
      if (btn2) btn2.disabled = false;
    }
  },

  /** Run OCR on every page in sequence without opening per-page prompts. */
  runAll: async function (): Promise<void> {
    if (state.isRunning || state.pages.length === 0) return;
    state.isRunning = true;
    const button = document.getElementById("btn-ocr") as HTMLButtonElement | null;
    if (button) button.disabled = true;
    let progressToast: ReturnType<typeof ui.toast> | null = null;
    const failed: string[] = [];
    let completed = 0;
    try {
      const model = models.selectedModel("ocr") || "manga_ocr";
      for (let i = 0; i < state.pages.length; i++) {
        const page = state.pages[i];
        const alreadyProcessed =
          page._cleanOnlyProcessed ??
          (page.inpaintMasks.length > 0 && !page._cleanOnlyDetectionDone);
        if (alreadyProcessed || !page._cleanOnlyDetectionDone) continue;
        ui.dismissToast(progressToast);
        progressToast = ui.toast(
          i18n.t("toast.batchProgress", {
            current: i + 1,
            total: state.pages.length,
            stage: i18n.t("header.ocr"),
          }),
          "running",
          0,
        );
        if (page.textDetections.length === 0) {
          continue;
        }
        try {
          const result = await window.lumina.apiPost<{
            results?: OcrResult[];
            detail?: string;
            error?: string;
          }>("/ocr", {
            imagePath: page.filePath,
            boxes: page.textDetections.map((d) => d.bbox),
            model,
          });
          if (!result || !result.results)
            throw new Error(result?.detail || result?.error || "OCR failed");

          result.results.forEach((r) => {
            const text = normalizeAutoText(r.text || "");
            const detection = page.textDetections[r.index];
            if (detection) detection.text = text;
            const layer = page.layers[r.index];
            if (layer && layer.type === "text-dialogue") layer.source = text;
          });
          history.snapshotPage(page);
          completed++;
        } catch (err) {
          failed.push(page.fileName);
          log.error("fe", `OCR page ${i + 1} (${page.fileName}): ${err}`);
        }
      }
      ui.dismissToast(progressToast);
      progressToast = null;
      canvas.render();
      sidebar.render();
      if (failed.length) {
        ui.toast(
          i18n.t("toast.batchPartial", {
            stage: i18n.t("header.ocr"),
            completed,
            files: failed.join(", "),
          }),
          completed ? "warn" : "error",
          6000,
        );
      } else if (completed > 0) {
        ui.toast(
          i18n.t("toast.batchDone", {
            stage: i18n.t("header.ocr"),
            count: completed,
          }),
          "success",
          3000,
        );
      }
    } finally {
      ui.dismissToast(progressToast);
      state.isRunning = false;
      if (button) button.disabled = false;
    }
  },

  /** Run OCR on a subset of text detections (by index) — used by the box
   * context menu's "re-OCR" to re-run recognition on one box. Same endpoint
   * + layer mapping as run(); `modelId` overrides the selected OCR model. */
  runBoxes: async function (
    indices: number[],
    modelId?: string,
  ): Promise<void> {
    const page = state.getActivePage();
    if (!page || !indices.length || state.isRunning) return;
    flushDetBboxes();
    const boxes = indices
      .map(function (i) {
        return page.textDetections[i];
      })
      .filter(Boolean)
      .map(function (d) {
        return d.bbox;
      });
    if (!boxes.length) return;

    // Snapshot of which detections we're OCR-ing so a mid-flight undo/redo
    // can't write text onto different boxes that now occupy those indices.
    const expectedIds = indices
      .map(function (i) {
        return page.textDetections[i]?.id;
      })
      .filter(Boolean);

    state.isRunning = true;
    const loadingToast = ui.toast(
      i18n.t("toast.ocrProgress", { current: 0, total: boxes.length }),
      "running",
      0,
    );

    try {
      const model = modelId || models.selectedModel("ocr") || "manga_ocr";
      log.debug("fe", `ocr boxes: start model=${model} indices=[${indices}]`);
      const result = await window.lumina.apiPostStream<{
        results?: OcrResult[];
        detail?: string;
      }>(
        "/ocr/stream",
        {
          imagePath: page.filePath,
          boxes: boxes,
          model,
        },
        (p) => {
          ui.updateToast(
            loadingToast,
            i18n.t("toast.ocrProgress", { current: p.current, total: p.total }),
          );
        },
      );
      if (!result || !result.results)
        throw new Error(result?.detail || "OCR failed");

      // Backend indexes results by request position — map back through the
      // original detection indices. Skip if the boxes changed under us.
      let intact = true;
      let wrote = false;
      (result.results || []).forEach(function (r, k) {
        if (!intact) return;
        const k2 = typeof r.index === "number" ? r.index : k;
        const detIdx = indices[k2];
        const det = page.textDetections[detIdx];
        if (!det || det.id !== expectedIds[k2]) {
          intact = false;
          return;
        }
        const text = normalizeAutoText(r.text || "");
        det.text = text;
        const layer = dialogueLayerForTextIdx(page, detIdx);
        if (layer) {
          layer.source = text;
          alignDialogueLayerToDet(page, detIdx);
        }
      });

      canvas.render();
      sidebar.render();
      // Standalone edit — its own undo step restores the previous text.
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.ocrDone", { count: (result.results || []).length }),
        "success",
        3000,
      );
    } catch (err) {
      log.error("fe", `OCR boxes: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.ocrFailed"), "error");
    } finally {
      state.isRunning = false;
    }
  },
};
