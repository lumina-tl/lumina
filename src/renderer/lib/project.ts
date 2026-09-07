/* ── Lumina project save (.lmi) — renderer side ──
 * Serializes the whole session (pages + layers + masks + translate
 * settings) into a ProjectSavePayload and hands it to main, which writes
 * the zip (copying source images + patch PNGs straight from disk).
 * Open is orchestrated in renderer.ts (it rebuilds the UI); this module
 * owns the payload + save/saveAs + dirty tracking.
 */
import { state } from "./state";
import * as i18n from "./i18n";
import { ui } from "./ui";
import { history, hydrateMaskImages } from "./history";
import { hydrateCleanupCanvas } from "./canvas/paintool/shared";
import { canvas } from "./canvas/index";
import * as pageImages from "./pageImages";
import { sidebar } from "./sidebar";
import { models } from "./models";
import { translateSettings } from "./pipeline/translate";
import * as landing from "./landing";
import type { TranslateConfig } from "./pipeline/translate";
import {
  getSavePath,
  setSavePath,
  clearDirty,
  isDirty,
  markDirty,
} from "./dirty";
import type { Page, ProjectSavePayload, ProjectSettingsData } from "../types";

function _basename(p: string): string {
  return p.split(/[\\/]/).pop() as string;
}

/** Convert an absolute path into a loadable file:// URL */
function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

/** Load image dimensions WITHOUT keeping the decoded bitmap (metadata probe). */
function _probeImage(
  filePath: string,
): Promise<{ w: number; h: number } | null> {
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = ""; // release the bitmap
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = _fileUrl(filePath);
  });
}

function buildPayload(savePath: string | null): ProjectSavePayload {
  const cfg = translateSettings.load();
  const settings: ProjectSettingsData = {
    provider: cfg.provider,
    targetLang: cfg.targetLang,
    llmBaseUrl: cfg.llmBaseUrl,
    llmModel: cfg.llmModel,
    llmStyle: cfg.llmStyle,
    llmInstruction: cfg.llmInstruction,
    openrouterModel: cfg.openrouterModel,
    grokModel: cfg.grokModel,
    geminiModel: cfg.geminiModel,
  };
  return {
    savePath,
    project: {
      activePageIdx: state.activePageIdx,
      settings,
      pages: state.pages.map((p) => ({
        fileName: p.fileName,
        filePath: p.filePath,
        naturalWidth: p.naturalWidth,
        naturalHeight: p.naturalHeight,
        textDetections: p.textDetections,
        layers: p.layers,
        inpaintMasks: p.inpaintMasks.map((m) => ({
          id: m.id,
          bbox: m.bbox,
          imagePath: m.imagePath,
          visible: m.visible,
          opacity: m.opacity,
        })),
        cleanupMask: p.cleanupMask
          ? {
              id: p.cleanupMask.id,
              visible: p.cleanupMask.visible,
              opacity: p.cleanupMask.opacity,
              imagePath: p.cleanupMask.imagePath,
            }
          : null,
        backgroundVisible: p.backgroundVisible,
        _zoomLevel: p._zoomLevel,
        _panX: p._panX,
        _panY: p._panY,
      })),
    },
  };
}

/** Photoshop-style unsaved-changes guard.
 * Prompts Save / Don't Save / Cancel when dirty; returns true when the
 * caller may proceed. Works even when the project was never saved (Save
 * then shows the Save As dialog). */
export async function guardUnsavedChanges(detail?: string): Promise<boolean> {
  if (!isDirty()) return true;
  const choice = await window.lumina.confirmDiscard(
    detail ?? i18n.t("project.discardDetail"),
  );
  if (choice === "cancel") return false;
  if (choice === "save") return await project.save();
  return true;
}

/** App close requested by main — confirm, then allow/deny the close. */
export async function handleCloseRequest(): Promise<void> {
  window.lumina.confirmClose(await guardUnsavedChanges());
}

