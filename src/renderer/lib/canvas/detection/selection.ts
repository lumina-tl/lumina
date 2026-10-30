/** Lumina Canvas — Selection, group refresh, status bar, tool change */
import Konva from "konva";
import { state } from "../../state";
import * as i18n from "../../i18n";
import { canvas } from "../index";
import { TEXT_COLOR } from "../render";
import { sidebar } from "../../sidebar";
import { groupRegistry } from "./group-registry";
import { detBoxRect, layoutDetGroup } from "./groups";
import { syncTransformerSelection } from "../tools/text/transformer";
import type { Page } from "../../../types";

// ── Clear groups (called before re-render) ──

canvas._clearGroups = function (): void {
  groupRegistry.clear();
};

// ── Parallel mapping between layers and text detections ──
// Dialogue layers mirror textDetections 1:1; free-text layers have no
// detection counterpart.

/** Layer id of the i-th text detection (dialogue layer), or null. */
export function layerIdForTextIdx(
  page: Page | null,
  idx: number | null,
): string | null {
  if (!page || idx === null) return null;
  let n = 0;
  for (const l of page.layers) {
    if (l.type !== "text-dialogue") continue;
    if (n === idx) return l.id;
    n++;
  }
  return null;
}

/** Detection index mirrored by a layer id, or null (free-text layers). */
export function textIdxForLayerId(
  page: Page | null,
  id: string | null,
): number | null {
  if (!page || !id) return null;
  let n = 0;
  for (const l of page.layers) {
    if (l.type !== "text-dialogue") continue;
    if (l.id === id) return n;
    n++;
  }
  return null;
}

/** Dialogue layer for textDetections[idx], or null. */
export function dialogueLayerForTextIdx(
  page: Page | null,
  idx: number | null,
): import("../../../types").PageLayer | null {
  if (!page || idx === null) return null;
  let n = 0;
  for (const l of page.layers) {
    if (l.type !== "text-dialogue") continue;
    if (n === idx) return l;
    n++;
  }
  return null;
}

/**
 * After OCR (or re-OCR): park the typeset layer on the detection box that
 * was just cropped. Live det drags must NOT do this — only the OCR write
 * path, so manual text-box edits stay until the next recognition.
 */
export function alignDialogueLayerToDet(page: Page, idx: number): void {
  const det = page.textDetections[idx];
  const layer = dialogueLayerForTextIdx(page, idx);
  if (!det || !layer) return;
  layer.bbox.x = det.bbox.x;
  layer.bbox.y = det.bbox.y;
  layer.bbox.w = det.bbox.w;
  layer.bbox.h = det.bbox.h;
}

/** Re-apply the text-box highlight + transformer + status bar. */
export function applyTextSelection(idx: number | null): void {
  const page = state.getActivePage();
  if (!page) return;

  const textGroups = groupRegistry.textGroups();
  textGroups.forEach(function (g, i) {
    const rect = detBoxRect(g);
    if (!rect) return;
    // Unselected 1px · selected 2px (handles come from the transformer).
    const selected = idx !== null && i === idx;
    rect.stroke(canvas.TEXT_COLOR);
    rect.strokeWidth(selected ? 2 : 1);
    // Selected box must stay draggable even if create-time tool flags lagged.
    g.draggable(selected || g.draggable());
  });

  const tTransformer = groupRegistry.textTransformer();
  if (tTransformer) {
    if (idx !== null && textGroups[idx]) {
      // Attach to the GROUP (badge is a layer sibling — same as text boxes).
      tTransformer.nodes([textGroups[idx]]);
      tTransformer.moveToTop();
      tTransformer.forceUpdate();
      textGroups[idx].draggable(true);
      textGroups[idx].listening(true);
    } else {
      tTransformer.nodes([]);
    }
  }
  // Also clear the text-tool transformer so its selection border disappears
  // on deselect — it follows _selectedLayerId which selectTextDetection
  // already reset (zoom used to hide this because it full re-renders).
  syncTransformerSelection();
  canvas._updateStatus();
  const layer1 = canvas.getLayer();
  if (layer1) layer1.draw();
}

