/**
 * Auto-expand vertical text boxes into natural horizontal bubble proportions
 * when translated to Latin/horizontal script.
 */
import type { Page, PageLayer, BBox } from "../../../../types";
import { measureLineWidth, wordWrap, CJK_RE } from "./font-fit";

/** Returns true if the bounding box has a vertical aspect ratio (height >= 1.75 * width). */
export function isVerticalBox(bbox: BBox): boolean {
  if (!bbox || bbox.w <= 0 || bbox.h <= 0) return false;
  return bbox.h / bbox.w >= 1.75;
}

/** Check if text is horizontal (Latin/western text, not unbroken CJK). */
export function isHorizontalText(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  // If it contains spaces, it's horizontal words
  if (/\s/.test(clean)) return true;
  // If no spaces, check if it's NOT CJK
  return !CJK_RE.test(clean);
}

/**
 * Reflow a vertical text box into a balanced horizontal box around its center.
 * Returns true if the layer bbox was modified.
 */
export function reflowVerticalLayerBbox(
  layer: PageLayer,
  page: Page,
): boolean {
  const text = (layer.translation || "").trim();
  if (!text) return false;
  if (!isVerticalBox(layer.bbox)) return false;
  if (!isHorizontalText(text)) return false;

  const typo = layer.typography;
  const pw = page.naturalWidth;
  const ph = page.naturalHeight;

  // 1. Target font size scaled mildly with page height
  const targetFontSize = Math.max(
    13,
    Math.min(24, Math.round(ph / 85)),
  );

  // 2. Minimum width to ensure longest word fits without splitting
  const words = text.split(/\s+/).filter(Boolean);
  let maxWordW = 0;
  for (const w of words) {
    const ww = measureLineWidth(w, targetFontSize, typo);
    if (ww > maxWordW) maxWordW = ww;
  }
  const minWForLongestWord = Math.ceil(maxWordW / 0.85);

  // 3. Ideal width based on character count and natural bubble proportions
  const chars = text.replace(/[\s\n]/g, "").length;
  const avgCharW = targetFontSize * 0.55;
  const lineH = targetFontSize * 1.25;
  const estArea = chars * avgCharW * lineH;
  // Target aspect ratio H/W ~ 1.15; with 80% usage ratio inside box:
  const estIdealW = Math.ceil(Math.sqrt(estArea / 1.15) / 0.8);

  // Proportional width based on original column height (manga bubble width ~ 72% height)
  const propW = Math.round(layer.bbox.h * 0.72);

  let targetW = Math.max(minWForLongestWord, estIdealW, propW);

  // Floor and ceiling bounds for safety
  const minSensibleW = Math.max(layer.bbox.w * 2.5, 80);
  const maxSensibleW = Math.min(pw * 0.5, Math.max(280, layer.bbox.h * 1.2));
  targetW = Math.max(minSensibleW, Math.min(maxSensibleW, targetW));

  // 4. Height check: how many lines will this width wrap into?
  const wrapped = wordWrap(text, targetFontSize, typo, targetW * 0.85);
  const neededH = Math.ceil((wrapped.length * lineH) / 0.8);
  let targetH = Math.max(Math.round(layer.bbox.h * 0.8), neededH);
  targetH = Math.min(ph * 0.6, targetH);

  // 5. Expand symmetrically around the original center point
  const cx = layer.bbox.x + layer.bbox.w / 2;
  const cy = layer.bbox.y + layer.bbox.h / 2;
  let newX = Math.round(cx - targetW / 2);
  let newY = Math.round(cy - targetH / 2);

  // 6. Clamp to canvas boundaries
  const margin = 8;
  if (newX < margin) {
    newX = margin;
  }
  if (newX + targetW > pw - margin) {
    newX = Math.max(margin, pw - margin - targetW);
    if (newX + targetW > pw - margin) {
      targetW = Math.max(minWForLongestWord, pw - margin - newX);
    }
  }

  if (newY < margin) {
    newY = margin;
  }
  if (newY + targetH > ph - margin) {
    newY = Math.max(margin, ph - margin - targetH);
    if (newY + targetH > ph - margin) {
      targetH = Math.max(40, ph - margin - newY);
    }
  }

  // 7. Collision guard with neighbor layers (if any)
  for (const other of page.layers) {
    if (other.id === layer.id || !other.visible) continue;
    const vOverlap =
      newY < other.bbox.y + other.bbox.h &&
      newY + targetH > other.bbox.y;
    if (!vOverlap) continue;

    // Neighbor on our left
    if (other.bbox.x + other.bbox.w <= cx) {
      const minLeft = other.bbox.x + other.bbox.w + margin;
      if (newX < minLeft) {
        const diff = minLeft - newX;
        newX = minLeft;
        targetW = Math.max(minWForLongestWord, targetW - diff);
      }
    }
    // Neighbor on our right
    else if (other.bbox.x >= cx) {
      const maxRight = other.bbox.x - margin;
      if (newX + targetW > maxRight) {
        targetW = Math.max(minWForLongestWord, maxRight - newX);
      }
    }
  }

  // Return false if effectively unchanged
  if (
    Math.round(newX) === layer.bbox.x &&
    Math.round(newY) === layer.bbox.y &&
    Math.round(targetW) === layer.bbox.w &&
    Math.round(targetH) === layer.bbox.h
  ) {
    return false;
  }

  layer.bbox.x = Math.round(newX);
  layer.bbox.y = Math.round(newY);
  layer.bbox.w = Math.round(targetW);
  layer.bbox.h = Math.round(targetH);

  // Re-arm auto-fit so font-fit recalculates ideal font size for the new box
  layer.typography.fontSize = null;

  return true;
}
