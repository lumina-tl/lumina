/** Export types — payload + result. */
export interface ExportImageFile {
  fileName: string;
  data: Uint8Array;
}

export interface ExportPayload {
  format: "png" | "jpg";
  quality: number;
  files: ExportImageFile[];
}

export interface ExportResult {
  canceled: boolean;
  dir: string | null;
  count: number;
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
