/** Lumina Canvas — Unified layer operations (koharu-style panel) */
import { state } from "../../state";
import { canvas } from "../index";
import { invalidateComposite } from "../render";
import { sidebar } from "../../sidebar";
import { history } from "../../history";
import { textIdxForLayerId, applyTextSelection } from "../detection/selection";
import { reflowVerticalLayerBbox } from "../tools/text/vertical-reflow";
import {
  getEditingShapeId,
  isEditingShapePath,
  stopShapePathEdit,
} from "../tools/pen/direct-select";

function _findLayer(
  page: { layers: Array<{ id: string }> } | null,
  id: string | null,
): number {
  if (!page || !id) return -1;
  return page.layers.findIndex(function (l) {
    return l.id === id;
  });
}

canvas.selectLayer = function (
  id,
  opts?: { toggle?: boolean; range?: boolean },
): void {
  const page = state.getActivePage();
  if (!page) return;

  if (id === null) {
    page._selectedLayerId = null;
    page._selectedLayerIds = [];
    page._expandedLayerId = null;
    page._selectedTextIdx = null;
    page._selectedTextIndices = [];
    if (isEditingShapePath()) stopShapePathEdit();
    canvas.render();
    applyTextSelection(null);
    if (sidebar && sidebar.render) sidebar.render();
    return;
  }

  let ids = page._selectedLayerIds
    ? [...page._selectedLayerIds]
    : page._selectedLayerId
      ? [page._selectedLayerId]
      : [];

  if (opts?.toggle) {
    if (ids.includes(id)) {
      ids = ids.filter((x) => x !== id);
    } else {
      ids.push(id);
    }
  } else if (opts?.range && page._selectedLayerId) {
    const fromIdx = page.layers.findIndex((l) => l.id === page._selectedLayerId);
    const toIdx = page.layers.findIndex((l) => l.id === id);
    if (fromIdx >= 0 && toIdx >= 0) {
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      ids = page.layers.slice(start, end + 1).map((l) => l.id);
    } else {
      ids = [id];
    }
  } else {
    ids = [id];
  }

  page._selectedLayerIds = ids;
  page._selectedLayerId = ids.length > 0 ? ids[ids.length - 1] : null;
  if (isEditingShapePath() && page._selectedLayerId !== getEditingShapeId()) {
    stopShapePathEdit();
  }
  if (!ids.includes(page._expandedLayerId || "")) {
    page._expandedLayerId = null;
  }

  // Mirror to detection indices
  const indices: number[] = [];
  ids.forEach((lid) => {
    const dIdx = textIdxForLayerId(page, lid);
    if (dIdx !== null) indices.push(dIdx);
  });
  page._selectedTextIndices = indices;
  page._selectedTextIdx =
    indices.length > 0 ? indices[indices.length - 1] : null;

  canvas.render();
  applyTextSelection(page._selectedTextIdx);
  if (sidebar && sidebar.render) sidebar.render();
};

canvas.selectMultipleLayers = function (ids: string[]): void {
  const page = state.getActivePage();
  if (!page) return;

  const validIds = Array.from(new Set(ids)).filter((id) =>
    page.layers.some((l) => l.id === id),
  );
  page._selectedLayerIds = validIds;
  page._selectedLayerId =
    validIds.length > 0 ? validIds[validIds.length - 1] : null;
  if (!validIds.includes(page._expandedLayerId || "")) {
    page._expandedLayerId = null;
  }

  const indices: number[] = [];
  validIds.forEach((lid) => {
    const dIdx = textIdxForLayerId(page, lid);
    if (dIdx !== null) indices.push(dIdx);
  });
  page._selectedTextIndices = indices;
  page._selectedTextIdx =
    indices.length > 0 ? indices[indices.length - 1] : null;

  canvas.render();
  applyTextSelection(page._selectedTextIdx);
  if (sidebar && sidebar.render) sidebar.render();
};

canvas.expandLayer = function (id): void {
  const page = state.getActivePage();
  if (!page) return;
  page._expandedLayerId = id;
  if (sidebar && sidebar.render) sidebar.render();
};

canvas.setLayerText = function (id, field, text): void {
  const page = state.getActivePage();
  const i = _findLayer(page, id);
  if (!page || i < 0) return;
  const layer = page.layers[i];
  if (field === "source") {
    layer.source = text;
  } else {
    layer.translation = text;
    reflowVerticalLayerBbox(layer, page);
  }
  // Mirror to parallel detection model
  if (layer.type === "text-dialogue") {
    const detIdx = textIdxForLayerId(page, id);
    if (detIdx !== null && detIdx < page.textDetections.length) {
      const det = page.textDetections[detIdx];
      if (det) {
        if (field === "source") det.text = text;
        else det.translated = text;
      }
    }
  }
  canvas.render();
  history.snapshot();
};

canvas.toggleLayerVisible = function (id): void {
  const page = state.getActivePage();
  const i = _findLayer(page, id);
  if (!page || i < 0) return;
  page.layers[i].visible = !page.layers[i].visible;
  canvas.render();
  sidebar.render();
  history.snapshot();
};

