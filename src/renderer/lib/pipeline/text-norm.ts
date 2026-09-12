/* ── Auto text normalization ──
 * OCR/LLM output is treated as ONE line per box — newlines coming from a
 * model are layout artifacts (the bubble was split into lines), not real
 * line breaks: this project models one box = one line. Manual edits typed
 * in the layer editor are never passed through this.
 */

export type OcrNormalizeMode = "none" | "lowercase" | "uppercase";

const STORAGE_KEY = "lumina-ocr-normalize";

/** Get the current OCR text normalization mode. */
export function getOcrNormalizeMode(): OcrNormalizeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "lowercase" || raw === "uppercase") return raw;
  } catch {}
  return "none";
}

/** Set the OCR text normalization mode. */
export function setOcrNormalizeMode(mode: OcrNormalizeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function normalizeAutoText(text: string): string {
  // Collapse every whitespace run (incl. \n, \r, \t, ideographic space)
  // into a single regular space, then trim.
  let result = text.replace(/[\s\u3000]+/g, " ").trim();

  const mode = getOcrNormalizeMode();
  if (mode === "lowercase") result = result.toLowerCase();
  else if (mode === "uppercase") result = result.toUpperCase();

  return result;
}
