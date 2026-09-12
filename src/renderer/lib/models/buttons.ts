/* ── Pipeline Button Gating ── Enable/disable header buttons based on model + image state. */
import * as i18n from "../i18n";
import { s, el } from "./state";
import { selectedReady, allReady } from "./selection";

function setBtn(id: string, enabled: boolean, modelReady: boolean): void {
  const btn = el(id) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = s.hasImage && !modelReady ? i18n.t("models.missingHint") : "";
}

/** Gate header buttons: pipeline needs an image AND the selected model installed. */
export function updateButtons(): void {
  setBtn(
    "btn-detect",
    s.hasImage && selectedReady("detect"),
    selectedReady("detect"),
  );
  setBtn("btn-ocr", s.hasImage && selectedReady("ocr"), selectedReady("ocr"));
  setBtn(
    "btn-inpaint",
    s.hasImage && selectedReady("inpaint"),
    selectedReady("inpaint"),
  );
  // Translate is API-based — only needs a page loaded.
  const tr = el("btn-translate") as HTMLButtonElement | null;
  if (tr) tr.disabled = !s.hasImage;

  const warn = el("btn-models") as HTMLButtonElement | null;
  if (warn) warn.hidden = allReady();
}
