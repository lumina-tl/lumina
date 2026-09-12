/* ── Page bitmap lifecycle (D) ──
 * Keeps at most a few decoded page bitmaps in memory (active page + a small
 * LRU cache) instead of holding every page of a project decoded at once.
 * `ensurePageImage(page)` decodes on demand; `releasePageImage(page)` drops
 * the decoded bitmap (and the full-page cleanup canvas) for non-active pages.
 *
 * Thumbnails are generated CHEAP: at open/import every page gets one by
 * decoding directly at thumbnail size (createImageBitmap resize) — the
 * full-res bitmap is never materialized for a thumbnail. Pages visited later
 * reuse it, so the strip never decodes full-res images twice.
 */
import type { Page } from "../../types";

/** Max decoded page bitmaps held outside the active page. */
const MAX_CACHED = 2;
/** Thumbnail output size — matches the strip cell (44:56 ≈ 0.786). */
const THUMB_MAX = 160;
const THUMB_H = 204;

/** Source crop rect (in image px) that fills a 160×204 thumbnail — only for
 *  EXTREME aspects where CSS `object-fit: cover` would show a thin sliver.
 *  Normal pages (aspect within 0.55×–1.8× of the thumb) keep the full image
 *  and let CSS cover crop them (shows 85–100% — already fine). Long strips
 *  are cropped near the TOP (panel start); wide panoramas near the CENTER. */
function _thumbCrop(
  w: number,
  h: number,
): { sx: number; sy: number; sw: number; sh: number; fit: boolean } {
  const r = THUMB_MAX / THUMB_H; // ≈0.784
  const a = w / h; // page aspect
  // Within tolerance → keep full image, CSS object-fit handles the crop.
  if (a >= r * 0.55 && a <= r * 1.8) {
    return { sx: 0, sy: 0, sw: w, sh: h, fit: true };
  }
  if (a < r * 0.55) {
    // Tall strip — crop an aspect-r window near the top (panel start).
    const sw = w;
    const sh = Math.round(sw / r);
    return {
      sx: 0,
      sy: Math.max(0, Math.round((h - sh) * 0.2)),
      sw,
      sh,
      fit: false,
    };
  }
  // Wide panorama — crop a centered window.
  const sh = h;
  const sw = Math.round(sh * r);
  return {
    sx: Math.max(0, Math.round((w - sw) / 2)),
    sy: 0,
    sw,
    sh,
    fit: false,
  };
}

const _decoded = new Map<string, HTMLImageElement>();

function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function _decode(path: string): Promise<HTMLImageElement | null> {
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = _fileUrl(path);
  });
}

/** Decode `page`'s bitmap if not already loaded, cache it, and generate the
 *  strip thumbnail once. Resolves true when the image is available. */
export async function ensurePageImage(page: Page): Promise<boolean> {
  if (page.image) return true;

  // Cache hit — reuse the decoded bitmap (same path, e.g. page re-activated).
  const cached = _decoded.get(page.filePath);
  if (cached) {
    page.image = cached;
    _touch(page);
    return true;
  }

  const img = await _decode(page.filePath);
  if (!img) return false;
  page.image = img;
  page.naturalWidth = img.naturalWidth;
  page.naturalHeight = img.naturalHeight;
  _decoded.set(page.filePath, img);
  _touch(page);
  _evict();
  if (!page._thumbnail) page._thumbnail = _makeThumb(page);
  return true;
}

/** Drop the decoded bitmap + full-page cleanup canvas + mask patch bitmaps of
 *  a page (keep its thumbnail). No-op while the bitmap is still in the LRU. */
export function releasePageImage(page: Page): void {
  if (!page.image) return;
  if (_decoded.has(page.filePath)) return; // still in LRU — keep it
  page.image = null;
  // The cleanup raster is persisted as a PNG (imagePath) — the runtime
  // full-page canvas is only needed while the page is active. Re-hydrated
  // from disk on the next activation (same path as undo/redo/open).
  if (page.cleanupMask?.cleanupCanvas) {
    page.cleanupMask.cleanupCanvas = undefined;
    page.cleanupMask._hydrated = false;
  }
  // Inpaint patch bitmaps are re-decoded on activation (hydrateMaskImages).
  for (const m of page.inpaintMasks || []) {
    if (m.image) m.image = undefined;
  }
}

/** Move a path to the front of the LRU. */
function _touch(page: Page): void {
  const p = page.filePath;
  _decoded.delete(p);
  _decoded.set(p, page.image as HTMLImageElement);
}

/** Evict oldest entries beyond the cache cap. */
function _evict(): void {
  while (_decoded.size > MAX_CACHED + 1) {
    const first = _decoded.keys().next().value;
    if (first === undefined) break;
    _decoded.delete(first);
  }
}

/** Downscaled data URL thumbnail for the page strip — cropped to the thumb
 *  aspect (160×204) so long strips show a real panel, not a thin sliver. */
function _makeThumb(page: Page): string {
  const img = page.image;
  if (!img) return "";
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const crop = _thumbCrop(nw, nh);
  const c = document.createElement("canvas");
  if (crop.fit) {
    // Extreme aspect — keep the full image; CSS object-fit crops it.
    const scale = Math.min(1, THUMB_MAX / nw, THUMB_H / nh);
    c.width = Math.max(1, Math.round(nw * scale));
    c.height = Math.max(1, Math.round(nh * scale));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
  } else {
    c.width = THUMB_MAX;
    c.height = THUMB_H;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(
      img,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      THUMB_MAX,
      THUMB_H,
    );
  }
  return c.toDataURL("image/jpeg", 0.7);
}

/** Strip thumbnail for a page — generates lazily from a loaded bitmap. */
export function pageThumb(page: Page): string {
  if (page._thumbnail) return page._thumbnail;
  return page.image ? (page._thumbnail = _makeThumb(page)) : "";
}

/** Eagerly generate cheap thumbnails for a list of pages, progressively
 *  (yields between pages so a large import doesn't block the UI). Decodes
 *  directly at thumbnail size via createImageBitmap — the full-res page is
 *  never materialized just for a strip preview. */
export async function preloadThumbnails(pages: Page[]): Promise<void> {
  for (const page of pages) {
    if (page._thumbnail) continue; // already has one
    if (!page.image && !_decoded.has(page.filePath)) {
      const thumb = await _decodeThumb(page.filePath);
      if (thumb) page._thumbnail = thumb;
    } else if (page.image) {
      page._thumbnail = _makeThumb(page);
    }
    // Yield between pages so opening a big project stays responsive.
    await new Promise(function (r) {
      setTimeout(r, 0);
    });
  }
}

/** Decode a page at thumbnail size only — returns a JPEG data URL or null.
 *  Decodes with resize (never materializes the full-res page), then crops to
 *  the thumb aspect so strips show a real panel. */
async function _decodeThumb(path: string): Promise<string | null> {
  try {
    // createImageBitmap resizes during decode — cap the WIDTH at thumb size
    // (aspect-preserving) so a 20000px strip never materializes at full size
    // and a normal page comes out ~160×240. Then crop to the thumb aspect.
    const blob = await (await fetch(_fileUrl(path))).blob();
    const bmp = await createImageBitmap(blob, {
      resizeWidth: THUMB_MAX,
      resizeQuality: "high",
    });
    const crop = _thumbCrop(bmp.width, bmp.height);
    const c = document.createElement("canvas");
    if (crop.fit) {
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
    } else {
      c.width = THUMB_MAX;
      c.height = THUMB_H;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(
        bmp,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        THUMB_MAX,
        THUMB_H,
      );
    }
    bmp.close();
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
