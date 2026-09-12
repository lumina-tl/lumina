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
