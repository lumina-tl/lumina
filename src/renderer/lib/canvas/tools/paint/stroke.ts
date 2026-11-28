/** Brush/eraser drag stroke — stamps along pointer path, then commits. */
import type { Page } from "../../../../types";
import { canvas } from "../../index";
import { state } from "../../../state";
import * as i18n from "../../../i18n";
import { ui } from "../../../ui";
import { log } from "../../../logger";
import { history } from "../../../history";
import { sidebar } from "../../../sidebar";
import {
  markSourcesDirty,
  blitCleanupIntoComposite,
  recompositeCleanupRegion,
  invalidateComposite,
} from "../../render";
import {
  ensureCleanupMask,
  ensureCleanupCanvas,
  stageToImg,
  paintSettings,
} from "./shared";
import { applyStroke, clearSprite } from "./strokes";
import { requireCleanup } from "./guard";
import { commitStrokeTracked } from "./commit";
import { updateCursor } from "./cursor";
import type { InpaintMask } from "../../../../types";

let _dragging = false;
let _points: Array<{ x: number; y: number }> = [];
let _mode: "brush" | "eraser" | null = null;
/** Bounding box (image px) of current stroke — blitted per stamped segment. */
let _dirtyRect: { x: number; y: number; w: number; h: number } | null = null;

function selectedInpaintMask(page: Page): InpaintMask | undefined {
  return page.inpaintMasks.find((mask) => mask.id === page._selectedMaskId);
}

function maskBrushStamp(
  ctx: CanvasRenderingContext2D,
  mask: InpaintMask,
  point: { x: number; y: number },
  mode: "brush" | "eraser",
  settings: ReturnType<typeof paintSettings>,
): void {
  const sx = ctx.canvas.width / mask.bbox.w;
  const sy = ctx.canvas.height / mask.bbox.h;
  const cx = (point.x - mask.bbox.x) * sx;
  const cy = (point.y - mask.bbox.y) * sy;
  const rx = (settings.size * sx) / 2;
  const ry = (settings.size * sy) / 2;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(cx + rx));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(cy + ry));
  if (x1 <= x0 || y1 <= y0) return;

  const pixels = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const inner = settings.hardness / 100;
  const color =
    /^#[0-9a-f]{6}$/i.test(settings.color)
      ? [
          parseInt(settings.color.slice(1, 3), 16),
          parseInt(settings.color.slice(3, 5), 16),
          parseInt(settings.color.slice(5, 7), 16),
        ]
      : [17, 17, 17];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const distance = Math.hypot(dx, dy);
      if (distance >= 1) continue;
      const edge =
        distance <= inner || inner >= 1
          ? 1
          : (1 - distance) / Math.max(0.001, 1 - inner);
      const amount = Math.round(edge * settings.opacity * 255);
      const pixelIndex = ((y - y0) * pixels.width + (x - x0)) * 4;
      const alphaIndex = pixelIndex + 3;
      const alpha = pixels.data[alphaIndex] / 255;
      const brushAlpha = amount / 255;
      if (mode === "eraser") {
        pixels.data[alphaIndex] = Math.round(alpha * (1 - brushAlpha) * 255);
        continue;
      }

      const outAlpha = brushAlpha + alpha * (1 - brushAlpha);
      if (outAlpha > 0) {
        for (let channel = 0; channel < 3; channel++) {
          pixels.data[pixelIndex + channel] = Math.round(
            (color[channel] * brushAlpha +
              pixels.data[pixelIndex + channel] * alpha * (1 - brushAlpha)) /
              outAlpha,
          );
        }
      }
      pixels.data[alphaIndex] = Math.round(outAlpha * 255);
    }
  }
  ctx.putImageData(pixels, x0, y0);
}

