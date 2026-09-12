/** Stroke-end serialization — PNG cache + history snapshot. */
import { history } from "../../../history";
import { ui } from "../../../ui";
import * as i18n from "../../../i18n";
import { canvas } from "../../index";
import { ensureCleanupCanvas } from "./shared";
import type { Page } from "../../../../types";

let _commitSeq = 0;

/** Latest in-flight stroke commit promise (resolves when idle). */
let _pending: Promise<void> = Promise.resolve();
export const pendingCommit: { current: Promise<void> } = { current: _pending };

export async function commitStroke(
  page: Page,
  changed: boolean,
): Promise<void> {
  const mask = page.cleanupMask;
  const c = ensureCleanupCanvas(page);
  if (!mask || !c) return;
  if (!changed) {
    // No pixels painted (zero-length click on empty brush) — still snapshot
    // once so the mask creation is undoable if it happened.
    history.snapshot();
    return;
  }
  // Guard against interleaving: only the LATEST stroke may publish its
  // imagePath. If an older write resolves after a newer one already landed,
  // it must not roll the layer back to a stale version.
  const seq = ++_commitSeq;
  const blob: Blob | null = await new Promise(function (resolve) {
    c.toBlob(function (b) {
      resolve(b);
    }, "image/png");
  });
  if (!blob) return;
  const buf = await blob.arrayBuffer();
  const data = new Uint8Array(buf);
  try {
    const res = await window.lumina.writeTempPng({
      data: data,
      subdir: "cleanup",
      name: "cleanup",
    });
    if (seq !== _commitSeq) return; // a newer stroke already committed
    if (page.cleanupMask !== mask) return; // undo/redo replaced the mask — abort
    mask.imagePath = res.path;
    mask._hydrated = true; // canvas now matches the persisted PNG
    canvas.render();
    history.snapshot();
  } catch (e) {
    console.error("[Lumina] Failed to persist cleanup stroke:", e);
    ui.toast(i18n.t("toast.paintSaveFailed"), "error");
  }
}

/** Wrap commitStroke so pendingCommit tracks the latest in-flight write. */
export function commitStrokeTracked(page: Page, changed: boolean): void {
  const p = commitStroke(page, changed);
  _pending = p;
  pendingCommit.current = p;
}
