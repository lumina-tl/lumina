/** Lumina Page Loader */
import * as L from "../state";
import * as pageImages from "./page-images";
import { canvas } from "../canvas/index";
import { ui } from "../ui";
import { sidebar } from "../sidebar";
import { history } from "../history";
import { project } from ".";
import * as landing from "../ui/landing";
import { models } from "../models";
import { log } from "../logger";
import * as i18n from "../i18n";
import type { Page } from "../../types";

/** Convert a raw Windows/POSIX file path into a valid file:// URL */
function _toFileUrl(p: string): string {
  if (/^file:\/\//i.test(p)) return p;
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm; // drive letter → /D:/...
  // encodeURI handles spaces & non-ASCII but keeps # and ? — escape those
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function _loadImageAsPage(
  filePath: string,
  sourceFolderName?: string,
): Promise<Page | null> {
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      const page: Page = {
        filePath: filePath,
        fileName: filePath.split(/[/\\]/).pop() as string,
        sourceFolderName,
        image: img,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        textDetections: [],
        layers: [],
        inpaintMasks: [],
        cleanupMask: null,
        backgroundVisible: true,
        _selectedTextIdx: null,
        _selectedLayerId: null,
        _expandedLayerId: null,
        _selectedMaskId: null,
      };
      resolve(page);
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = _toFileUrl(filePath);
  });
}

// ── Import: single or multi ──
export async function importImages(): Promise<void> {
  // Try multi-file import first
  let filePaths: string[] | null;
  try {
    filePaths = await window.lumina.importImages();
  } catch (e) {
    // Fallback: single file
    const single = await window.lumina.importImage();
    if (!single) return;
    filePaths = [single];
  }

  if (!filePaths || filePaths.length === 0) return;
  await openImagePaths(filePaths);
}

/** Import every supported image under a selected folder. */
export async function importImageFolder(): Promise<void> {
  try {
    const imported = await window.lumina.importImageFolder();
    if (!imported) return;
    if (imported.filePaths.length === 0) {
      ui.toast(i18n.t("toast.importFolderEmpty"), "warn", 4000);
      return;
    }
    await openImagePaths(imported.filePaths, imported.folderName);
  } catch (err) {
    log.error("fe", `Folder import failed: ${err}`);
    ui.toast(
      err instanceof Error ? err.message : i18n.t("toast.importFailed"),
      "error",
    );
  }
}

/** Import path: eager-decodes only the FIRST image, rest are lazy. */
export async function openImagePaths(
  filePaths: string[],
  sourceFolderName?: string,
): Promise<void> {
  const firstImportedIdx = L.state.pages.length;
  for (let i = 0; i < filePaths.length; i++) {
    const fp = filePaths[i];
    if (i === 0) {
      const page = await _loadImageAsPage(fp, sourceFolderName);
      if (page) L.state.addPage(page);
    } else {
      // Non-active pages: register immediately, decode lazily on first
      // activation (pageImages.ensurePageImage). naturalWidth/Height come
      // from the decoded bitmap — fill them from the next decoded page's
      // metadata is not possible here, so probe via an Image without keeping
      // the bitmap.
      L.state.addPage({
        filePath: fp,
        fileName: fp.split(/[/\\]/).pop() as string,
        sourceFolderName,
        image: null,
        naturalWidth: 0,
        naturalHeight: 0,
        textDetections: [],
        layers: [],
        inpaintMasks: [],
        cleanupMask: null,
        backgroundVisible: true,
        _selectedTextIdx: null,
        _selectedLayerId: null,
        _expandedLayerId: null,
        _selectedMaskId: null,
      });
    }
  }

  // Activate the first newly imported image, not the previously active page.
  if (L.state.pages.length > firstImportedIdx) {
    L.state.showDetBoxes = true;
    models.setHasImage(true);
    await canvas.switchPage(firstImportedIdx);
  }

  // Fill strip thumbnails cheaply (decode at thumb size, never full-res).
  void pageImages.preloadThumbnails(L.state.pages).then(function () {
    canvas.renderPageStrip();
  });

  landing.hide();
  models.setHasImage(true);

  canvas.renderPageStrip();
  ui.updatePageIndicator();
  sidebar.render();
  history.reset();
  project.markImportedDirty();
}
