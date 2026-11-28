/** Project save (.lmi) — serialize session and hand off to main process. */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history, hydrateMaskImages, hydrateLayerImages } from "../history";
import { hydrateCleanupCanvas } from "../canvas/tools/paint/shared";
import { pendingCommit } from "../canvas/tools/paint/commit";
import { canvas } from "../canvas/index";
import * as pageImages from "./page-images";
import { sidebar } from "../sidebar";
import { models } from "../models";
import { translateSettings } from "../pipeline/translate";
import * as landing from "../ui/landing";
import type { TranslateConfig } from "../pipeline/translate";
import { log } from "../logger";
import { ensureMaskImages } from "../export/render";
import {
  getSavePath,
  setSavePath,
  clearDirty,
  isDirty,
  markDirty,
} from "./dirty";
import type {
  Page,
  ProjectSavePayload,
  ProjectSettingsData,
} from "../../types";

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

const THUMB_MAX_W = 360;

async function captureViewportThumbnail(): Promise<Uint8Array | undefined> {
  const stage = canvas.getStage();
  const mainLayer = canvas.getLayer();
  if (!stage || !mainLayer) return undefined;
  const sw = stage.width();
  const sh = stage.height();
  if (sw <= 0 || sh <= 0) return undefined;

  const hiddenLayers: Array<{ show: () => void }> = [];
  for (const l of stage.getLayers()) {
    if (l !== mainLayer && l.visible()) {
      l.visible(false);
      hiddenLayers.push({ show: () => l.visible(true) });
    }
  }
  const hiddenTransformers: Array<{ show: () => void }> = [];
  for (const child of mainLayer.getChildren()) {
    if (child.getClassName() === "Transformer" && child.visible()) {
      child.visible(false);
      hiddenTransformers.push({ show: () => child.visible(true) });
    }
  }

  let snap: HTMLCanvasElement;
  try {
    snap = stage.toCanvas();
  } finally {
    hiddenTransformers.forEach((h) => h.show());
    hiddenLayers.forEach((h) => h.show());
  }

  const scale = Math.min(1, THUMB_MAX_W / Math.max(1, snap.width));
  const dw = Math.max(1, Math.round(snap.width * scale));
  const dh = Math.max(1, Math.round(snap.height * scale));
  const out = document.createElement("canvas");
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "#16161e";
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(snap, 0, 0, dw, dh);

  const blob: Blob | null = await new Promise((res) =>
    out.toBlob(res, "image/jpeg", 0.82),
  );
  if (!blob) return undefined;
  return new Uint8Array(await blob.arrayBuffer());
}

