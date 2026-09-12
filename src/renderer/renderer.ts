/* ── Lumina Renderer Entry Point ── */
import * as L from "./lib/state";
import * as i18n from "./lib/i18n";
import { ui } from "./lib/ui";
import { history } from "./lib/history";
import { shortcuts } from "./lib/shortcuts";
import { tools } from "./lib/tools";
import { pipeline } from "./lib/pipeline";
import { settings } from "./lib/settings";
import { models } from "./lib/models";
import { canvas } from "./lib/canvas/index";
import { sidebar } from "./lib/sidebar";
import { setRendererImport } from "./lib/canvas/pages";
// Side-effect imports: attach real implementations onto the `canvas`
// object. Must come AFTER canvas/index so `canvas` is initialized
// (importing them from inside canvas/index would hit a TDZ error).
import "./lib/canvas/render";
import "./lib/canvas/groups";
import "./lib/canvas/selection";
import "./lib/canvas/mutations";
import "./lib/canvas/layers";
import "./lib/canvas/masks";
import { bindTextTool } from "./lib/canvas/textool";
import { bindSelectTool } from "./lib/canvas/selectool";
import { bindPaintTool } from "./lib/canvas/paintool";
import { initPaintOptions } from "./lib/paintOptions";
import { loadSystemFonts } from "./lib/fontLoader";
import { createIcons } from "./lib/icons";
import { project, handleCloseRequest } from "./lib/project";
import * as exportModule from "./lib/export";
import * as autosave from "./lib/autosave";
import * as landing from "./lib/landing";
import { importImages, openImagePaths } from "./lib/page-loader";
import { initAutoUpdate } from "./lib/auto-update";
import { updateDirtyUI, setDirtyListener } from "./lib/dirty";

// Expose for page strip "+" button
setRendererImport(importImages);

// ── Model check on startup (CHECK ONLY — downloads are manual) ──
function checkModels(): void {
  models.refreshDevice();
  models.check().then(function (list) {
    if (list.length && list.some((m) => !m.ready)) {
      ui.toast(i18n.t("models.warning"), "warn", 6000);
    }
  });
}

// ── Init modules ──
i18n.init().then(function () {
  // ── Landing welcome screen (recents + quick actions) ──
  landing.init({
    importImages: () => importImages(),
    openProject: (path?: string) => project.open(path),
    openImagePath: (path: string) => openImagePaths([path]),
  });

  // ── Wire buttons ──
  document
    .getElementById("btn-import")!
    .addEventListener("click", importImages);
  document.getElementById("btn-open")!.addEventListener("click", function () {
    project.open();
  });
  document.getElementById("btn-save")!.addEventListener("click", function () {
    project.save();
  });
  document
    .getElementById("btn-save-as")!
    .addEventListener("click", function () {
      project.saveAs();
    });
  document.getElementById("btn-export")!.addEventListener("click", function () {
    exportModule.open();
  });
  document
    .getElementById("btn-export-all")!
    .addEventListener("click", function () {
      exportModule.openAll();
    });

  // ── Auto-update: show an update button when a newer published version
  //    exists. Click → download (progress reuses the model-download bar),
  //    click again once downloaded → install & relaunch.
  initAutoUpdate();

  document.getElementById("btn-detect")!.addEventListener("click", function () {
    pipeline.runDetection();
  });

  document.getElementById("btn-ocr")!.addEventListener("click", function () {
    pipeline.runOcr();
  });

  document
    .getElementById("btn-translate")!
    .addEventListener("click", function () {
      pipeline.runTranslate();
    });

  document
    .getElementById("btn-inpaint")!
    .addEventListener("click", function () {
      pipeline.runInpaint();
    });

  document
    .getElementById("btn-toggle-boxes")!
    .addEventListener("click", function () {
      L.state.showDetBoxes = !L.state.showDetBoxes;
      canvas.updateBoxToggle();
      canvas.render();
    });

  // ── Undo / Redo buttons ──
  document.getElementById("btn-undo")!.addEventListener("click", function () {
    history.undo();
  });
  document.getElementById("btn-redo")!.addEventListener("click", function () {
    history.redo();
  });

  // ── Settings modal ──
  shortcuts.init();
  shortcuts.bindGlobal();
  settings.init();
  autosave.start();
  // Photoshop-style unsaved-changes check before the window closes
  window.lumina.onRequestCloseCheck(function () {
    handleCloseRequest();
  });
  document
    .getElementById("btn-settings")!
    .addEventListener("click", function () {
      settings.open();
    });
  // Warning shortcut → open Settings on the Models tab
  document.getElementById("btn-models")!.addEventListener("click", function () {
    settings.open("models");
  });

  tools.init();
  ui.initResize();
  canvas.initBindings();
  bindTextTool();
  bindSelectTool();
  bindPaintTool();
  initPaintOptions();
  sidebar.render();

  setDirtyListener(updateDirtyUI);
  updateDirtyUI();

  createIcons();

  // ── Load system fonts via IPC + register as FontFaces ──
  // Rebuild the sidebar afterwards so the font dropdown gets populated
  // (it renders before fonts arrive on first paint).
  loadSystemFonts()
    .then(function () {
      sidebar.render();
    })
    .catch(function () {});

  // ── Model check on startup ──
  setTimeout(checkModels, 1500);
  // CUDA runtime state (missing/ready/error) — also gates model buttons.
  void models.refreshRuntime();

  // ── .lmi file association: open projects handed over by the OS ──
  // Second instance launched while the app is running → main pushes the path
  window.lumina.onOpenProjectRequest(function (p) {
    void project.open(p);
  });
  // First launch launched with a .lmi path → pull it once
  window.lumina
    .getPendingOpenPath()
    .then(function (p) {
      if (p) void project.open(p);
    })
    .catch(function () {});
});

// ── Language picker removed — interface language is set in Settings → General ──

document.addEventListener("click", function () {
  const dd = document.getElementById("lang-dropdown");
  if (dd) dd.classList.add("hidden");
});