async function handleSelectedMaskStroke(
  page: Page,
  mask: InpaintMask,
  start: { x: number; y: number },
  mode: "brush" | "eraser",
): Promise<void> {
  const originalImage = mask.image;
  const originalPath = mask.imagePath;
  let source = originalImage;
  if (!source) {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load selected mask"));
      let path = mask.imagePath.replace(/\\/g, "/");
      if (!path.startsWith("/")) path = "/" + path;
      image.src =
        "file://" + encodeURI(path).replace(/#/g, "%23").replace(/\?/g, "%3F");
    });
  }
  if (state.getActivePage() !== page) return;

  const width =
    source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height =
    source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const edited = document.createElement("canvas");
  edited.width = width;
  edited.height = height;
  const ctx = edited.getContext("2d");
  if (!ctx) throw new Error("Could not create mask editing canvas");
  ctx.drawImage(source, 0, 0);
  mask.image = edited;
  const settings = { ...paintSettings() };
  const points = [start];
  let previous = start;

  const applySegment = (end: { x: number; y: number }): void => {
    const distance = Math.hypot(end.x - previous.x, end.y - previous.y);
    const step = Math.max(1, settings.size * 0.25);
    const steps = Math.max(1, Math.ceil(distance / step));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const point = {
        x: previous.x + (end.x - previous.x) * t,
        y: previous.y + (end.y - previous.y) * t,
      };
      maskBrushStamp(ctx, mask, point, mode, settings);
    }
    previous = end;
    points.push(end);
    invalidateComposite(page.fileName);
    canvas.scheduleRender();
  };

  maskBrushStamp(ctx, mask, start, mode, settings);
  invalidateComposite(page.fileName);
  canvas.render();

  const getXY = (ev: MouseEvent | TouchEvent): { x: number; y: number } => {
    const touches = (ev as TouchEvent).touches || (ev as TouchEvent).changedTouches;
    if (touches?.length) return { x: touches[0].clientX, y: touches[0].clientY };
    const mouse = ev as MouseEvent;
    return { x: mouse.clientX, y: mouse.clientY };
  };

  const onMove = (ev: MouseEvent | TouchEvent): void => {
    const rect = canvas.getStage()!.container().getBoundingClientRect();
    const xy = getXY(ev);
    const point = stageToImg(xy.x - rect.left, xy.y - rect.top);
    applySegment(point);
    updateCursor(xy.x - rect.left, xy.y - rect.top);
  };

  const onUp = (): void => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    if (!points.length || state.getActivePage() !== page) return;
    void (async () => {
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          edited.toBlob((result) =>
            result ? resolve(result) : reject(new Error("Could not encode edited mask")),
          );
        });
        const result = await window.lumina.writeTempPng({
          data: new Uint8Array(await blob.arrayBuffer()),
          subdir: "inpaint",
          name: mask.id,
        });
        mask.imagePath = result.path;
        mask.image = edited;
        history.snapshot();
        sidebar.render();
      } catch (error) {
        mask.image = originalImage;
        mask.imagePath = originalPath;
        invalidateComposite(page.fileName);
        canvas.render();
        log.error("fe", `Could not save edited mask: ${error}`);
        ui.toast(i18n.t("masks.editFailed"), "error");
      }
    })();
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove);
  window.addEventListener("touchend", onUp);
}

export function handleStroke(
  page: Page,
  img: { x: number; y: number },
  mode: "brush" | "eraser",
): void {
  const selectedMask = selectedInpaintMask(page);
  if (selectedMask) {
    void handleSelectedMaskStroke(page, selectedMask, img, mode).catch(
      (error) => {
        log.error("fe", `Could not edit selected mask: ${error}`);
        ui.toast(i18n.t("masks.editFailed"), "error");
      },
    );
    return;
  }
  if (!requireCleanup(page)) return;
  ensureCleanupMask(page);
  ensureCleanupCanvas(page);
  clearSprite();
  _dragging = true;
  _mode = mode;
  _points = [{ x: img.x, y: img.y }];
  _dirtyRect = { x: img.x, y: img.y, w: 1, h: 1 };
  applyStroke(page, _points, _mode);
  const cc = page.cleanupMask?.cleanupCanvas;
  if (cc) markSourcesDirty([cc]);
  canvas.render();

  const getXY = function (ev: MouseEvent | TouchEvent): {
    x: number;
    y: number;
  } {
    const t = (ev as TouchEvent).touches || (ev as TouchEvent).changedTouches;
    if (t && t.length) return { x: t[0].clientX, y: t[0].clientY };
    const m = ev as MouseEvent;
    return { x: m.clientX, y: m.clientY };
  };

  const onMove = function (ev: MouseEvent | TouchEvent): void {
    if (!_dragging) return;
    const rect = canvas.getStage()!.container().getBoundingClientRect();
    const xy = getXY(ev);
    const p = stageToImg(xy.x - rect.left, xy.y - rect.top);
    _points.push(p);
    applyStroke(page, [_points[_points.length - 2], p], _mode!);
    updateCursor(xy.x - rect.left, xy.y - rect.top);
    // Extend the dirty box and blit the NEWLY painted region into the
    // composite — no full-page re-bake per move.
    if (_dirtyRect) {
      const m = paintSizePx();
      _dirtyRect.x = Math.min(_dirtyRect.x, p.x - m);
      _dirtyRect.y = Math.min(_dirtyRect.y, p.y - m);
      _dirtyRect.w = Math.max(_dirtyRect.w, p.x + m - _dirtyRect.x);
      _dirtyRect.h = Math.max(_dirtyRect.h, p.y + m - _dirtyRect.y);
    }
    // Eraser removes pixels — blit (source-over) can't reflect that, so
    // re-composite bg + inpaint + cleanup for the dirty region instead.
    if (_mode === "eraser") recompositeCleanupRegion(page, _dirtyRect!);
    else blitCleanupIntoComposite(page, _dirtyRect!);
    canvas.scheduleRender();
  };

  const onUp = function (): void {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    if (!_dragging) return;
    _dragging = false;
    const changed = _points.length > 0;
    _mode = null;
    _points = [];
    _dirtyRect = null;
    void commitStrokeTracked(page, changed);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove);
  window.addEventListener("touchend", onUp);
}

/** Current brush/eraser diameter in image px (from paint settings). */
function paintSizePx(): number {
  return paintSettings().size;
}
