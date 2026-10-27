/** Export modal — thumbnail sidebar, preview, page info. */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import type { Page } from "../../types";
import { st } from "./state";
import { buildModal } from "./modal";

function _open(pages: Page[]): void {
  if (!pages.length) {
    ui.toast(i18n.t("export.noPages"), "warn");
    return;
  }
  st.order = pages.slice();
  const sourceFolderName = pages[0].sourceFolderName;
  st.folderName =
    sourceFolderName &&
    pages.every((page) => page.sourceFolderName === sourceFolderName)
      ? sourceFolderName
      : "";
  st.format = "png";
  st.quality = 92;
  st.selIdx = 0;
  buildModal();
}

/** Export the currently open page only. */
export function open(): void {
  const active = state.getActivePage();
  _open(active ? [active] : []);
}

/** Export every page in the project. */
export function openAll(): void {
  _open(state.pages.slice());
}

/** Save recognized dialogue text in page and layer order. */
export async function exportOcrText(): Promise<void> {
  const content = state.pages
    .map((page) =>
      page.layers
        .filter((layer) => layer.type === "text-dialogue")
        .map((layer) => (layer.source || "").trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n");

  if (!content) {
    ui.toast(i18n.t("export.ocrEmpty"), "warn");
    return;
  }

  const result = await window.lumina.exportOcrText(content);
  if (!result.canceled) ui.toast(i18n.t("export.ocrDone"), "success", 3000);
}
