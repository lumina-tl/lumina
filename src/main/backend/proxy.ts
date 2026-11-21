/** API proxy — forwards renderer apiPost to backend. */
import { IPC } from "../../shared/bridge";
import { apiPost, apiPostStream } from "./client";
import { handle, send, windowFromEvent } from "../core/ipc";

export function registerApiHandlers(): void {
  handle(IPC.apiPost, async (_e, endpoint: string, body: unknown) => {
    try {
      return await apiPost(endpoint, body);
    } catch (err) {
      return { error: true, message: String(err) };
    }
  });

  handle(
    IPC.apiPostStream,
    async (
      event,
      endpoint: string,
      body: unknown,
      streamId?: string,
    ) => {
      const win = windowFromEvent(event) ?? null;
      try {
        return await apiPostStream(endpoint, body, (chunk) => {
          if (win && streamId) {
            send(win, `stream-progress:${streamId}`, chunk);
          }
        });
      } catch (err) {
        return { error: true, message: String(err), detail: String(err) };
      }
    },
  );
}