export const project = {
  buildPayload,

  /** Save to the current target; shows the dialog on first save.
   *  `silent` (auto-save) suppresses toasts. */
  async save(opts?: { silent?: boolean }): Promise<boolean> {
    if (state.pages.length === 0) {
      if (!opts?.silent) ui.toast(i18n.t("project.nothingToSave"), "warn");
      return false;
    }
    try {
      const res = await window.lumina.saveProject(buildPayload(getSavePath()));
      if (res.canceled || !res.path) return false;
      setSavePath(res.path);
      clearDirty();
      if (!opts?.silent) {
        ui.toast(
          i18n.t("project.saved") + ": " + _basename(res.path),
          "success",
          3000,
        );
      }
      return true;
    } catch (e) {
      console.error("[Lumina] Save failed:", e);
      if (!opts?.silent) ui.toast(i18n.t("project.saveError"), "error", 4000);
      return false;
    }
  },

  /** Force the Save dialog regardless of the current target */
  async saveAs(): Promise<boolean> {
    const prev = getSavePath();
    setSavePath(null);
    const ok = await this.save();
    if (!ok) setSavePath(prev);
    return ok;
  },

  /** Rebuild the UI after pages/savePath changed (open/import) */
  _rebuildUI(): void {
    landing.hide();
    models.setHasImage(true);
    canvas._clearGroups();
    canvas.render();
    canvas.renderPageStrip();
    ui.updatePageIndicator();
    sidebar.render();
    history.reset();
  },

  /** Open a .lmi project — replaces the whole session.
   *  With `path`, opens that file directly (file association /
   *  second-instance launch); without it, shows the native Open dialog. */
  async open(path?: string): Promise<void> {
    if (state.pages.length > 0 && !(await guardUnsavedChanges())) return;

    let result;
    try {
      result = await window.lumina.openProject(path);
    } catch (e) {
      console.error("[Lumina] Open failed:", e);
      ui.toast(i18n.t("project.openError"), "error", 4000);
      return;
    }
    if (!result) return;

    // Replace the session — drop old pages' history stacks first
    for (const old of state.pages) history.forgetPage(old);

    const pages: Page[] = [];
    for (let pi = 0; pi < result.pages.length; pi++) {
      const pd = result.pages[pi];
      // Only the active page gets a decoded bitmap now; the rest register
      // with dimensions probed from disk and decode lazily on activation.
      const isActive =
        result.activePageIdx !== null && pi === result.activePageIdx;
      const dims = isActive
        ? null
        : await _probeImage(pd.filePath).catch(() => null);
      const page: Page = {
        filePath: pd.filePath,
        fileName: pd.fileName,
        image: null,
        naturalWidth: isActive ? pd.naturalWidth : (dims?.w ?? pd.naturalWidth),
        naturalHeight: isActive
          ? pd.naturalHeight
          : (dims?.h ?? pd.naturalHeight),
        textDetections: pd.textDetections as Page["textDetections"],
        layers: pd.layers as Page["layers"],
        inpaintMasks: pd.inpaintMasks.map((m) => ({ ...m })),
        cleanupMask: pd.cleanupMask ? { ...pd.cleanupMask } : null,
        backgroundVisible: pd.backgroundVisible,
        _selectedTextIdx: null,
        _selectedLayerId: null,
        _selectedMaskId: null,
        _zoomLevel: pd._zoomLevel,
        _panX: pd._panX,
        _panY: pd._panY,
      };
      if (isActive) {
        await pageImages.ensurePageImage(page);
        if (!page.image) continue;
      }
      pages.push(page);
    }
    state.pages = pages;
    // Masks are stored as PNG paths — decode them now so the first render
    // shows the cleaned patches instead of raw text over the original image.
    pages.forEach((p) => hydrateMaskImages(p));
    pages.forEach((p) => hydrateCleanupCanvas(p));
    // Fill every strip thumbnail cheaply (decode at thumb size only — the
    // full-res bitmap is never materialized for a preview). Progressive;
    // re-render the strip once they're ready.
    void pageImages.preloadThumbnails(pages).then(function () {
      canvas.renderPageStrip();
    });
    state.activePageIdx =
      result.activePageIdx !== null && result.activePageIdx < pages.length
        ? result.activePageIdx
        : pages.length > 0
          ? 0
          : null;

    if (result.settings) {
      translateSettings.save(result.settings as unknown as TranslateConfig);
    }

    setSavePath(result.projectPath);
    clearDirty();

    if (pages.length === 0) {
      // Empty project — go back to the landing screen
      landing.show();
      state.activePageIdx = null;
      sidebar.render();
      ui.updatePageIndicator();
      return;
    }

    this._rebuildUI();
    ui.toast(
      i18n.t("project.opened") + ": " + _basename(result.projectPath),
      "success",
      3000,
    );
  },

  /** Call after importing images — marks the session as changed */
  markImportedDirty(): void {
    markDirty();
  },
};
