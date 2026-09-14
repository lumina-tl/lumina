/** Lumina Canvas — Page Strip Navigation */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { canvas } from "./index";
import { invalidateComposite } from "./render";
import * as pageImages from "../project/page-images";
import { hydrateCleanupCanvas } from "./tools/paint/shared";
import { hydrateMaskImages } from "../history";
import { sidebar } from "../sidebar";
import { history } from "../history";
import { createIcons } from "../ui/icons";
import * as landing from "../ui/landing";
import { isDirty, markDirty } from "../project/dirty";
import type { Page } from "../../types";

/* ── Drag-and-drop reorder state ── */
let _dragIdx: number | null = null;

function clearDropIndicators(): void {
  const items = document.getElementById("page-strip-items");
  if (!items) return;
  items
    .querySelectorAll(".page-thumb.drop-before, .page-thumb.drop-after")
    .forEach(function (el) {
      el.classList.remove("drop-before", "drop-after");
    });
}

/** Render page strip thumbnails */
canvas.renderPageStrip = function (): void {
  const strip = document.getElementById("page-strip");
  const items = document.getElementById("page-strip-items");
  if (!strip || !items) return;

  items.innerHTML = "";

  state.pages.forEach(function (page, i) {
    const thumb = document.createElement("div");
    thumb.className =
      "page-thumb" + (i === state.activePageIdx ? " active" : "");
    thumb.title = page.fileName;
    thumb.dataset.pageIdx = String(i);
    thumb.draggable = true;

    // Create thumbnail image — downscaled data URL, never the full-res file
    const img = document.createElement("img");
    img.src = pageImages.pageThumb(page) || "";
    img.alt = page.fileName;
    thumb.appendChild(img);

    // Page number label chip
    const num = document.createElement("div");
    num.className = "page-num";
    num.textContent = String(i + 1);
    thumb.appendChild(num);

    // Layers count badge (if any text/dialogue layers created)
    if (page.layers && page.layers.length > 0) {
      const badge = document.createElement("div");
      badge.className = "page-badge";
      badge.textContent = String(page.layers.length);
      badge.title = `${page.layers.length} layer(s)`;
      thumb.appendChild(badge);
    }

    // Delete button (sleek hover button)
    const del = document.createElement("div");
    del.className = "page-del-btn";
    del.innerHTML = '<i data-lucide="x" class="w-2.5 h-2.5"></i>';
    del.title = i18n.t("pages.remove");
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      canvas.removePage(i);
    });
    thumb.appendChild(del);

    // Drag and Drop reordering
    thumb.addEventListener("dragstart", function (e) {
      e.stopPropagation();
      _dragIdx = i;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        // Fallback for browsers that require data to allow drop
        e.dataTransfer.setData("text/plain", String(i));
      }
      requestAnimationFrame(function () {
        thumb.classList.add("dragging");
      });
    });

    thumb.addEventListener("dragend", function () {
      thumb.classList.remove("dragging");
      _dragIdx = null;
      clearDropIndicators();
    });

    thumb.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (_dragIdx === null || _dragIdx === i) return;
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      clearDropIndicators();
      // Determine whether cursor is in the left or right half of the thumb
      const rect = thumb.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const before = e.clientX < midX;
      thumb.classList.toggle("drop-before", before);
      thumb.classList.toggle("drop-after", !before);
    });

    thumb.addEventListener("dragleave", function () {
      thumb.classList.remove("drop-before", "drop-after");
    });

    thumb.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      clearDropIndicators();
      if (_dragIdx === null || _dragIdx === i) return;
      const fromIdx = _dragIdx;
      // Determine insertion index based on cursor position within target
      const rect = thumb.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertBefore = e.clientX < midX;
      let toIdx = insertBefore ? i : i + 1;
      // Adjust if dragging from before the insertion point
      if (fromIdx < toIdx) toIdx--;
      canvas.reorderPage(fromIdx, toIdx);
    });

    // Click to switch page
    thumb.addEventListener("click", function () {
      canvas.switchPage(i);
    });

    items.appendChild(thumb);
  });

  // Add "+" button at the end
  const addBtn = document.createElement("div");
  addBtn.className = "page-thumb-add";
  addBtn.title = i18n.t("pages.importMore");
  addBtn.innerHTML = `
    <i data-lucide="plus" class="w-4 h-4"></i>
    <span class="text-[8px] font-semibold opacity-70 tracking-wider">ADD</span>
  `;
  addBtn.addEventListener("click", function () {
    if (rendererRef && rendererRef.importImages) {
      rendererRef.importImages();
    }
  });
  items.appendChild(addBtn);

  createIcons({
    nameAttr: "data-lucide",
    attrs: {},
    root: items,
  });

  // Scroll active thumbnail into view when there are many pages.
  const active = items.querySelector<HTMLElement>(".page-thumb.active");
  if (active) {
    active.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }
};

