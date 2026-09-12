/** Model description registry — bilingual (en/id) copy per model id. */
export interface ModelDesc {
  en: string;
  id: string;
}

export type ModelDescMap = Record<string, ModelDesc>;

import { DETECT_DESCS } from "./detect";
import { OCR_DESCS } from "./ocr";
import { INPAINT_DESCS } from "./inpaint";
import { describeGpu as _describeGpu } from "./gpu";

const ALL: ModelDescMap = {
  ...DETECT_DESCS,
  ...OCR_DESCS,
  ...INPAINT_DESCS,
};

/** Description for a model id in the given language; "" when unknown. */
export function describe(id: string, lang: string): string {
  const d = ALL[id];
  if (!d) return "";
  if (lang === "id") return d.id;
  return d.en;
}

/** Default model per kind — used when nothing is picked yet. Kept separate
 *  from RECOMMENDED: the default is the license-safe pick (rtdetr is
 *  Apache-2.0), while the badge still highlights the best-quality model. */
export const DEFAULT_MODELS: Record<string, string> = {
  detect: "rtdetr",
  ocr: "baberu",
  inpaint: "lama_manga",
};

/** Default model id for a kind; "" when none. */
export function defaultFor(kind: string): string {
  return DEFAULT_MODELS[kind] || "";
}

/** Recommended model per kind — badge in the UI (best quality, may carry
 *  extra license terms). */
export const RECOMMENDED: Record<string, string> = {
  detect: "rfdetr_seg",
  ocr: "baberu",
  inpaint: "lama_manga",
};

/** Recommended model id for a kind; "" when none. */
export function recommendedFor(kind: string): string {
  return RECOMMENDED[kind] || "";
}

/** Dynamic GPU badge text for a model (re-exported). */
export const describeGpu = _describeGpu;
