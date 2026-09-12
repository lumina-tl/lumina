/* ── Bucket fill (single click) ──
 * Flood-fills the cleanup layer against the composite image and commits
 * immediately (same undo granularity as a brush stroke).
 */
import type { Page } from "../../../../types";
import { canvas } from "../../index";
import { blitCleanupIntoComposite } from "../../render";
import { ensureCleanupMask, ensureCleanupCanvas } from "./shared";
import { applyBucket, clearSprite } from "./strokes";
import { requireCleanup } from "./guard";
import { commitStrokeTracked } from "./commit";

export function handleBucket(page: Page, img: { x: number; y: number }): void {
  if (!requireCleanup(page)) return;
  ensureCleanupMask(page);
  ensureCleanupCanvas(page);
  clearSprite();
  const rect = applyBucket(page, img.x, img.y);
  // Blit only the filled region into the composite (full-page re-bake would
  // be wasteful — the fill is usually a small patch).
  if (rect) blitCleanupIntoComposite(page, rect);
  canvas.render();
  // Bucket is a single synchronous click — commit right away (the
  // snapshot is taken at stroke-end, same undo granularity as brush).
  void commitStrokeTracked(page, !!rect);
}
