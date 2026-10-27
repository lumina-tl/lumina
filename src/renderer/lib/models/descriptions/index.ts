/** Localized model descriptions per model id. */
export interface ModelDesc {
  en: string;
  es: string;
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
  anglenet: {
    en: `AngleNet estimates the slant of text inside a detected text box. The app uses that angle to rotate translated text so it follows the original lettering on the page.

• Auxiliary model: it does not detect or recognize text.
• More accurate than the built-in PCA fallback when available.
• Runs automatically; if it is missing or cannot estimate an angle, the app falls back to PCA.
• Source: huggingface.co/Kellenok/anglenet`,
    es: `AngleNet estima la inclinación del texto dentro de un cuadro detectado. La aplicación usa ese ángulo para girar el texto traducido y hacer que siga la orientación de las letras originales.

• Es un modelo auxiliar: no detecta ni reconoce texto.
• Es más preciso que la alternativa PCA integrada cuando está disponible.
• Se ejecuta automáticamente; si falta o no puede estimar el ángulo, la aplicación recurre a PCA.
• Fuente: huggingface.co/Kellenok/anglenet`,
    id: `AngleNet memperkirakan kemiringan teks di dalam kotak teks yang terdeteksi. Aplikasi menggunakan sudut tersebut untuk memutar teks terjemahan agar mengikuti orientasi tulisan aslinya.

• Model tambahan: tidak mendeteksi atau mengenali teks.
• Lebih akurat daripada fallback PCA bawaan jika tersedia.
• Berjalan otomatis; jika tidak tersedia atau tidak dapat memperkirakan sudut, aplikasi menggunakan PCA.
• Sumber: huggingface.co/Kellenok/anglenet`,
  },
};

/** Description for a model id in the given language; "" when unknown. */
export function describe(id: string, lang: string): string {
  const d = ALL[id];
  if (!d) return "";
  if (lang === "es") return d.es;
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
