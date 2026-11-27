/** Per-page undo/redo stack (snapshot-based). */
import { state } from "./state";
import { canvas } from "./canvas/index";
import { invalidateComposite } from "./canvas/render";
import { sidebar } from "./sidebar";
import { markDirty } from "./project/dirty";
import { hydrateCleanupCanvas } from "./canvas/tools/paint/shared";
import { resetTransformer } from "./canvas/tools/text/transformer";
import { applyTextSelection } from "./canvas/detection/selection";
import type { Page, PageLayer, TextDetection } from "../types";

/** Convert a Windows path to a loadable file:// URL */
function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

const MAX_STACK = 50;

/** In-memory cache of mask images across undo/redo to avoid reload failure or flicker. */
const _maskImageCache = new Map<string, HTMLImageElement>();
/** In-memory cache of image layer canvases across undo/redo. */
const _layerImageCache = new Map<string, HTMLCanvasElement>();
const _layerCanvasCache = new Map<string, HTMLCanvasElement>();

interface HistoryEntry {
  stack: string[];
  idx: number;
}

/** Snapshot of selection tool transient state for undo/redo. */
export interface SelectionSnapshotState {
  selections: unknown;
  activeId: string | null;
}

type SelectionCapture = () => SelectionSnapshotState | null;
type SelectionRestore = (s: SelectionSnapshotState) => void;

let _captureSelections: SelectionCapture | null = null;
let _restoreSelections: SelectionRestore | null = null;

/** Register selection tool serializers for history snapshots. */
export function setSelectionHistoryHandlers(
  capture: SelectionCapture | null,
  restore: SelectionRestore | null,
): void {
  _captureSelections = capture;
  _restoreSelections = restore;
}

const _entries = new Map<Page, HistoryEntry>();

function _entry(page: Page): HistoryEntry {
  let e = _entries.get(page);
  if (!e) {
    e = { stack: [], idx: -1 };
    _entries.set(page, e);
  }
  return e;
}

/** Serialize one page's editable state (images not serialized). */
function _serializePage(p: Page): string {
  (p.inpaintMasks || []).forEach((m) => {
    if (m.image && m.imagePath) {
      _maskImageCache.set(m.imagePath, m.image);
    }
  });
  (p.layers || []).forEach((l) => {
    if (l.type === "image" && l.imageCanvas instanceof HTMLCanvasElement) {
      _layerCanvasCache.set(l.id, l.imageCanvas);
      if (l.imagePath) {
        _layerImageCache.set(l.imagePath, l.imageCanvas);
      }
    }
  });

  const serializedLayers = (p.layers || []).map((l) => {
    if (l.type === "image" && l.imageCanvas) {
      const copy = { ...l };
      delete copy.imageCanvas;
      return copy;
    }
    return l;
  });

  return JSON.stringify({
    textDetections: p.textDetections,
    _selectedTextIdx: p._selectedTextIdx,
    _selectedTextIndices: p._selectedTextIndices,
    layers: serializedLayers,
    _selectedLayerId: p._selectedLayerId,
    _selectedLayerIds: p._selectedLayerIds,
    inpaintMasks: p.inpaintMasks.map((m) => ({
      id: m.id,
      bbox: m.bbox,
      imagePath: m.imagePath,
      visible: m.visible,
      opacity: m.opacity,
    })),
    cleanupMask: p.cleanupMask
      ? {
          id: p.cleanupMask.id,
          visible: p.cleanupMask.visible,
          opacity: p.cleanupMask.opacity,
          imagePath: p.cleanupMask.imagePath,
        }
      : null,
    backgroundVisible: p.backgroundVisible,
    selections: _captureSelections ? _captureSelections() : null,
  });
}

interface PageSnapshot {
  textDetections: unknown;
  _selectedTextIdx: number | null;
  _selectedTextIndices?: number[];
  layers: unknown;
  _selectedLayerId: string | null;
  _selectedLayerIds?: string[];
  backgroundVisible?: boolean;
  selections?: SelectionSnapshotState | null;
  inpaintMasks?: Array<{
    id: string;
    bbox: { x: number; y: number; w: number; h: number };
    imagePath: string;
    visible: boolean;
    opacity: number;
  }>;
  cleanupMask?: {
    id: string;
    visible: boolean;
    opacity: number;
    imagePath: string | null;
  } | null;
}

