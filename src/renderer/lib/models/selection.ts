/* ── Model Selection ── Resolve which model id is active per kind. */
import { defaultFor } from "./descriptions";
import { s, loadSelected } from "./state";

/** Effective model id for a kind: saved pick > default > first installed > first registered. */
export function resolveSelected(kind: string): string {
  const sel = loadSelected();
  const list = s.models.filter((m) => m.kind === kind);
  if (!list.length) return "";
  const picked = list.find((m) => m.id === sel[kind]);
  if (picked) return picked.id;
  const def = defaultFor(kind);
  const defModel = list.find((m) => m.id === def);
  if (defModel) return defModel.id;
  const installed = list.find((m) => m.ready);
  return installed ? installed.id : (list[0]?.id ?? "");
}

/** True when the selected model for a kind is installed. */
export function selectedReady(kind: string): boolean {
  const id = resolveSelected(kind);
  const m = s.models.find((x) => x.kind === kind && x.id === id);
  return !!m && m.ready;
}

/** Every pipeline kind (detect / ocr / inpaint) has its selected model installed. */
export function allReady(): boolean {
  const kinds = new Set(s.models.map((m) => m.kind).filter((k) => k !== "aux"));
  return kinds.size > 0 && Array.from(kinds).every((k) => selectedReady(k));
}
