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
    id: "notice-baberu-ocr-weights-v040",
    version: "0.4.0",
    type: "warning",
    badge: {
      en: "Action Required",
      id: "Perlu Tindakan",
    },
    title: {
      en: "Baberu OCR Model Weights Updated",
      id: "Pembaruan Bobot Model Baberu OCR",
    },
    message: {
      en: "Baberu OCR weights have been updated for higher recognition accuracy and fewer hallucinations. If you previously installed this model, please delete the old model and re-download it via Settings → Models.",
      id: "Bobot model Baberu OCR telah diperbarui untuk akurasi pengenalan teks yang lebih tinggi. Jika kamu sudah mengunduh model ini sebelumnya, disarankan menghapus model lama dan mengunduh ulang melalui Settings → Models.",
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