/** Re-hydrate mask PNGs from imagePath after deserialization. */
export function hydrateMaskImages(page: Page): void {
  (page.inpaintMasks || []).forEach((m) => {
    if (!m.image && m.imagePath && _maskImageCache.has(m.imagePath)) {
      m.image = _maskImageCache.get(m.imagePath);
    }
    if (m.image) return;
    const img = new Image();
    img.onload = function () {
      _maskImageCache.set(m.imagePath, img);
      const live = page.inpaintMasks.find((lm) => lm.id === m.id);
      if (live) live.image = img;
      if (state.getActivePage() === page) {
        invalidateComposite(page.fileName);
        canvas.render();
      }
    };
    img.onerror = function () {
      /* patch file missing — mask stays hidden */
    };
    img.src = _fileUrl(m.imagePath);
  });
}

/** Re-hydrate image layer canvases from imagePath after deserialization. */
export function hydrateLayerImages(page: Page): void {
  (page.layers || []).forEach((l) => {
    if (l.type === "image" && l.imagePath) {
      if (!(l.imageCanvas instanceof HTMLCanvasElement)) {
        delete l.imageCanvas;
      }
      if (!l.imageCanvas && _layerImageCache.has(l.imagePath)) {
        l.imageCanvas = _layerImageCache.get(l.imagePath);
      }
      if (l.imageCanvas instanceof HTMLCanvasElement) return;
      const img = new Image();
      img.onload = function () {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        _layerImageCache.set(l.imagePath!, c);
        l.imageCanvas = c;
        if (state.getActivePage() === page) {
          canvas.render();
        }
      };
      img.src = _fileUrl(l.imagePath);
    }
  });
}

