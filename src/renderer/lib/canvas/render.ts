/* ── Lumina Canvas — Stage & Render ── */
import Konva from "konva";
import { state } from "../state";
import { canvas } from "./index";
import { bindPanWhenStageReady } from "./viewport";
import { renderLayerTextNodes } from "./tools/text";

/**
 * Canvas render module.
 * Single Konva stage inside #canvas-container.
 * Composite order: original page image → inpaint mask images (one per
 * visible patch, alpha = feathered mask) → text layers.
 */
let _stage: Konva.Stage | null = null;
let _layer: Konva.Layer | null = null;
let _bgImage: Konva.Image | null = null; // Konva.Image for background

export const TEXT_COLOR = "#00ff88";
export const BUBBLE_COLOR = "#00bfff";

/** rAF-coalesced full render — see scheduleRender(). */
let _renderQueued = false;
/** Source bitmaps that changed since the last static composite. */
const _dirtySources = new Set<unknown>();

export function markSourcesDirty(sources: Iterable<unknown>): void {
  for (const s of sources) _dirtySources.add(s);
}

export function scheduleRender(): void {
  if (_renderQueued) return;
  _renderQueued = true;
  requestAnimationFrame(() => {
    _renderQueued = false;
    _render();
  });
}

// ── Static composite cache ──
interface CompositeCache {
  pageId: string; // page.fileName — unique per session
  w: number;
  h: number;
  sr: number;
  offX: number;
  offY: number;
  bgVisible: boolean;
  canvas: HTMLCanvasElement;
}

/** Get/create the Konva stage */
function _getOrCreateStage(): Konva.Stage | null {
  const container = document.getElementById("canvas-container");
  if (!container) return null;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return null;

  if (_stage) {
    _stage.setSize({ width: w, height: h });
    return _stage;
  }

  _stage = new Konva.Stage({
    container: "canvas-container",
    width: w,
    height: h,
  });
  _layer = new Konva.Layer();
  _stage.add(_layer);

  return _stage;
}

/** Base scale ratio to fit image in container, capped at 1x */
function _getBaseScaleRatio(): number {
  const container = document.getElementById("canvas-container");
  const page = state.getActivePage();
  if (!container || !page) return 1;
  return Math.min(
    container.clientWidth / page.naturalWidth,
    container.clientHeight / page.naturalHeight,
    1,
  );
}

/** Effective scale ratio = fit ratio × zoom level */
function _getScaleRatio(): number {
  return _getBaseScaleRatio() * (state._zoomLevel || 1);
}

/** Long-side target for the baked composite — now NATIVE (1:1 with the page).
 *  The composite is rebuilt only when raster content changes (inpaint done,
 *  visibility toggled, undo, cleanup hydrated) — NEVER because of zoom/pan,
 *  so zooming to pixel level always samples the full-resolution bake. */
function _compositeDs(): number {
  return 1;
}

/** Bake page + inpaint patches + cleanup into ONE offscreen canvas in IMAGE
 *  space at NATIVE resolution (ds = 1). Zoom/pan never touches this — only a
 *  change in the sources (markSourcesDirty), page, or background visibility
 *  invalidates it. Pages with NO masks and NO cleanup skip baking entirely:
 *  the raw `page.image` is drawn directly (full-res, sharp, zero memory). */
function _bakeComposite(
  page: ReturnType<typeof state.getActivePage>,
): { canvas: HTMLCanvasElement; ds: number } | null {
  const img = page?.image;
  if (!page || !img) return null;
  const hasRaster =
    (page.inpaintMasks || []).some((m) => m.visible && m.image) ||
    (page.cleanupMask?.visible && !!page.cleanupMask.cleanupCanvas);
  if (!hasRaster) return null; // clean page — caller draws page.image directly
  const cw = Math.max(1, page.naturalWidth);
  const ch = Math.max(1, page.naturalHeight);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (page.backgroundVisible !== false) ctx.drawImage(img, 0, 0, cw, ch);
  for (const m of page.inpaintMasks || []) {
    if (!m.visible || !m.image) continue;
    ctx.globalAlpha = m.opacity;
    ctx.drawImage(
      m.image,
      0,
      0,
      m.image.naturalWidth || m.image.width,
      m.image.naturalHeight || m.image.height,
      Math.round(m.bbox.x),
      Math.round(m.bbox.y),
      Math.round(m.bbox.w),
      Math.round(m.bbox.h),
    );
    ctx.globalAlpha = 1;
  }
  const cc = page.cleanupMask?.cleanupCanvas;
  if (page.cleanupMask?.visible && cc) {
    ctx.globalAlpha = page.cleanupMask.opacity;
    ctx.drawImage(cc, 0, 0, cw, ch);
    ctx.globalAlpha = 1;
  }
  return { canvas: c, ds: 1 };
}

/** Copy a just-painted region of the cleanup canvas into the baked composite
 *  (1:1, image space) — replaces a full re-bake during brush drags. The
 *  composite must already exist (stroke start bakes it). Purely raster, so
 *  the caller follows up with scheduleRender() for the screen draw. */
export function blitCleanupIntoComposite(
  page: ReturnType<typeof state.getActivePage>,
  rect: { x: number; y: number; w: number; h: number },
): void {
  const cache = state._compositeCache;
  const cc = page?.cleanupMask?.cleanupCanvas;
  if (!page || !cache || !cc || !page.cleanupMask?.visible) return;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(page.naturalWidth - x, Math.ceil(rect.w));
  const h = Math.min(page.naturalHeight - y, Math.ceil(rect.h));
  if (w <= 0 || h <= 0) return;
  const ctx = cache.canvas.getContext("2d")!;
  ctx.globalAlpha = page.cleanupMask.opacity;
  ctx.drawImage(cc, x, y, w, h, x, y, w, h);
  ctx.globalAlpha = 1;
}

