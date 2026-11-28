/** Detection mutations — delete / reorder / set text. */
import { state } from "../../state";
import { canvas } from "../index";
import { sidebar } from "../../sidebar";
import { history } from "../../history";
import { dialogueLayerForTextIdx } from "./selection";

// Deletion splices the array and re-renders: badge numbers (T1, B2, ...) are
// derived from array index, so they renumber automatically.

canvas.deleteTextDetection = function (idx: number): void {
  const page = state.getActivePage();
  if (!page || idx < 0 || idx >= page.textDetections.length) return;
  page._cleanOnlyProcessed = false;
  page._pipelineOcrDone = false;
  page._pipelineTranslationDone = false;
  page._pipelineInpaintDone = false;
  page.textDetections.splice(idx, 1);
  // Mirror deletion into the unified layer model
  const layer = dialogueLayerForTextIdx(page, idx);
  if (layer) {
    const lIdx = page.layers.indexOf(layer);
    if (lIdx >= 0) page.layers.splice(lIdx, 1);
    if (page._selectedLayerId === layer.id) page._selectedLayerId = null;
    if (page._expandedLayerId === layer.id) page._expandedLayerId = null;
    if (page._selectedLayerIds) {
      page._selectedLayerIds = page._selectedLayerIds.filter((x) => x !== layer.id);
    }
  }
  if (page._selectedTextIdx === idx) {
    page._selectedTextIdx = null;
  } else if (page._selectedTextIdx !== null && page._selectedTextIdx > idx) {
    page._selectedTextIdx--;
  }
  if (page._selectedTextIndices) {
    page._selectedTextIndices = page._selectedTextIndices.filter((x) => x !== idx).map((x) => (x > idx ? x - 1 : x));
  }
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.deleteMultipleTextDetections = function (indices: number[]): void {
  const page = state.getActivePage();
  if (!page || !indices.length) return;
  page._cleanOnlyProcessed = false;
  page._pipelineOcrDone = false;
  page._pipelineTranslationDone = false;
  page._pipelineInpaintDone = false;

  const unique = Array.from(new Set(indices))
    .filter((i) => i >= 0 && i < page.textDetections.length)
    .sort((a, b) => b - a);

  unique.forEach((idx) => {
    page.textDetections.splice(idx, 1);
    const layer = dialogueLayerForTextIdx(page, idx);
    if (layer) {
      const lIdx = page.layers.indexOf(layer);
      if (lIdx >= 0) page.layers.splice(lIdx, 1);
    }
  });

  page._selectedTextIdx = null;
  page._selectedTextIndices = [];
  page._selectedLayerId = null;
  page._selectedLayerIds = [];
  page._expandedLayerId = null;

  canvas.render();
  sidebar.render();
  history.snapshot();
};

/** dir: -1 moves up in reading order, +1 moves down */
canvas.moveTextDetection = function (idx: number, dir: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const arr = page.textDetections;
  const next = idx + dir;
  if (idx < 0 || idx >= arr.length || next < 0 || next >= arr.length) return;
  const tmp = arr[idx];
  arr[idx] = arr[next];
  arr[next] = tmp;
  // Mirror reorder into the unified layer model — only when both slots are
  // dialogue layers (free-text layers live after the dialogue block).
  const layers = page.layers;
  const la = layers[idx];
  const lb = layers[next];
  if (la && la.type === "text-dialogue" && lb && lb.type === "text-dialogue") {
    layers[idx] = lb;
    layers[next] = la;
  }
  if (page._selectedTextIdx === idx) page._selectedTextIdx = next;
  else if (page._selectedTextIdx === next) page._selectedTextIdx = idx;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

/** Set OCR/source text on a text detection (from sidebar inline editor) */
canvas.setTextDetectionText = function (idx: number, text: string): void {
  const page = state.getActivePage();
  if (!page || idx < 0 || idx >= page.textDetections.length) return;
  const det = page.textDetections[idx];
  if (det.text === text) return;
  det.text = text;
  page._pipelineTranslationDone = false;
  if (det.status === "auto") det.status = "adjusted";
  // Mirror into the unified layer model
  const layer = dialogueLayerForTextIdx(page, idx);
  if (layer) layer.source = text;
  canvas._refreshTextGroup(idx);
  history.snapshot();
};
