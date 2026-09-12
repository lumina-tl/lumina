/* ── Lumina Auto-Update UI ──
 * Shows an update button when a newer published version exists.
 * Click → download (progress reuses the model-download bar),
 * click again once downloaded → install & relaunch.
 */
import * as i18n from "./i18n";
import { ui } from "./ui";
import { createIcons } from "./ui/icons";

type UpdateState =
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export function initAutoUpdate(): void {
  const btnUpdate = document.getElementById("btn-update");
  const updateIcon = btnUpdate?.querySelector("i[data-lucide]");
  const badge = btnUpdate?.querySelector("span");
  let updateToast: HTMLElement | null = null;
  let updateState: UpdateState = "checking";

  function setUpdateIcon(name: string): void {
    if (updateIcon) {
      updateIcon.setAttribute("data-lucide", name);
      updateIcon.className = "w-3 h-3";
    }
    if (createIcons)
      createIcons({
        nameAttr: "data-lucide",
        attrs: {},
        root: btnUpdate as HTMLElement,
      });
  }

  function setUpdateButton(state: UpdateState, title: string): void {
    updateState = state;
    if (!btnUpdate) return;
    btnUpdate.hidden = state === "checking";
    if (title) btnUpdate.title = title;
    if (badge) badge.hidden = state !== "available" && state !== "downloaded";
    if (state === "downloading") setUpdateIcon("loader-2");
    else if (state === "downloaded") setUpdateIcon("download");
    else if (state === "error") setUpdateIcon("alert-triangle");
    else setUpdateIcon("cloud-download");
  }

  if (btnUpdate) {
    btnUpdate.addEventListener("click", function () {
      if (updateState === "downloaded") {
        void window.lumina.installUpdate();
      } else if (updateState === "available" || updateState === "error") {
        setUpdateButton("downloading", i18n.t("update.downloading"));
        updateToast = ui.downloadToast(i18n.t("update.downloading"));
        void window.lumina.downloadUpdate();
      }
    });
  }

  window.lumina.onUpdateProgress(function (p) {
    if (p.state === "downloading") {
      setUpdateButton("downloading", i18n.t("update.downloading"));
      if (!updateToast)
        updateToast = ui.downloadToast(i18n.t("update.downloading"));
      ui.updateDownloadToast(p.percent || 0, p.transferred || 0, p.total || 0);
    } else if (p.state === "downloaded") {
      if (updateToast) {
        ui.dismissToast(updateToast as never);
        updateToast = null;
      }
      const msg = i18n.t("update.downloaded", {
        version: p.version || "",
      });
      ui.toast(msg, "success", 6000);
      setUpdateButton(
        "downloaded",
        i18n.t("update.install", { version: p.version || "" }),
      );
    } else if (p.state === "error") {
      if (updateToast) {
        ui.dismissToast(updateToast as never);
        updateToast = null;
      }
      ui.toast(i18n.t("update.downloadError"), "error", 8000);
      setUpdateButton("error", i18n.t("update.retry"));
    }
  });

  window.lumina
    .checkForUpdates()
    .then(function (res) {
      if (!res.available) {
        setUpdateButton("checking", "");
        return;
      }
      setUpdateButton(
        "available",
        i18n.t("update.available", { version: res.latest || "" }),
      );
    })
    .catch(function () {
      setUpdateButton("checking", "");
    });
}