/** Destroy every child of the main layer — children are recreated on each
 *  render, and Konva nodes keep listeners/caches alive unless destroyed.
 *  removeChildren() alone was leaking node objects under fast zoom/pan. */
function _destroyLayerChildren(): void {
  if (!_layer) return;
  for (const kid of _layer.getChildren()) kid.destroy();
}

/** Offset to center image in container, plus pan */
function _getOffset(): { x: number; y: number } {
  const container = document.getElementById("canvas-container");
  const page = state.getActivePage();
  if (!container || !page) return { x: 0, y: 0 };
  const sr = _getScaleRatio();
  return {
    x:
      (container.clientWidth - page.naturalWidth * sr) / 2 + (state._panX || 0),
    y:
      (container.clientHeight - page.naturalHeight * sr) / 2 +
      (state._panY || 0),
  };
}

/** The main render — draws background + detection overlays */
function _render(): void {
  const container = document.getElementById("canvas-container");
  if (!container) return;

  const page = state.getActivePage();
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;

  // Clear old groups before rebuilding
  if (canvas._clearGroups) canvas._clearGroups();

  _getOrCreateStage();
  if (!_stage || !_layer) return;

  // Wire deselect click + pan handlers once after stage exists
  if (canvas._initDeselectClick) canvas._initDeselectClick();
  bindPanWhenStageReady();

  _stage.setSize({ width: w, height: h });
  _destroyLayerChildren();

  // Background rect
  _layer.add(new Konva.Rect({ name: "bg", width: w, height: h, fill: "#000" }));

  if (!page || !page.image) {
    _layer.draw();
    return;
  }

  const sr = _getScaleRatio();
  const off = _getOffset();

  // Static composite — background page + inpaint patches + cleanup baked ONCE
  // per page at NATIVE resolution. Clean pages (no masks, no cleanup) skip the
  // bake and draw the raw full-res image — identical quality to pre-refactor.
  // Zoom/pan never re-bakes: every frame is one drawImage at the current
  // scale instead of one per patch. Brush strokes blit incrementally into the
  // baked canvas (blitCleanupIntoComposite) instead of re-baking.
  const cur = state._compositeCache;
  const hasRaster =
    (page.inpaintMasks || []).some((m) => m.visible && m.image) ||
    (page.cleanupMask?.visible && !!page.cleanupMask.cleanupCanvas);
  const needBake =
    hasRaster &&
    (!cur ||
      cur.pageId !== page.fileName ||
      cur.bgVisible !== (page.backgroundVisible ?? true) ||
      _dirtySources.size > 0);
  let comp: CanvasImageSource | null = null;
  if (needBake) {
    const baked = _bakeComposite(page);
    if (baked) {
      comp = baked.canvas;
      state._compositeCache = {
        pageId: page.fileName,
        ds: baked.ds,
        bgVisible: page.backgroundVisible ?? true,
        canvas: baked.canvas,
      };
    }
    _dirtySources.clear();
  } else if (hasRaster && cur) {
    comp = cur.canvas;
  } else {
    // Clean page — draw the raw image directly (native quality).
    comp = page.image;
  }

  if (comp) {
    _layer.add(
      new Konva.Image({
        name: "bg",
        image: comp,
        x: off.x,
        y: off.y,
        width: page.naturalWidth * sr,
        height: page.naturalHeight * sr,
        listening: false,
      }),
    );
  }

  // Detection overlays — shown only while boxes are toggled on, BEFORE the
  // first inpaint run; once mask layers exist the patches themselves are the
  // visual representation of the boxes. After OCR the boxes auto-hide (the
  // OCR text lives in the sidebar layers) but the user can re-show them to
  // verify/adjust a box and re-run OCR.
  if (state.showDetBoxes && page.inpaintMasks.length === 0) {
    // Keep ONE persistent transformer for detection groups — re-creating it
    // every render (and dropping the old one without destroy) leaked nodes
    // during zoom/pan. The group registry clears it via _clearGroups().
    let tTransformer = canvas._getTextTransformer();
    if (!tTransformer) {
      tTransformer = new Konva.Transformer({
        nodes: [],
        rotateEnabled: false,
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
        anchorStroke: TEXT_COLOR,
        anchorFill: "#fff",
        anchorSize: 8,
        borderStroke: TEXT_COLOR,
        borderStrokeWidth: 1,
        padding: 2,
      });
      _layer.add(tTransformer);
      canvas._setTextTransformer(tTransformer);
    }

    page.textDetections.forEach((det, i) => {
      const g = canvas._createTextGroup(det, i, sr, off);
      _layer!.add(g);
    });
  }

  // Unified text layers are rendered by textTool.renderLayerTextNodes() —
  // one Konva.Text per layer that is both visual and interactive (select,
  // move, resize via transformer, double-click to edit).
  renderLayerTextNodes();

  canvas._updateStatus();
  canvas.updateBoxToggle();
  _layer.draw();
}

/** Drop the baked composite for the given page (called on page removal). */
export { _bakeComposite };
export function invalidateComposite(pageId: string | null): void {
  if (
    !pageId ||
    (state._compositeCache && state._compositeCache.pageId === pageId)
  ) {
    state._compositeCache = null;
  }
}

// ── Public API ──

canvas.render = function (): void {
  _render();
};
canvas.scheduleRender = scheduleRender;
canvas.getStage = function () {
  return _stage;
};
canvas.getLayer = function () {
  return _layer;
};
canvas.getScaleRatio = _getScaleRatio;
canvas.getBaseScaleRatio = _getBaseScaleRatio;
canvas.getOffset = _getOffset;
canvas.TEXT_COLOR = TEXT_COLOR;
