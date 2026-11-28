/** Export types — payload + result. */
export interface ExportImageFile {
  fileName: string;
  data: Uint8Array;
}

export interface ExportPayload {
  format: "png" | "jpg" | "pdf";
  quality: number;
  folderName: string;
  files: ExportImageFile[];
}

export interface ExportResult {
  canceled: boolean;
  dir: string | null;
  count: number;
}

export interface ExportOcrTextResult {
  canceled: boolean;
  filePath?: string;
}

// ── PSD save-as ──

export interface ShowSaveDialogOptions {
  defaultPath?: string;
}

export interface ShowSaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface WritePsdFilePayload {
  filePath: string;
  data: Uint8Array;
}
