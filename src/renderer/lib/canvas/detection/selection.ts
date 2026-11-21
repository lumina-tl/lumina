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

function createDetTransformer(group: Konva.Group): Konva.Transformer {
  return new Konva.Transformer({
    nodes: [group],
    rotateEnabled: false,
    keepRatio: false,
    borderEnabled: true,
    borderStroke: canvas.TEXT_COLOR,
    borderStrokeWidth: 1,
    padding: 0,
    ignoreStroke: true,
    enabledAnchors: [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ],
    anchorStroke: canvas.TEXT_COLOR,
    anchorFill: "#ffffff",
    anchorSize: 7,
    anchorCornerRadius: 1,
    anchorStrokeWidth: 1.5,
  });
}

/** Re-apply the text-box highlight + transformer + status bar. */
export function applyTextSelection(idx: number | null): void {
  const page = state.getActivePage();
  if (!page) return;

  const indices =
    page._selectedTextIndices && page._selectedTextIndices.length > 0
      ? page._selectedTextIndices
      : idx !== null
        ? [idx]
        : page._selectedTextIdx !== null && page._selectedTextIdx !== undefined
          ? [page._selectedTextIdx]
          : [];

  const textGroups = groupRegistry.textGroups();
  textGroups.forEach(function (g, i) {
    const rect = detBoxRect(g);
    if (!rect) return;
    // Unselected 1px · selected 2px (handles come from the transformer).
    const selected = indices.includes(i);
    rect.stroke(canvas.TEXT_COLOR);
    rect.strokeWidth(selected ? 2 : 1);
    // Selected box must stay draggable even if create-time tool flags lagged.
    g.draggable(selected || g.draggable());
  });

  groupRegistry.clearTextTransformers();
  const layer1 = canvas.getLayer();
  if (layer1 && state.showDetBoxes && page.inpaintMasks.length === 0) {
    indices.forEach((i) => {
      const g = textGroups[i];
      if (g) {
        const tr = createDetTransformer(g);
        layer1.add(tr);
        tr.moveToTop();
        groupRegistry.addTextTransformer(tr);
        g.draggable(true);
        g.listening(true);
      }
    });
  }

  // Also sync the text-tool transformers so their selection borders follow
  syncTransformerSelection();
  canvas._updateStatus();
  if (layer1) layer1.draw();
}

// ── Selection ──

canvas.selectTextDetection = function (
  idx: number | null,
  opts?: { toggle?: boolean; range?: boolean },
): void {
  const page = state.getActivePage();
  if (!page) return;

  if (idx === null) {
    page._selectedTextIdx = null;
    page._selectedTextIndices = [];
    page._selectedLayerId = null;
    page._selectedLayerIds = [];
    page._expandedLayerId = null;
    applyTextSelection(null);
    if (sidebar && sidebar.render) sidebar.render();
    return;
  }

  let indices = page._selectedTextIndices
    ? [...page._selectedTextIndices]
    : page._selectedTextIdx !== null && page._selectedTextIdx !== undefined
      ? [page._selectedTextIdx]
      : [];

  if (opts?.toggle) {
    if (indices.includes(idx)) {
      indices = indices.filter((i) => i !== idx);
    } else {
      indices.push(idx);
    }
  } else if (
    opts?.range &&
    page._selectedTextIdx !== null &&
    page._selectedTextIdx !== undefined
  ) {
    const start = Math.min(page._selectedTextIdx, idx);
    const end = Math.max(page._selectedTextIdx, idx);
    indices = [];
    for (let k = start; k <= end; k++) indices.push(k);
  } else {
    indices = [idx];
  }

  page._selectedTextIndices = indices;
  page._selectedTextIdx =
    indices.length > 0 ? indices[indices.length - 1] : null;

  const lids: string[] = [];
  indices.forEach((i) => {
    const lid = layerIdForTextIdx(page, i);
    if (lid) lids.push(lid);
  });
  page._selectedLayerIds = lids;
  page._selectedLayerId = lids.length > 0 ? lids[lids.length - 1] : null;

  applyTextSelection(page._selectedTextIdx);
  if (sidebar && sidebar.render) sidebar.render();
};

canvas.selectMultipleTextDetections = function (indices: number[]): void {
  const page = state.getActivePage();
  if (!page) return;

  const unique = Array.from(new Set(indices)).filter(
    (i) => i >= 0 && i < page.textDetections.length,
  );
  page._selectedTextIndices = unique;
  page._selectedTextIdx = unique.length > 0 ? unique[unique.length - 1] : null;

  const lids: string[] = [];
  unique.forEach((i) => {
    const lid = layerIdForTextIdx(page, i);
    if (lid) lids.push(lid);
  });
  page._selectedLayerIds = lids;
  page._selectedLayerId = lids.length > 0 ? lids[lids.length - 1] : null;

  applyTextSelection(page._selectedTextIdx);
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

  const detSelCount = page?._selectedTextIndices?.length ?? (page?._selectedTextIdx !== null && page?._selectedTextIdx !== undefined ? 1 : 0);
  const layerSelCount = page?._selectedLayerIds?.length ?? (page?._selectedLayerId ? 1 : 0);

  if (detSelCount > 1) {
    parts.push(i18n.t("status.selectedCount", { count: String(detSelCount) }));
  } else if (
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
  } else if (layerSelCount > 1) {
    parts.push(i18n.t("status.selectedCount", { count: String(layerSelCount) }));
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
