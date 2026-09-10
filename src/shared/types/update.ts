/** Update types — check result + progress. */
export interface CheckUpdateResult {
  available: boolean;
  current?: string;
  latest?: string;
  url?: string;
  error?: string;
}

export interface UpdateProgress {
  state: "downloading" | "downloaded" | "error";
  percent?: number;
  transferred?: number;
  total?: number;
  speed?: number;
  version?: string;
  error?: string;
}
