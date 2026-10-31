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
      en: "Baberu OCR Updated (Long Text No Longer Cut Off)",
      id: "Pembaruan Baberu OCR (Teks Panjang Tidak Terpotong Lagi)",
    },
    message: {
      en: "Baberu OCR has been upgraded to the latest version. The issue in v1.0 where long narration or dialogue bubbles were cut off mid-sentence has been resolved with support for up to 256 characters per bubble, alongside major recognition improvements for sound effects (SFX) and handwritten text.\n\nIf you already downloaded Baberu OCR previously, please open Settings → Models, click Delete on Baberu OCR, then click Download to get the updated model weights.",
      id: "Baberu OCR telah diperbarui ke versi terbaru. Masalah pada v1.0 di mana teks narasi atau dialog panjang terpotong di tengah kalimat kini sudah teratasi dengan dukungan pembacaan hingga 256 karakter per gelembung, serta peningkatan akurasi efek suara (SFX) dan tulisan tangan.\n\nBagi pengguna yang sudah mengunduh Baberu OCR sebelumnya, silakan buka Settings → Models, klik Hapus (Delete) pada Baberu OCR, lalu klik Unduh (Download) untuk mendapatkan bobot model terbaru.",
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