/** Reorder page from one index to another */
canvas.reorderPage = function (fromIdx: number, toIdx: number): void {
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    fromIdx >= state.pages.length ||
    toIdx < 0 ||
    toIdx >= state.pages.length
  ) {
    return;
  }
  const activePage = state.getActivePage();
  const [moved] = state.pages.splice(fromIdx, 1);
  state.pages.splice(toIdx, 0, moved);

  if (activePage) {
    state.activePageIdx = state.pages.indexOf(activePage);
  }
  markDirty();
  canvas.renderPageStrip();
  ui.updatePageIndicator();
};

/** Set by renderer entry — avoids circular import */
let rendererRef: { importImages: () => Promise<void> } | null = null;
export function setRendererImport(fn: () => Promise<void>): void {
  rendererRef = { importImages: fn };
}

/** Switch active page by index */
canvas.switchPage = async function (idx: number): Promise<void> {
  canvas._clearGroups();
  state.setActivePage(idx);
  invalidateComposite(state.pages[idx]?.fileName ?? null);
  const page = state.getActivePage();
  if (page && !page.image) {
    // Lazy decode the target page, then render.
    await pageImages.ensurePageImage(page);
    // Re-hydrate the paint layer + mask patches that releasePageImage dropped
    // (persisted PNGs are the source of truth; runtime canvases are restored).
    hydrateCleanupCanvas(page);
    hydrateMaskImages(page);
  }
  // Drop the bitmap of pages far from the active one (LRU keeps recent ones).
  for (let i = 0; i < state.pages.length; i++) {
    if (Math.abs(i - idx) > 2) pageImages.releasePageImage(state.pages[i]);
  }
  canvas.render();
  canvas.renderPageStrip();
  ui.updatePageIndicator();
  if (sidebar && sidebar.render) sidebar.render();
  // Each page keeps its own undo/redo stack — refresh the header buttons
  history._updateButtons();
};

/** Remove a page — confirms when the session has unsaved changes */
canvas.removePage = async function (idx: number): Promise<void> {
  if (isDirty()) {
    const { guardUnsavedChanges } = await import("../project");
    if (!(await guardUnsavedChanges(i18n.t("project.removeDetail")))) return;
  }
  const removed = state.pages[idx];
  state.removePage(idx);
  if (removed) history.forgetPage(removed);
  markDirty(); // removal is a mutation — keep the session dirty
  invalidateComposite(removed?.fileName ?? null);
  canvas._clearGroups();
  if (state.pages.length > 0) {
    state.activePageIdx = Math.min(idx, state.pages.length - 1);
    canvas.render();
  } else {
    // No pages left — show landing
    landing.show();
    const stage = canvas.getStage();
    if (stage) stage.destroy();
  }
  canvas.renderPageStrip();
  ui.updatePageIndicator();
  if (sidebar && sidebar.render) sidebar.render();
  history._updateButtons();
};

/** Generate a thumbnail data URL from page (for export, future) */
canvas.generateThumbnail = function (
  page: Page,
  maxW?: number,
  maxH?: number,
): string | null {
  maxW = maxW || 80;
  maxH = maxH || 100;
  if (!page) return null;
  if (!page.image) {
    // Page bitmap released by lazy load — use pre-generated strip thumbnail
    const cached = pageImages.pageThumb(page);
    return cached || null;
  }
  const cnv = document.createElement("canvas");
  const ratio = Math.min(maxW / page.naturalWidth, maxH / page.naturalHeight);
  cnv.width = Math.round(page.naturalWidth * ratio);
  cnv.height = Math.round(page.naturalHeight * ratio);
  const ctx = cnv.getContext("2d") as CanvasRenderingContext2D;
  ctx.drawImage(page.image, 0, 0, cnv.width, cnv.height);
  return cnv.toDataURL("image/png");
};
