/** API proxy — forwards renderer apiPost to backend. */
import { IPC } from "../../shared/bridge";
import { apiPost } from "./client";
import { handle } from "../core/ipc";

export function registerApiHandlers(): void {
  handle(IPC.apiPost, async (_e, endpoint: string, body: unknown) => {
    try {
      return await apiPost(endpoint, body);
    } catch (err) {
      return { error: true, message: String(err) };
    }
  });
}