// ── Selection ──

canvas.selectTextDetection = function (idx: number | null): void {
  const page = state.getActivePage();
  if (!page) return;

  const prevIdx = page._selectedTextIdx ?? null;
  page._selectedTextIdx = idx;
  // Mirror dialogue layer ↔ detection. Free-text selection must survive
  // tool changes that only clear the green detection chrome.
  if (idx !== null) {
    const lid = layerIdForTextIdx(page, idx);
    if (lid) page._selectedLayerId = lid;
  } else if (prevIdx !== null) {
    const lid = layerIdForTextIdx(page, prevIdx);
    if (lid && page._selectedLayerId === lid) {
      page._selectedLayerId = null;
      page._expandedLayerId = null;
    }
  }

  applyTextSelection(idx);
  if (sidebar && sidebar.render) sidebar.render();
};

// ── Refresh individual groups ──

const STATUS_COLORS_TEXT: Record<string, string> = {
  auto: TEXT_COLOR,
  adjusted: "#ffa500",
  rejected: "#ff4444",
};

canvas._refreshTextGroup = function (idx: number): void {
  const page = state.getActivePage();
  if (!page) return;
  const det = page.textDetections[idx];
  const group = groupRegistry.textGroups()[idx];
  if (!group || !det) return;
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  group.position({ x: off.x + det.bbox.x * sr, y: off.y + det.bbox.y * sr });
  layoutDetGroup(group, det.bbox.w * sr, det.bbox.h * sr);
  const rect = detBoxRect(group);
  const isSelected = idx === (page._selectedTextIdx ?? null);
  if (rect) {
    rect.stroke(STATUS_COLORS_TEXT[det.status] || canvas.TEXT_COLOR);
    rect.strokeWidth(isSelected ? 2 : 1);
  }
  const layer = canvas.getLayer();
  if (layer) layer.draw();
  if (sidebar && sidebar.render) sidebar.render();
};

// ── Status bar update ──

canvas._updateStatus = function (): void {
  const page = state.getActivePage();
  const tCount = page ? (page.textDetections || []).length : 0;
  const parts: string[] = [];
  parts.push(i18n.t("status.textCount", { count: tCount }));
  if (
    page &&
    page._selectedTextIdx !== null &&
    page._selectedTextIdx !== undefined
  ) {
    parts.push(
      i18n.t("status.selected", {
        type: "T",
        index: (page._selectedTextIdx as number) + 1,
      }),
    );
  }
  const el = document.getElementById("status-detections");
  if (el) el.textContent = parts.join(" · ");
};

// ── Tool change ──

/** Non-paint tools can select / drag canvas objects. */
function _canSelectObjects(tool: string): boolean {
  return (
    tool === "select" ||
    tool === "text" ||
    tool === "lasso" ||
    tool === "rect"
  );
}

canvas.onToolChange = function (tool: string): void {
  const canSelect = _canSelectObjects(tool);
  // Only paint tools drop object selection (they own the pointer).
  if (!canSelect) {
    canvas.selectTextDetection(null);
    const page = state.getActivePage();
    if (page) {
      page._selectedLayerId = null;
      page._expandedLayerId = null;
    }
  }
  groupRegistry.textGroups().forEach(function (g) {
    g.listening(canSelect && state.showDetBoxes);
    g.draggable(canSelect && state.showDetBoxes);
  });
  const tTransformer = groupRegistry.textTransformer();
  if (tTransformer && !canSelect) tTransformer.nodes([]);
  // Re-render so layer text nodes pick up the right interactivity mode
  canvas.render();
  // Konva may have left a stale inline resize cursor on stage.content from a
  // previous transformer drag — clear it so the new tool's cursor applies.
  const stage = canvas.getStage();
  if (stage && stage.content) stage.content.style.cursor = "";
};