export const history = {
  _restoring: false,

  _activeEntry(): HistoryEntry | null {
    const page = state.getActivePage();
    return page ? _entry(page) : null;
  },

  /** Ensure every page has a baseline snapshot. */
  reset(): void {
    state.pages.forEach(function (p) {
      const e = _entry(p);
      if (e.stack.length === 0) {
        e.stack = [_serializePage(p)];
        e.idx = 0;
      }
    });
    this._updateButtons();
  },

  /** Push a snapshot for the active page after a mutation. */
  snapshot(opts?: { dirty?: boolean }): void {
    if (this._restoring) return;
    const page = state.getActivePage();
    if (!page) return;
    const e = _entry(page);
    const data = _serializePage(page);
    if (e.stack[e.idx] === data) return; // no change
    e.stack.length = e.idx + 1; // drop redo tail
    e.stack.push(data);
    if (e.stack.length > MAX_STACK) e.stack.shift();
    e.idx = e.stack.length - 1;
    if (!opts || opts.dirty !== false) markDirty();
    this._updateButtons();
  },

  /** Overwrite newest snapshot to merge async steps into one undo. */
  replace(): void {
    if (this._restoring) return;
    const page = state.getActivePage();
    if (!page) return;
    const e = _entry(page);
    if (e.idx !== e.stack.length - 1) return; // only the newest entry
    const data = _serializePage(page);
    if (e.stack[e.idx] === data) return; // no change
    e.stack[e.idx] = data;
    markDirty();
    this._updateButtons();
  },

  undo(): void {
    const e = this._activeEntry();
    const page = state.getActivePage();
    if (!e || !page || e.idx <= 0) return;
    e.idx--;
    this._applyPage(page, e.stack[e.idx]);
    markDirty();
    this._updateButtons();
  },

  redo(): void {
    const e = this._activeEntry();
    const page = state.getActivePage();
    if (!e || !page || e.idx >= e.stack.length - 1) return;
    e.idx++;
    this._applyPage(page, e.stack[e.idx]);
    markDirty();
    this._updateButtons();
  },

  canUndo(): boolean {
    const e = this._activeEntry();
    return !!e && e.idx > 0;
  },

  canRedo(): boolean {
    const e = this._activeEntry();
    return !!e && e.idx < e.stack.length - 1;
  },

  /** Drop a page's history when the page is removed */
  forgetPage(page: Page): void {
    _entries.delete(page);
    this._updateButtons();
  },

  /** Restore a serialized snapshot into live state for one page */
  _applyPage(page: Page, data: string): void {
    const snap = JSON.parse(data) as PageSnapshot;
    this._restoring = true;

    const layers = (snap.layers as PageLayer[]) || [];
    page.layers = layers;
    page.layers.forEach((l) => {
      if (l.type === "image") {
        if (_layerCanvasCache.has(l.id)) {
          l.imageCanvas = _layerCanvasCache.get(l.id);
        } else if (l.imagePath && _layerImageCache.has(l.imagePath)) {
          l.imageCanvas = _layerImageCache.get(l.imagePath);
        }
      }
    });
    const validLayerIds = new Set(layers.map((l) => l.id));
    const rawLayerIds =
      snap._selectedLayerIds ||
      (snap._selectedLayerId ? [snap._selectedLayerId] : []);
    const filteredLayerIds = rawLayerIds.filter((id) => validLayerIds.has(id));
    page._selectedLayerIds = filteredLayerIds;
    page._selectedLayerId =
      filteredLayerIds.length > 0
        ? filteredLayerIds[filteredLayerIds.length - 1]
        : null;

    const dets = (snap.textDetections as TextDetection[]) || [];
    page.textDetections = dets;
    const detCount = dets.length;
    const rawTextIndices =
      snap._selectedTextIndices ||
      (snap._selectedTextIdx !== null && snap._selectedTextIdx !== undefined
        ? [snap._selectedTextIdx]
        : []);
    const filteredTextIndices = rawTextIndices.filter(
      (i) => typeof i === "number" && i >= 0 && i < detCount,
    );
    page._selectedTextIndices = filteredTextIndices;
    page._selectedTextIdx =
      filteredTextIndices.length > 0
        ? filteredTextIndices[filteredTextIndices.length - 1]
        : null;

    // Always collapse editor on undo/redo — double-click to re-expand.
    page._expandedLayerId = null;
    if (typeof snap.backgroundVisible === "boolean")
      page.backgroundVisible = snap.backgroundVisible;

    // Preserve existing mask images from memory cache or current page
    const prevMaskImages = new Map(
      (page.inpaintMasks || []).map((m) => [m.imagePath, m.image]),
    );
    const masks = (snap.inpaintMasks || []).map((m) => ({
      ...m,
      image:
        _maskImageCache.get(m.imagePath) ??
        prevMaskImages.get(m.imagePath) ??
        undefined,
    }));
    page.inpaintMasks = masks as never;

    // Cleanup raster layer: preserve the runtime canvas when the imagePath
    // hasn't changed; only drop + rehydrate when it points to a different file.
    if (snap.cleanupMask) {
      const samePath =
        page.cleanupMask?.imagePath === snap.cleanupMask.imagePath;
      page.cleanupMask = {
        id: snap.cleanupMask.id,
        visible: snap.cleanupMask.visible,
        opacity: snap.cleanupMask.opacity,
        imagePath: snap.cleanupMask.imagePath,
        cleanupCanvas: samePath ? page.cleanupMask?.cleanupCanvas : undefined,
      };
    } else {
      page.cleanupMask = null;
    }
    // Re-hydrate only masks whose images were dropped (new/changed paths).
    hydrateMaskImages(page);
    hydrateLayerImages(page);
    if (!page.cleanupMask?.cleanupCanvas && page.cleanupMask?.imagePath)
      hydrateCleanupCanvas(page);
    // The composite bake is stale after undo (masks/cleanup changed) —
    // invalidate so the next render re-bakes from the restored state.
    invalidateComposite(page.fileName);
    // Selections are transient but undoable — bring them back with the
    // page so Ctrl+Z removes the rectangle/lasso that was just drawn.
    if (_restoreSelections)
      _restoreSelections(
        snap.selections ?? { selections: [], activeId: null },
      );
    resetTransformer();
    canvas._clearGroups();
    canvas.render();
    applyTextSelection(page._selectedTextIdx ?? null);
    if (sidebar && sidebar.render) sidebar.render();
    this._restoring = false;
  },

  _updateButtons(): void {
    const u = document.getElementById("btn-undo") as HTMLButtonElement | null;
    const r = document.getElementById("btn-redo") as HTMLButtonElement | null;
    if (u) u.disabled = !this.canUndo();
    if (r) r.disabled = !this.canRedo();
  },
};
