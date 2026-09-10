/** Device — backend device info + GPU config. */
import { IPC } from "../../shared/bridge";
import { apiGet, apiPost } from "../backend/client";
import { handle } from "../core/ipc";

function fallbackDevice() {
  return {
    provider: "cpu",
    ep: "CPUExecutionProvider",
    providers: ["CPUExecutionProvider"],
    gpus: [],
    gpuName: null,
    onnxRuntime: null,
    accelerated: false,
  };
}

export function registerDeviceHandlers(): void {
  handle(IPC.device, async () => {
    try {
      return await apiGet("/device");
    } catch {
      return fallbackDevice();
    }
  });
  handle(IPC.deviceConfigure, async (_e, useGpu: boolean) => {
    try {
      return await apiPost("/device/configure", { useGpu: !!useGpu });
    } catch (err) {
      return { error: String(err) };
    }
  });
  handle(IPC.checkModel, async () => {
    try {
      return await apiGet("/model/check");
    } catch {
      return { cached: false };
    }
  });
}
