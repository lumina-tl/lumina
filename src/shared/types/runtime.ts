export type RuntimeState =
  | "missing"
  | "downloading"
  | "extracting"
  | "ready"
  | "error";

export interface RuntimeInfo {
  variant: string;
  state: RuntimeState;
  version?: string;
  progress?: number;
  error?: string;
  busy?: boolean;
}

export interface RuntimeProgress {
  state: RuntimeState;
  percent?: number;
  transferred?: number;
  total?: number;
  version?: string;
  error?: string;
}