function buildPayload(
  savePath: string | null,
  thumbnail?: Uint8Array,
): ProjectSavePayload {
  const cfg = translateSettings.load();
  const settings: ProjectSettingsData = {
    provider: cfg.provider,
    targetLang: cfg.targetLang,
    llmBaseUrl: cfg.llmBaseUrl,
    llmModel: cfg.llmModel,
    llmInstruction: cfg.llmInstruction,
    openrouterModel: cfg.openrouterModel,
    grokModel: cfg.grokModel,
    geminiModel: cfg.geminiModel,
  };
  return {
    savePath,
    thumbnail,
    project: {
      activePageIdx: state.activePageIdx,
      settings,
      pages: state.pages.map((p) => ({
        fileName: p.fileName,
        filePath: p.filePath,
        sourceFolderName: p.sourceFolderName,
        naturalWidth: p.naturalWidth,
        naturalHeight: p.naturalHeight,
        textDetections: p.textDetections,
        layers: p.layers.map((l) => {
          if (l.type === "image" && "imageCanvas" in l) {
            const copy = { ...l };
            delete copy.imageCanvas;
            return copy;
          }
          return l;
        }),
        inpaintMasks: p.inpaintMasks.map((m) => ({
          id: m.id,
          bbox: m.bbox,
          imagePath: m.imagePath,
          visible: m.visible,
          opacity: m.opacity,
        })),
        _pipelineDetectionDone: p._pipelineDetectionDone,
        _pipelineOcrDone: p._pipelineOcrDone,
        _pipelineTranslationDone: p._pipelineTranslationDone,
        _pipelineInpaintDone: p._pipelineInpaintDone,
        _cleanOnlyProcessed: p._cleanOnlyProcessed,
        _cleanOnlyDetectionDone: p._cleanOnlyDetectionDone,
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
  const choice = await ui.confirmDiscard({
    detail: detail ?? i18n.t("project.discardDetail"),
  });
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
      await pendingCommit.current;
      let savePath = getSavePath();

      // No path yet — show Save As dialog
      if (!savePath) {
        const dlg = await window.lumina.showSaveDialog();
        if (dlg.canceled || !dlg.filePath) return false;
        savePath = dlg.filePath;
        setSavePath(savePath);
      }

      // PSD path → build multi-page PSD and write
      if (savePath.toLowerCase().endsWith(".psd")) {
        const { buildPsdDocument } = await import("../export/psd/build");
        const { serializePsd } = await import("../export/psd/write");
        // Preload all images
        for (const p of state.pages) {
          await ensureMaskImages(p);
          await pageImages.ensurePageImage(p);
        }
        const total = state.pages.length;
        const toast = ui.toast(
          `${i18n.t("export.running")} (0/${total})`,
          "running",
          0,
        );
        const psd = await buildPsdDocument(state.pages, (cur) => {
          ui.updateToast(
            toast,
            `${i18n.t("export.running")} (${cur}/${total})`,
          );
        });
        ui.dismissToast(toast);
        const saving = ui.toast("Saving PSD...", "running", 0);
        const data = serializePsd(psd);
        await window.lumina.writePsdFile({ filePath: savePath, data });
        ui.dismissToast(saving);
        clearDirty();
        if (!opts?.silent) {
          ui.toast(
            i18n.t("project.saved") + ": " + _basename(savePath),
            "success",
            3000,
          );
        }
        return true;
      }

      // LMI path → existing flow
      if (!savePath.toLowerCase().endsWith(".lmi")) savePath += ".lmi";
      setSavePath(savePath);
      const thumbnail = await captureViewportThumbnail();
      const res = await window.lumina.saveProject(
        buildPayload(savePath, thumbnail),
      );
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
      log.error("fe", `Save failed: ${e}`);
      if (!opts?.silent) ui.toast(i18n.t("project.saveError"), "error", 4000);
      return false;
    }
  },

  /** Force the Save dialog regardless of the current target */
  async saveAs(): Promise<boolean> {
    const prev = getSavePath();
    if (state.pages.length === 0) {
      ui.toast(i18n.t("project.nothingToSave"), "warn");
      return false;
    }
    try {
      await pendingCommit.current;
      const dlg = await window.lumina.showSaveDialog({
        defaultPath: prev || "project.lmi",
      });
      if (dlg.canceled || !dlg.filePath) return false;
      const savePath = dlg.filePath;

      // PSD path → build multi-page PSD and write
      if (savePath.toLowerCase().endsWith(".psd")) {
        const { buildPsdDocument } = await import("../export/psd/build");
        const { serializePsd } = await import("../export/psd/write");
        for (const p of state.pages) {
          await ensureMaskImages(p);
          await pageImages.ensurePageImage(p);
        }
        const total = state.pages.length;
        const toast = ui.toast(
          `${i18n.t("export.running")} (0/${total})`,
          "running",
          0,
        );
        const psd = await buildPsdDocument(state.pages, (cur) => {
          ui.updateToast(
            toast,
            `${i18n.t("export.running")} (${cur}/${total})`,
          );
        });
        ui.dismissToast(toast);
        const saving = ui.toast("Saving PSD...", "running", 0);
        const data = serializePsd(psd);
        await window.lumina.writePsdFile({ filePath: savePath, data });
        ui.dismissToast(saving);
        clearDirty();
        ui.toast(
          i18n.t("project.saved") + ": " + _basename(savePath),
          "success",
          3000,
        );
        return true;
      }

      // LMI path
      let lmiPath = savePath;
      if (!lmiPath.toLowerCase().endsWith(".lmi")) lmiPath += ".lmi";
      setSavePath(lmiPath);
      const thumbnail = await captureViewportThumbnail();
      const res = await window.lumina.saveProject(
        buildPayload(lmiPath, thumbnail),
      );
      if (res.canceled || !res.path) {
        if (prev) setSavePath(prev);
        return false;
      }
      setSavePath(res.path);
      clearDirty();
      ui.toast(
        i18n.t("project.saved") + ": " + _basename(res.path),
        "success",
        3000,
      );
      return true;
    } catch (e) {
      log.error("fe", `SaveAs failed: ${e}`);
      ui.toast(i18n.t("project.saveError"), "error", 4000);
      return false;
    }
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
      log.error("fe", `Open failed: ${e}`);
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
      const detections = pd.textDetections as Page["textDetections"];
      const detectionDone =
        pd._pipelineDetectionDone ??
        Boolean(pd._cleanOnlyDetectionDone || detections.length > 0);
      const page: Page = {
        filePath: pd.filePath,
        fileName: pd.fileName,
        sourceFolderName: pd.sourceFolderName,
        image: null,
        naturalWidth: isActive ? pd.naturalWidth : (dims?.w ?? pd.naturalWidth),
        naturalHeight: isActive
          ? pd.naturalHeight
          : (dims?.h ?? pd.naturalHeight),
        textDetections: detections,
        layers: (pd.layers as Page["layers"]).map((l) => {
          if (
            l.type === "image" &&
            "imageCanvas" in l &&
            !(l.imageCanvas instanceof HTMLCanvasElement)
          ) {
            const copy = { ...l };
            delete copy.imageCanvas;
            return copy;
          }
          return l;
        }),
        inpaintMasks: pd.inpaintMasks.map((m) => ({ ...m })),
        _pipelineDetectionDone: detectionDone,
        _pipelineOcrDone:
          pd._pipelineOcrDone ??
          (detectionDone &&
            (detections.length === 0 ||
              detections.every((d) => Boolean(d.text?.trim())))),
        _pipelineTranslationDone:
          pd._pipelineTranslationDone ??
          (detectionDone &&
            (detections.length === 0 ||
              detections.every(
                (d) => Boolean(d.text?.trim()) && Boolean(d.translated?.trim()),
              ))),
        _pipelineInpaintDone:
          pd._pipelineInpaintDone ??
          Boolean(pd._cleanOnlyProcessed || pd.inpaintMasks.length > 0),
        _cleanOnlyProcessed: pd._cleanOnlyProcessed,
        _cleanOnlyDetectionDone:
          pd._cleanOnlyDetectionDone || pd.textDetections.length > 0,
        cleanupMask: pd.cleanupMask ? { ...pd.cleanupMask } : null,
        backgroundVisible: pd.backgroundVisible,
        _selectedTextIdx: null,
        _selectedLayerId: null,
        _expandedLayerId: null,
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
    // Set active page BEFORE hydrating masks so getActivePage() works
    state.activePageIdx =
      result.activePageIdx !== null && result.activePageIdx < pages.length
        ? result.activePageIdx
        : pages.length > 0
          ? 0
          : null;
    // Masks are stored as PNG paths — decode them now so the first render
    // shows the cleaned patches instead of raw text over the original image.
    pages.forEach((p) => hydrateMaskImages(p));
    pages.forEach((p) => hydrateLayerImages(p));
    pages.forEach((p) => hydrateCleanupCanvas(p));
    // Fill every strip thumbnail cheaply (decode at thumb size only — the
    // full-res bitmap is never materialized for a preview). Progressive;
    // re-render the strip once they're ready.
    void pageImages.preloadThumbnails(pages).then(function () {
      canvas.renderPageStrip();
    });

    if (result.settings) {
      const current = translateSettings.load();
      translateSettings.save({
        ...current,
        targetLang: result.settings.targetLang || current.targetLang,
        llmInstruction:
          result.settings.llmInstruction || current.llmInstruction,
      });
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
