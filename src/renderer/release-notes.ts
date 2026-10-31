/** Developer notices & release advisories */

export type LocalizedText = string | Record<string, string>;

export interface DeveloperNoticeAction {
  label: LocalizedText;
  target: "models" | "settings";
}

export interface DeveloperNotice {
  id: string;
  version?: string;
  type: "warning" | "info" | "critical";
  badge?: LocalizedText;
  title: LocalizedText;
  message: LocalizedText;
  action?: DeveloperNoticeAction;
}

export function resolveLocalized(text: LocalizedText | undefined, lang: string): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[lang] || text.en || Object.values(text)[0] || "";
}

export const developerNotices: DeveloperNotice[] = [
  {
    id: "notice-rfdetr-seg-fp16-v040",
    version: "0.4.0",
    type: "info",
    badge: {
      en: "Model Update",
      id: "Pembaruan Model",
    },
    title: {
      en: "Koharu Layout RF-DETR Seg Updated to FP16",
      id: "Koharu Layout RF-DETR Seg Diperbarui ke FP16",
    },
    message: {
      en: "Koharu Layout RF-DETR Seg has been upgraded to an optimized FP16 model (koharu-layout-rfdetr-seg-2xl-1152-fp16.onnx). This cuts VRAM usage by ~45% (down from ~6GB to ~3.2GB), keeps all tensor buffers inside dedicated GPU memory, and doubles inference speed.\n\nBecause the model file name changed, previously installed weights are no longer detected. Open Settings → Models and click Download on Koharu Layout RF-DETR Seg to install the new model.",
      id: "Koharu Layout RF-DETR Seg telah diperbarui ke format FP16 (koharu-layout-rfdetr-seg-2xl-1152-fp16.onnx). Pembaruan ini menghemat pemakaian VRAM ~45% (turun dari ~6GB ke ~3.2GB), mencegah alokasi memory luber ke RAM sistem, serta mempercepat proses deteksi hingga 2x lipat.\n\nKarena nama berkas model berubah, model versi lama tidak lagi terdeteksi. Silakan buka Settings → Models dan klik Unduh (Download) pada Koharu Layout RF-DETR Seg untuk memasang model terbaru.",
    },
    action: {
      label: {
        en: "Open Models Settings",
        id: "Buka Pengaturan Model",
      },
      target: "models",
    },
  },
  {
    id: "notice-baberu-ocr-weights-v040",
    version: "0.4.0",
    type: "info",
    badge: {
      en: "Model Update",
      id: "Pembaruan Model",
    },
    title: {
      en: "Baberu OCR Updated (256-Token Support)",
      id: "Pembaruan Baberu OCR (Dukungan 256 Karakter)",
    },
    message: {
      en: "Baberu OCR has been updated to v1.2 with support for up to 256 characters per bubble, resolving cut-offs in long dialogue and improving handwriting recognition.\n\nIf you downloaded Baberu OCR previously, open Settings → Models, click Delete on Baberu OCR, then click Download to get the updated weights.",
      id: "Baberu OCR telah diperbarui ke v1.2 dengan batas pembacaan hingga 256 karakter per gelembung, mengatasi teks dialog panjang yang terpotong serta meningkatkan akurasi tulisan tangan.\n\nBagi yang sudah mengunduh Baberu OCR sebelumnya, silakan buka Settings → Models, klik Hapus (Delete) pada Baberu OCR, lalu klik Unduh (Download) untuk mendapatkan model terbaru.",
    },
    action: {
      label: {
        en: "Open Models Settings",
        id: "Buka Pengaturan Model",
      },
      target: "models",
    },
  },
];
