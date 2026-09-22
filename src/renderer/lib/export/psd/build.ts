/** Compose PSD document from a Lumina Page. */
import type { Psd, Layer } from "ag-psd";
import type { Page } from "../../../types";
import { ensureCleanupCanvas } from "../../canvas/tools/paint/shared";
import { ensureMaskImages, ensureCleanupForExport } from "../render";
import * as pageImages from "../../project/page-images";
import { mapLayerToPsdText } from "./text-map";

/** Render to offscreen canvas and return PixelData for ag-psd. */
function renderToImageData(
  drawFn: (ctx: CanvasRenderingContext2D) => void,
  w: number,
  h: number,
): NonNullable<Layer["imageData"]> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  drawFn(ctx);
  const id = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8Array(id.data) };
}

/**
 * Build a multi-page PSD document with Photoshop Artboards.
 *
 * Each page becomes a formal Photoshop Artboard arranged in a grid
 * (4 per row) with spacing/margin between pages.
 */
export async function buildPsdDocument(
  pages: Page[],
  onProgress?: (current: number, total: number) => void,
): Promise<Psd> {
  if (pages.length === 0) throw new Error("No pages to export");

  const gap = 100; // Spacing in pixels between artboards
  const cellW = pages[0].naturalWidth;
  const cellH = pages[0].naturalHeight;
  const cols = Math.min(4, pages.length);
  const rows = Math.ceil(pages.length / cols);

  const totalW = cols * cellW + (cols - 1) * gap;
  const totalH = rows * cellH + (rows - 1) * gap;

  const children: Layer[] = [];

  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i + 1, pages.length);
    const p = pages[i];

    // Ensure assets are decoded/loaded before reading pixels
    await ensureMaskImages(p);
    await ensureCleanupForExport(p);
    if (!p.image) await pageImages.ensurePageImage(p);

    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * (cellW + gap);
    const top = row * (cellH + gap);
    const right = left + p.naturalWidth;
    const bottom = top + p.naturalHeight;

    children.push({
      name: `Page ${i + 1}`,
      hidden: false,
      opened: false,
      left,
      top,
      right,
      bottom,
      artboard: {
        rect: { top, left, bottom, right },
      },
      children: buildPageLayers(p, left, top),
    });

    // Yield to event loop so UI stays responsive
    if (i < pages.length - 1) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  return { width: totalW, height: totalH, children };
}

/**
 * Build layer children for a single page.
 * All layers are positioned at (offsetX, offsetY) on the PSD canvas.
 */
function buildPageLayers(
  page: Page,
  offsetX: number,
  offsetY: number,
): Layer[] {
  const w = page.naturalWidth;
  const h = page.naturalHeight;
  const children: Layer[] = [];

  if (!page.image) throw new Error("Page image unavailable for PSD export");

  // Background
  children.push({
    name: "Background",
    top: offsetY,
    left: offsetX,
    bottom: offsetY + h,
    right: offsetX + w,
    imageData: renderToImageData(
      (ctx) => ctx.drawImage(page.image!, 0, 0, w, h),
      w,
      h,
    ),
  });

  // Composite inpaint patches + cleanup → single Cleanup layer
  const hasCleanup =
    page.cleanupMask?.visible &&
    (page.cleanupMask?.imagePath || page.cleanupMask?.cleanupCanvas);
  const hasInpaint = page.inpaintMasks.some((m) => m.visible && m.image);
  if (hasCleanup || hasInpaint) {
    children.push({
      name: "Cleanup",
      top: offsetY,
      left: offsetX,
      bottom: offsetY + h,
      right: offsetX + w,
      imageData: renderToImageData(
        (ctx) => {
          for (const m of page.inpaintMasks) {
            if (!m.visible || !m.image) continue;
            ctx.globalAlpha = m.opacity;
            ctx.drawImage(m.image, m.bbox.x, m.bbox.y, m.bbox.w, m.bbox.h);
          }
          const cc = page.cleanupMask ? ensureCleanupCanvas(page) : null;
          if (cc && page.cleanupMask?.visible) {
            ctx.globalAlpha = page.cleanupMask.opacity;
            ctx.drawImage(cc, 0, 0);
          }
          ctx.globalAlpha = 1;
        },
        w,
        h,
      ),
    });
  }

  // Text layers
  for (const lay of [...page.layers].reverse()) {
    if (!lay.visible) continue;
    if (lay.type === "text-dialogue" && page.inpaintMasks.length === 0)
      continue;
    const text = lay.translation || lay.source || "";
    if (!text) continue;
    const psLayer = mapLayerToPsdText(lay, offsetX, offsetY);
    if (psLayer) children.push(psLayer);
  }

  return children;
}
