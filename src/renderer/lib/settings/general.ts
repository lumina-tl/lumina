/** Settings: General tab (language + auto-save + OCR normalize) */
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { tools } from "../ui/tools";
import { shortcutsTab } from "./shortcuts-tab";
import * as autosave from "../project/autosave";
import {
  getOcrNormalizeMode,
  setOcrNormalizeMode,
} from "../pipeline/text-norm";
import { openChangelogModal } from "../ui/changelog-modal";
import { checkUpdatesNow } from "../ui/auto-update";
import { fontMarketModal } from "../font-market/modal";
import { createIcons } from "../ui/icons";
import * as storage from "../storage";

export const generalTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

    const section = document.createElement("div");
    section.className = "settings-section";

    const row = document.createElement("div");
    row.className = "field-row items-center justify-between mb-3";

    const label = document.createElement("span");
    label.className = "text-[0.78rem] text-text-primary";
    label.dataset.i18n = "settings.language";
    label.textContent = i18n.t("settings.language");

    const sel = document.createElement("select");
    sel.id = "settings-lang";
    sel.className = "field-select";
    const en = document.createElement("option");
    en.value = "en";
    en.textContent = "English";
    const id = document.createElement("option");
    id.value = "id";
    id.textContent = "Bahasa Indonesia";
    const es = document.createElement("option");
    es.value = "es";
    es.textContent = "Español";
    sel.appendChild(en);
    sel.appendChild(id);
    sel.appendChild(es);

    row.appendChild(label);
    row.appendChild(sel);
    section.appendChild(row);

    const hint = document.createElement("p");
    hint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    hint.dataset.i18n = "settings.langHint";
    hint.textContent = i18n.t("settings.langHint");
    section.appendChild(hint);

    pane.appendChild(section);

    // ── Auto-save ──
    const autoSection = document.createElement("div");
    autoSection.className = "settings-section";

    const autoRow = document.createElement("div");
    autoRow.className = "field-row items-center justify-between mb-3";

    const autoLabel = document.createElement("span");
    autoLabel.className = "text-[0.78rem] text-text-primary";
    autoLabel.dataset.i18n = "settings.autoSave";
    autoLabel.textContent = i18n.t("settings.autoSave");

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.id = "settings-autosave";
    const track = document.createElement("span");
    track.className = "track";
    toggle.appendChild(toggleInput);
    toggle.appendChild(track);

    autoRow.appendChild(autoLabel);
    autoRow.appendChild(toggle);
    autoSection.appendChild(autoRow);

    const intervalRow = document.createElement("div");
    intervalRow.className = "field-row items-center justify-between mb-3";

    const intervalLabel = document.createElement("span");
    intervalLabel.className = "text-[0.78rem] text-text-primary";
    intervalLabel.dataset.i18n = "settings.autoSaveInterval";
    intervalLabel.textContent = i18n.t("settings.autoSaveInterval");

    const intervalWrap = document.createElement("div");
    intervalWrap.className = "flex items-center gap-1.5";
    const intervalInput = document.createElement("input");
    intervalInput.type = "number";
    intervalInput.id = "settings-autosave-interval";
    intervalInput.min = "5";
    intervalInput.max = "3600";
    intervalInput.step = "5";
    intervalInput.className = "field-select";
    intervalInput.style.width = "76px";
    const sec = document.createElement("span");
    sec.className = "text-[0.68rem] text-text-muted";
    sec.dataset.i18n = "settings.seconds";
    sec.textContent = i18n.t("settings.seconds");
    intervalWrap.appendChild(intervalInput);
    intervalWrap.appendChild(sec);

    intervalRow.appendChild(intervalLabel);
    intervalRow.appendChild(intervalWrap);
    autoSection.appendChild(intervalRow);

    const autoHint = document.createElement("p");
    autoHint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    autoHint.dataset.i18n = "settings.autoSaveHint";
    autoHint.textContent = i18n.t("settings.autoSaveHint");
    autoSection.appendChild(autoHint);

    pane.appendChild(autoSection);

    // ── OCR text normalization ──
    const ocrSection = document.createElement("div");
    ocrSection.className = "settings-section";

    const ocrRow = document.createElement("div");
    ocrRow.className = "field-row items-center justify-between mb-3";

    const ocrLabel = document.createElement("span");
    ocrLabel.className = "text-[0.78rem] text-text-primary";
    ocrLabel.dataset.i18n = "settings.ocrNormalize";
    ocrLabel.textContent = i18n.t("settings.ocrNormalize");

    const ocrSel = document.createElement("select");
    ocrSel.id = "settings-ocr-normalize";
    ocrSel.className = "field-select";
    const modes: [string, string][] = [
      ["none", i18n.t("settings.ocrNormNone")],
      ["lowercase", i18n.t("settings.ocrNormLower")],
      ["uppercase", i18n.t("settings.ocrNormUpper")],
    ];
    modes.forEach(function ([val, txt]) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = txt;
      ocrSel.appendChild(opt);
    });

    ocrRow.appendChild(ocrLabel);
    ocrRow.appendChild(ocrSel);
    ocrSection.appendChild(ocrRow);

    const ocrHint = document.createElement("p");
    ocrHint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    ocrHint.dataset.i18n = "settings.ocrNormHint";
    ocrHint.textContent = i18n.t("settings.ocrNormHint");
    ocrSection.appendChild(ocrHint);

    pane.appendChild(ocrSection);

    ocrSel.value = getOcrNormalizeMode();
    ocrSel.addEventListener("change", function () {
      setOcrNormalizeMode(this.value as "none" | "lowercase" | "uppercase");
    });

    // Hydrate from persisted config
    const cfg = autosave.load();
    toggleInput.checked = cfg.enabled;
    intervalInput.value = String(cfg.intervalSec);
    intervalInput.disabled = !cfg.enabled;

    function commit(): void {
      const secs = parseInt(intervalInput.value, 10);
      const interval = Number.isFinite(secs) && secs > 0 ? secs : 60;
      intervalInput.value = String(interval);
      autosave.apply({ enabled: toggleInput.checked, intervalSec: interval });
    }
    toggleInput.addEventListener("change", function () {
      intervalInput.disabled = !this.checked;
      commit();
    });
    intervalInput.addEventListener("change", commit);

    sel.value = i18n.lang();
    sel.addEventListener("change", function () {
      i18n.setLang(this.value);
      sidebar.render();
      canvas.renderPageStrip();
      if (canvas && canvas._updateStatus) canvas._updateStatus();
      tools.refreshTitles();
      shortcutsTab.refreshTitles();
      shortcutsTab.refresh();
    });

    // ── Font Market & Recommendations ──
    const fontMarketSection = document.createElement("div");
    fontMarketSection.className = "settings-section";

    const fontMarketRow = document.createElement("div");
    fontMarketRow.className = "field-row items-center justify-between mb-1.5";

    const fontMarketLabel = document.createElement("span");
    fontMarketLabel.className = "text-[0.78rem] text-text-primary";
    fontMarketLabel.dataset.i18n = "fontMarket.title";
    fontMarketLabel.textContent = i18n.t("fontMarket.title");

    const fontMarketBtn = document.createElement("button");
    fontMarketBtn.type = "button";
    fontMarketBtn.className = "btn flex items-center gap-1.5";
    fontMarketBtn.innerHTML =
      '<i data-lucide="store" class="w-3.5 h-3.5 text-lumina"></i> <span data-i18n="fontMarket.openMarket">' +
      (i18n.t("fontMarket.openMarket") || "Open Font Market") +
      "</span>";
    fontMarketBtn.addEventListener("click", () => {
      fontMarketModal.open();
    });

    fontMarketRow.appendChild(fontMarketLabel);
    fontMarketRow.appendChild(fontMarketBtn);
    fontMarketSection.appendChild(fontMarketRow);

    const fontMarketHint = document.createElement("p");
    fontMarketHint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    fontMarketHint.dataset.i18n = "fontMarket.settingsHint";
    fontMarketHint.textContent = i18n.t("fontMarket.settingsHint");
    fontMarketSection.appendChild(fontMarketHint);

    pane.appendChild(fontMarketSection);
    createIcons({ root: fontMarketBtn });

    // ── Update Channel ──
    const updateSection = document.createElement("div");
    updateSection.className = "settings-section";

    const updateRow = document.createElement("div");
    updateRow.className = "field-row items-center justify-between mb-3";

    const updateLabelWrap = document.createElement("div");
    updateLabelWrap.className = "flex items-center gap-1.5";

    const updateLabel = document.createElement("span");
    updateLabel.className = "text-[0.78rem] text-text-primary";
    updateLabel.dataset.i18n = "settings.updateChannel";
    updateLabel.textContent = i18n.t("settings.updateChannel");

    const updateDevBadge = document.createElement("span");
    updateDevBadge.className =
      "text-[0.62rem] text-text-dim px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hidden";
    updateDevBadge.textContent = "Dev";

    updateLabelWrap.appendChild(updateLabel);
    updateLabelWrap.appendChild(updateDevBadge);

    const updateSel = document.createElement("select");
    updateSel.id = "settings-update-channel";
    updateSel.className = "field-select";
    const optStable = document.createElement("option");
    optStable.value = "stable";
    optStable.dataset.i18n = "settings.updateChannelStable";
    optStable.textContent = i18n.t("settings.updateChannelStable");
    const optNightly = document.createElement("option");
    optNightly.value = "nightly";
    optNightly.dataset.i18n = "settings.updateChannelNightly";
    optNightly.textContent = i18n.t("settings.updateChannelNightly");
    updateSel.appendChild(optStable);
    updateSel.appendChild(optNightly);

    updateRow.appendChild(updateLabelWrap);
    updateRow.appendChild(updateSel);
    updateSection.appendChild(updateRow);

    const updateHint = document.createElement("p");
    updateHint.className = "text-[0.68rem] text-text-muted leading-relaxed";
    updateHint.dataset.i18n = "settings.updateChannelHint";
    updateHint.textContent = i18n.t("settings.updateChannelHint");
    updateSection.appendChild(updateHint);
    pane.appendChild(updateSection);

    const savedChannel = storage.getItem("lumina-update-channel");
    updateSel.value = savedChannel === "nightly" ? "nightly" : "stable";

    void window.lumina.getAppInfo().then((info) => {
      if (!savedChannel && info.version.includes("-nightly.")) {
        updateSel.value = "nightly";
      }
      if (!info.isPackaged) {
        updateSel.disabled = true;
        updateSel.title = i18n.t("settings.updateChannelDevHint");
        updateDevBadge.classList.remove("hidden");
      }
    });

    updateSel.addEventListener("change", function () {
      storage.setItem("lumina-update-channel", this.value);
      checkUpdatesNow();
    });

    // ── What's New & Developer Notes ──
    const changelogSection = document.createElement("div");
    changelogSection.className = "settings-section";

    const changelogRow = document.createElement("div");
    changelogRow.className = "field-row items-center justify-between";

    const changelogLabel = document.createElement("span");
    changelogLabel.className = "text-[0.78rem] text-text-primary";
    changelogLabel.dataset.i18n = "settings.whatsNew";
    changelogLabel.textContent = i18n.t("settings.whatsNew");

    const changelogBtn = document.createElement("button");
    changelogBtn.type = "button";
    changelogBtn.className = "btn";
    changelogBtn.dataset.i18n = "settings.viewChangelog";
    changelogBtn.textContent = i18n.t("settings.viewChangelog");
    changelogBtn.addEventListener("click", () => {
      openChangelogModal();
    });

    changelogRow.appendChild(changelogLabel);
    changelogRow.appendChild(changelogBtn);
    changelogSection.appendChild(changelogRow);
    pane.appendChild(changelogSection);
  },

  refresh(): void {},
};