// Virtual "Mask" row — one toggle that flips every inpaint patch at once.
canvas.toggleAllMasks = function (): void {
  const page = state.getActivePage();
  if (!page || page.inpaintMasks.length === 0) return;
  const show = !page.inpaintMasks.some((m) => m.visible);
  page.inpaintMasks.forEach((m) => {
    m.visible = show;
  });
  invalidateComposite(page.fileName);
  canvas.render();
  sidebar.render();
  history.snapshot();
};

// Virtual "Background" row — the imported page image itself.
canvas.toggleBackgroundVisible = function (): void {
  const page = state.getActivePage();
  if (!page) return;
  page.backgroundVisible = !page.backgroundVisible;
  invalidateComposite(page.fileName);
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.toggleLayerLocked = function (id): void {
  const page = state.getActivePage();
  const i = _findLayer(page, id);
  if (!page || i < 0) return;
  const layer = page.layers[i];
  layer.locked = !layer.locked;
  if (layer.locked && isEditingShapePath(id)) {
    stopShapePathEdit();
  }
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.deleteLayer = function (id): void {
  const page = state.getActivePage();
  const i = _findLayer(page, id);
  if (!page || i < 0) return;
  const layer = page.layers[i];
  if (layer.locked) return;
  const detIdx = textIdxForLayerId(page, id);
  page.layers.splice(i, 1);
  // Mirror deletion into the parallel detection model
  if (
    layer.type === "text-dialogue" &&
    detIdx !== null &&
    detIdx < page.textDetections.length
  ) {
    page.textDetections.splice(detIdx, 1);
    if (page._selectedTextIdx === detIdx) page._selectedTextIdx = null;
    else if (page._selectedTextIdx !== null && page._selectedTextIdx > detIdx)
      page._selectedTextIdx--;
  }
  if (page._selectedLayerId === id) {
    page._selectedLayerId = null;
    page._expandedLayerId = null;
  }
  if (page._selectedLayerIds) {
    page._selectedLayerIds = page._selectedLayerIds.filter((x) => x !== id);
  }
  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.deleteMultipleLayers = function (ids): void {
  const page = state.getActivePage();
  if (!page || !ids.length) return;

  const toDelete = new Set(
    ids.filter((id) => {
      const l = page.layers.find((x) => x.id === id);
      return l && !l.locked;
    }),
  );
  if (toDelete.size === 0) return;
  // Find all detection indices to remove
  const detIndicesToRemove: number[] = [];
  page.layers.forEach((l) => {
    if (toDelete.has(l.id) && l.type === "text-dialogue") {
      const dIdx = textIdxForLayerId(page, l.id);
      if (dIdx !== null) detIndicesToRemove.push(dIdx);
    }
  });

  page.layers = page.layers.filter((l) => !toDelete.has(l.id));

  detIndicesToRemove
    .sort((a, b) => b - a)
    .forEach((dIdx) => {
      if (dIdx >= 0 && dIdx < page.textDetections.length) {
        page.textDetections.splice(dIdx, 1);
      }
    });

  page._selectedLayerId = null;
  page._selectedLayerIds = [];
  page._expandedLayerId = null;
  page._selectedTextIdx = null;
  page._selectedTextIndices = [];

  canvas.render();
  sidebar.render();
  history.snapshot();
};

canvas.moveLayerTo = function (id, insertAt): void {
  const page = state.getActivePage();
  const from = _findLayer(page, id);
  if (!page || from < 0) return;
  const layer = page.layers[from];

  if (layer.type === "image" || layer.type === "shape") {
    const to = Math.max(0, Math.min(page.layers.length, insertAt));
    if (to === from || to === from + 1) return;
    page.layers.splice(from, 1);
    const insert = from < to ? to - 1 : to;
    page.layers.splice(insert, 0, layer);
    canvas.render();
    sidebar.render();
    history.snapshot();
    return;
  }

  // Clamp the insertion point to the layer's type group — dialogue layers
  // must stay ahead of free-text layers (parallel detection index).
  let groupStart = -1;
  let groupEnd = -1;
  page.layers.forEach(function (l, i) {
    if (l.type === layer.type) {
      if (groupStart < 0) groupStart = i;
      groupEnd = i;
    }
  });
  if (groupStart < 0) return;
  const to = Math.max(groupStart, Math.min(groupEnd + 1, insertAt));
  if (to === from || to === from + 1) return; // no-op

  page.layers.splice(from, 1);
  const insert = from < to ? to - 1 : to;
  page.layers.splice(insert, 0, layer);

  // Mirror reorder in the parallel detection model
  if (layer.type === "text-dialogue") {
    const dets = page.textDetections;
    if (from < dets.length && insert < dets.length) {
      const det = dets.splice(from, 1)[0];
      dets.splice(insert, 0, det);
    }
  }
  canvas.render();
  sidebar.render();
  history.snapshot();
};

