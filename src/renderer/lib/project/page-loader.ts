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
import type { Page } from "../../types";

/** Convert a raw Windows/POSIX file path into a valid file:// URL */
function _toFileUrl(p: string): string {
  if (/^file:\/\//i.test(p)) return p;
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm; // drive letter → /D:/...
  // encodeURI handles spaces & non-ASCII but keeps # and ? — escape those
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function _loadImageAsPage(filePath: string): Promise<Page | null> {
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      const page: Page = {
        filePath: filePath,
        fileName: filePath.split(/[/\\]/).pop() as string,
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

/** Import path: eager-decodes only the FIRST image, rest are lazy. */
export async function openImagePaths(filePaths: string[]): Promise<void> {
  for (let i = 0; i < filePaths.length; i++) {
    const fp = filePaths[i];
    if (i === 0) {
      const page = await _loadImageAsPage(fp);
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
        _selectedMaskId: null,
      });
    }
  }

  // Set active to first if none selected
  if (L.state.activePageIdx === null && L.state.pages.length > 0) {
    L.state.setActivePage(0);
    // Eager-decode the active page now (it must render immediately).
    await pageImages.ensurePageImage(L.state.pages[0]);
  }

  // Fill strip thumbnails cheaply (decode at thumb size, never full-res).
  void pageImages.preloadThumbnails(L.state.pages).then(function () {
    canvas.renderPageStrip();
  });

  landing.hide();
  models.setHasImage(true);

  canvas._clearGroups();
  canvas.render();
  canvas.renderPageStrip();
  ui.updatePageIndicator();
  sidebar.render();
  history.reset();
  project.markImportedDirty();
}
