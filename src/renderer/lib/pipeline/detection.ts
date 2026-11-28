/** Lumina Pipeline — Detection */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { models } from "../models";
import type { DetectResult, PageLayer, TextDetection } from "../../types";
import { sortReadingOrder } from "../utils/reading-order";
import { log } from "../logger";
import { defaultTypography, loadGlobalTypography } from "../../types";
import type { Page } from "../../types";
import type { PipelineStepInfo } from "./ocr";

function applyDetectionResult(page: Page, result: DetectResult): void {
  const sortedTexts = sortReadingOrder(
    (result.textDetections || []).map(
      (d, i): TextDetection => ({
        id: "text-" + i,
        bbox: Object.assign({}, d.bbox),
        type: d.type,
        confidence: d.confidence || 0,
        status: "auto",
        textColor: d.textColor,
        textAngle: d.textAngle,
      }),
    ),
  );
  page.textDetections = sortedTexts;
  page.maskPath = result.maskPath ?? null;
  page._selectedTextIdx = null;
  page._cleanOnlyProcessed = false;
  page._cleanOnlyDetectionDone = true;
  page._pipelineDetectionDone = true;
  page._pipelineOcrDone = false;
  page._pipelineTranslationDone = false;
  page._pipelineInpaintDone = false;

  const otherLayers = page.layers.filter(
    (layer) => layer.type !== "text-dialogue",
  );
  const dialogueLayers: PageLayer[] = sortedTexts.map((d, i) => ({
    id: "layer-t" + i,
    type: "text-dialogue",
    bbox: Object.assign({}, d.bbox),
    source: d.text || "",
    translation: d.translated || "",
    typography: Object.assign(
      defaultTypography(),
      loadGlobalTypography(),
      d.textColor ? { color: d.textColor } : {},
      typeof d.textAngle === "number" ? { rotation: d.textAngle } : {},
    ),
    visible: true,
    opacity: 1,
  }));
  page.layers = [...dialogueLayers, ...otherLayers];
  page._selectedLayerId = null;
  page._expandedLayerId = null;
}

export const detection = {
  /** Run detection on active page */
  run: async function (stepInfo?: PipelineStepInfo): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    state.isRunning = true;

    const btn = document.getElementById(
      "btn-detect",
    ) as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
    }

    const stepPrefix = stepInfo ? `[${stepInfo.current}/${stepInfo.total}] ` : "";
    const isFirstRun = !state._modelLoaded;
    let loadingToast: ReturnType<typeof ui.toast> | null;
    if (isFirstRun) {
      loadingToast = ui.toast(
        `${stepPrefix}${i18n.t("toast.detectFirstRun")}`,
        "running",
        0,
      );
    } else {
      loadingToast = ui.toast(
        `${stepPrefix}${i18n.t("toast.detectRunning")}`,
        "running",
        0,
      );
    }

    try {
      const model = models.selectedModel("detect") || "rtdetr";
      log.debug("fe", `detect: start model=${model} page=${page.fileName}`);
      const result = await window.lumina.apiPost<DetectResult>("/detect", {
        imagePath: page.filePath,
        model,
      });
      if (!result || result.error)
        throw new Error(result?.detail || "Detection failed");

      applyDetectionResult(page, result);
      log.debug("fe", `detect: done texts=${page.textDetections.length}`);

      // Fresh boxes — make sure the overlay is visible.
      state.showDetBoxes = true;
      canvas._clearGroups();
      canvas.render();
      sidebar.render();

      state._modelLoaded = true;
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.detectDone", {
          texts: page.textDetections.length,
        }),
        "success",
        3000,
      );
    } catch (err) {
      log.error("fe", `Detection: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.detectFailed"), "error");
    } finally {
      state.isRunning = false;
      const btn2 = document.getElementById(
        "btn-detect",
      ) as HTMLButtonElement | null;
      if (btn2) btn2.disabled = false;
    }
  },
};
