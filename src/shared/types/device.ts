/** Device types — backend provider info. */
export interface DeviceInfo {
  provider: string;
  ep: string;
  providers?: string[];
  gpus: string[];
  gpuName: string | null;
  onnxRuntime: string | null;
  accelerated: boolean;
}
