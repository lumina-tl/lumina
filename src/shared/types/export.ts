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
