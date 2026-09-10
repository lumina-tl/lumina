export interface ModelInfo {
  id: string;
  name: string;
  kind: string;
  status?: string;
  ready: boolean;
  size: number | null;
  description?: string;
  gpu?: string;
  prefer?: string;
}

export interface ModelCheck {
  cached: boolean;
  models: ModelInfo[];
}

export interface DownloadProgress {
  running: boolean;
  progress: number;
  downloaded: number;
  total: number;
  done: boolean;
  error?: string | null;
  cancelled?: boolean;
  model?: string | null;
}
