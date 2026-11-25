/** Lumina Sidebar (entry) — koharu-style Type + Layers|Masks panels */
import * as storage from "../storage";
import { state } from "../state";
import * as i18n from "../i18n";
import { createIcons } from "../ui/icons";
import type { Page } from "../../types";
import { layerListHTML, wireEvents } from "./layer-list";
import { maskListHTML, wireMaskEvents } from "./mask-list";
import { typeSection } from "./type-section";
import { shapeSection } from "./shape-section";
import { esc } from "./_esc";

const TYPE_MIN_HEIGHT = 72;
const TYPE_STORAGE_KEY = "lumina-type-height";

function loadTypeHeight(): number | null {
  const raw = storage.getItem(TYPE_STORAGE_KEY);
  const v = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

let _typeHeight: number | null = loadTypeHeight();
let _activeTab: "layers" | "masks" = "layers";
let _inspectorTab: "type" | "shape" = "type";
let _lastSelectedLayerId: string | null = null;
// Per-tab scroll of the list — sidebar.render() rebuilds the list DOM, which
// would otherwise reset the scroll to top on every selection/toggle.
let _tabScroll: Record<"layers" | "masks", number> = { layers: 0, masks: 0 };

/** Drag the splitter to resize the Type section height (Photoshop-style). */
function wireSplitter(
  splitter: HTMLElement,
  typeHost: HTMLElement,
  scroll: HTMLElement,
): void {
  splitter.addEventListener("mousedown", function (e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = typeHost.offsetHeight;
    typeHost.style.maxHeight = "none";
    document.body.classList.add("resizing-row");
    const onMove = function (ev: MouseEvent) {
      const max = scroll.clientHeight - 48; // keep room for tabs + list
      const h = Math.min(
        Math.max(startH + (ev.clientY - startY), TYPE_MIN_HEIGHT),
        max,
      );
      typeHost.style.height = h + "px";
    };
    const onUp = function () {
      document.body.classList.remove("resizing-row");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      _typeHeight = typeHost.offsetHeight;
      storage.setItem(TYPE_STORAGE_KEY, String(_typeHeight));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// Re-clamp the Type section height on window resize — without a render the
// stored height stays stale and can clip the layer list at the sidebar edge.
window.addEventListener("resize", function () {
  if (!_typeHeight || typeSection.isCollapsed()) return;
  const el = document.getElementById("type-section");
  if (!el || !el.parentElement) return;
  const max = el.parentElement.clientHeight - 48;
  const h = Math.max(TYPE_MIN_HEIGHT, Math.min(_typeHeight, max));
  if (h !== el.offsetHeight) el.style.height = h + "px";
});

function tabHTML(
  tab: "layers" | "masks",
  label: string,
  count: number,
  icon: string,
): string {
  return (
    '<button class="sidebar-tab' +
    (_activeTab === tab ? " active" : "") +
    '" data-tab="' +
    tab +
    '">' +
    '<i data-lucide="' +
    icon +
    '"></i>' +
    "<span>" +
    esc(label) +
    "</span>" +
    '<span class="sidebar-tab-count">' +
    count +
    "</span>" +
    "</button>"
  );
}

export const sidebar = {
  /** Programmatic tab switch (paint-tool warn flow auto-opens Masks) */
  setActiveTab(tab: "layers" | "masks"): void {
    if (_activeTab === tab) return;
    _activeTab = tab;
    this.render();
  },

  render(): void {
    const scroll = document.getElementById("sidebar-scroll");
    if (!scroll) return;

    // Preserve scroll position across the DOM rebuild below (keyed by tab)
    const prevList = scroll.querySelector<HTMLElement>(".layer-list");
    if (prevList) _tabScroll[_activeTab] = prevList.scrollTop;

    scroll.innerHTML = "";

    const page: Page | null = state.getActivePage();
    const total = page ? (page.layers || []).length : 0;
    const maskCount = page ? (page.inpaintMasks || []).length : 0;

    // Auto-switch Type | Shape inspector when selected layer changes
    const curSelId = page?._selectedLayerId ?? null;
    if (curSelId !== _lastSelectedLayerId) {
      _lastSelectedLayerId = curSelId;
      const selLay = curSelId
        ? page?.layers.find((l) => l.id === curSelId)
        : null;
      if (selLay?.type === "shape") _inspectorTab = "shape";
      else if (
        selLay?.type === "text-dialogue" ||
        selLay?.type === "text-free"
      )
        _inspectorTab = "type";
    }

    // Inspector section (Type | Shape tabs + collapse toggle)
    const typeHost = document.createElement("div");
    scroll.appendChild(typeHost);
    typeSection.build(typeHost);
    typeSection.refresh();

    const shapeBody = document.createElement("div");
    shapeSection.build(shapeBody);
    typeHost.appendChild(shapeBody);

    const typeBody = typeHost.querySelector<HTMLElement>("#type-body");
    if (typeBody) typeBody.classList.toggle("hidden", _inspectorTab !== "type");
    shapeBody.classList.toggle("hidden", _inspectorTab !== "shape");

    const selLocked = !!(
      page?._selectedLayerId &&
      page.layers.find((l) => l.id === page._selectedLayerId)?.locked
    );
    if (selLocked) {
      if (typeBody) {
        typeBody.style.opacity = "0.45";
        typeBody.style.pointerEvents = "none";
      }
      shapeBody.style.opacity = "0.45";
      shapeBody.style.pointerEvents = "none";
    }

    const typeHeader = typeHost.querySelector<HTMLElement>(".type-header");
    if (typeHeader) {
      const collapsed = typeSection.isCollapsed();
      typeHeader.style.padding = "0 6px 0 0";
      typeHeader.innerHTML =
        '<div class="flex items-center flex-1 min-w-0">' +
        '<button type="button" class="sidebar-tab' +
        (_inspectorTab === "type" ? " active" : "") +
        '" data-inspector="type" style="padding:5px 8px">' +
        '<i data-lucide="type"></i><span>' +
        esc(i18n.t("type.title")) +
        "</span></button>" +
        '<button type="button" class="sidebar-tab' +
        (_inspectorTab === "shape" ? " active" : "") +
        '" data-inspector="shape" style="padding:5px 8px">' +
        '<i data-lucide="pen-tool"></i><span>' +
        esc(i18n.t("layers.kindShape")) +
        "</span></button>" +
        "</div>" +
        '<button type="button" class="type-collapse-btn" title="' +
        esc(i18n.t(collapsed ? "type.expand" : "type.collapse")) +
        '"><i data-lucide="' +
        (collapsed ? "chevron-down" : "chevron-up") +
        '"></i></button>';

      typeHeader
        .querySelectorAll<HTMLButtonElement>("[data-inspector]")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const next = btn.getAttribute("data-inspector") as "type" | "shape";
            if (typeSection.isCollapsed()) typeSection.toggleCollapsed();
            _inspectorTab = next;
            sidebar.render();
          });
        });

      const collapseBtn = typeHeader.querySelector<HTMLButtonElement>(
        ".type-collapse-btn",
      );
      if (collapseBtn) {
        collapseBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          typeSection.toggleCollapsed();
          sidebar.render();
        });
      }
    }

    if (_typeHeight && !typeSection.isCollapsed()) {
      // Clamp to the current sidebar height; use maxHeight so shorter tabs
      // (like Shape) shrink-wrap and let Layers | Masks slide up.
      const max = scroll.clientHeight - 48;
      const h = Math.max(TYPE_MIN_HEIGHT, Math.min(_typeHeight, max));
      typeHost.style.maxHeight = h + "px";
      typeHost.style.height = _inspectorTab === "type" ? h + "px" : "auto";
    }

    // Photoshop-style height splitter between Type and tabs/list
    // (not shown when the Type section is collapsed)
    if (!typeSection.isCollapsed()) {
      const splitter = document.createElement("div");
      splitter.className = "sidebar-splitter";
      splitter.title = i18n.t("sidebar.resizeType");
      splitter.innerHTML = '<span class="sidebar-splitter-grip"></span>';
      scroll.appendChild(splitter);
      wireSplitter(splitter, typeHost, scroll);
    }

    // Tab bar: Layers | Masks
    const tabs = document.createElement("div");
    tabs.className = "sidebar-tabs shrink-0";
    tabs.innerHTML =
      tabHTML("layers", i18n.t("sidebar.tabLayers"), total, "layers") +
      tabHTML("masks", i18n.t("sidebar.tabMasks"), maskCount, "eraser");
    scroll.appendChild(tabs);

    tabs
      .querySelectorAll<HTMLButtonElement>(".sidebar-tab")
      .forEach(function (b) {
        b.addEventListener("click", function () {
          const t = b.getAttribute("data-tab");
          if (t === "layers" || t === "masks") {
            _activeTab = t;
            sidebar.render();
          }
        });
      });

    // Active panel content (single scrollable region below the tabs)
    const content = document.createElement("div");
    content.className =
      "layer-list flex-1 min-h-0 overflow-y-auto custom-scrollbar";
    scroll.appendChild(content);

    if (_activeTab === "masks") {
      content.innerHTML = maskListHTML(page);
      wireMaskEvents();
    } else {
      content.innerHTML = layerListHTML(page);
      wireEvents();
    }

    content.scrollTop = _tabScroll[_activeTab] || 0;

    createIcons();
  },
};
