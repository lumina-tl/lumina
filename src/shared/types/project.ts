/** Project types — save/open payloads. */
export interface ProjectMaskData {
  id: string;
  bbox: { x: number; y: number; w: number; h: number };
  imagePath: string;
  visible: boolean;
  opacity: number;
}

export interface ProjectPageData {
  fileName: string;
  filePath: string;
  naturalWidth: number;
  naturalHeight: number;
  textDetections: unknown[];
  layers: unknown[];
  inpaintMasks: ProjectMaskData[];
  cleanupMask?: {
    id: string;
    visible: boolean;
    opacity: number;
    imagePath: string | null;
  } | null;
  backgroundVisible: boolean;
  _zoomLevel?: number;
  _panX?: number;
  _panY?: number;
}

export interface ProjectSettingsData {
  provider?: string;
  targetLang?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  llmStyle?: string;
  llmInstruction?: string;
  openrouterModel?: string;
  grokModel?: string;
  geminiModel?: string;
}

export interface ProjectSavePayload {
  savePath: string | null;
  project: {
    activePageIdx: number | null;
    settings: ProjectSettingsData | null;
    pages: ProjectPageData[];
  };
}

export interface ProjectSaveResult {
  path: string | null;
  canceled: boolean;
}

export interface OpenProjectResult {
  projectPath: string;
  activePageIdx: number | null;
  settings: ProjectSettingsData | null;
  pages: ProjectPageData[];
}

export type DiscardChoice = "save" | "discard" | "cancel";
