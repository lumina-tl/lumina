/** Model downloads — queue + progress push. */
import { BrowserWindow } from "electron";
import { IPC } from "../../shared/bridge";
import { apiGet, apiPost } from "../backend/client";
import { handle, send } from "../core/ipc";
import { withDownloadMutex } from "../core/mutex";

let win: BrowserWindow | null = null;

export function registerDownloadHandlers(target: BrowserWindow): void {
  win = target;
  handle(IPC.downloadModel, (_e, models: string[] = []) => {
    return withDownloadMutex(async () => {
      try {
        await apiPost("/model/download", { models });
      } catch (err) {
        return { error: String(err) };
      }
      return new Promise<{ error?: string; status?: string }>((resolve) => {
        const poll = setInterval(async () => {
          try {
            const p = (await apiGet("/model/progress")) as {
              running: boolean;
              progress: number;
              downloaded: number;
              total: number;
              done: boolean;
              error: string | null;
              cancelled?: boolean;
              model?: string | null;
            };
            if (win && !win.isDestroyed())
              send(win, IPC.modelDownloadProgress, p);
            if (p.done || p.error || !p.running) {
              clearInterval(poll);
              resolve(p.error ? { error: p.error } : { status: "ok" });
            }
          } catch {
            /* backend hiccup — keep polling */
          }
        }, 500);
      });
    });
  });
  handle(IPC.cancelDownload, async () => {
    try {
      await apiPost("/model/cancel", {});
    } catch (err) {
      return { error: String(err) };
    }
  });
  handle(IPC.deleteModel, (_e, modelId: string) =>
    withDownloadMutex(async () => {
      const result = (await apiPost("/model/delete", { modelId })) as {
        error?: string;
        detail?: string;
      };
      if (result && typeof result === "object") {
        if ("error" in result && result.error) {
          throw new Error(String(result.error));
        }
        if ("detail" in result && result.detail) {
          throw new Error(String(result.detail));
        }
      }
    }),
  );
}
