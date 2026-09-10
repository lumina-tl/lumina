export interface FontInfo {
  family: string;
  path: string;
  weight: number;
  italic: boolean;
}

export interface TempPngWritePayload {
  data: Uint8Array;
  subdir?: string;
  name?: string;
}

export interface TempPngWriteResult {
  path: string;
}

export interface ModelsPathState {
  path: string;
  envOverride: boolean;
}
