/** Font Market modal — Feed Gallery layout with instant CSS Webfont Subsetting. */
import * as storage from "../storage";
import * as i18n from "../i18n";
import { state } from "../state";
import { canvas } from "../canvas/index";
import { history } from "../history";
import { createIcons } from "../ui/icons";
import {
  applyRect,
  bindDrag,
  bindResize,
  clampRect,
  centerRect,
  currentRect,
  type ModalRect,
} from "../ui/modal-window";
import {
  detectFontStatus,
  internalFontName,
  reloadFonts,
} from "../utils/font-loader";
import { typeSection } from "../sidebar/type-section";
import { log } from "../logger";
import type {
  FontMarketItem,
  GoogleFontSearchResult,
} from "../../../shared/bridge";
import type { Page, PageLayer } from "../../types";

const WINDOW_KEY = "lumina:fontMarketRect";
const DEFAULT_PREVIEW_TEXT = "I can't believe what happened yesterday!";

type ActiveTab = "curated" | "google" | "installed";

interface ModalState {
  overlay: HTMLElement | null;
  curated: FontMarketItem[];
  googleItems: FontMarketItem[];
  googleTotal: number;
  googlePage: number;
  googleHasMore: boolean;
  googleLoadingMore: boolean;
  activeTab: ActiveTab;
  categoryFilter: string;
  searchQuery: string;
  customSampleText: string;
  previewFontSize: number;
  loading: boolean;
  installingIds: Set<string>;
  openMenuId: string | null;
}

const st: ModalState = {
  overlay: null,
  curated: [],
  googleItems: [],
  googleTotal: 0,
  googlePage: 0,
  googleHasMore: true,
  googleLoadingMore: false,
  activeTab: "curated",
  categoryFilter: "all",
  searchQuery: "",
  customSampleText: DEFAULT_PREVIEW_TEXT,
  previewFontSize: 26,
  loading: false,
  installingIds: new Set(),
  openMenuId: null,
};

let _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _sampleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _currentSearchSeq = 0;

function loadRect(): ModalRect | null {
  try {
    const raw = storage.getItem(WINDOW_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as ModalRect;
    if (
      typeof r.x === "number" &&
      typeof r.y === "number" &&
      typeof r.w === "number" &&
      typeof r.h === "number"
    ) {
      return r;
    }
    return null;
  } catch {
    return null;
  }
}

function saveRect(): void {
  const modal = document.getElementById("font-market-modal");
  if (!modal) return;
  try {
    storage.setItem(WINDOW_KEY, JSON.stringify(currentRect(modal)));
  } catch {
    /* storage unavailable */
  }
}

function onWindowResize(): void {
  const modal = document.getElementById("font-market-modal");
  if (modal) applyRect(modal, clampRect(currentRect(modal), 720, 520));
}

function safeFamilyId(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Update Google Fonts dynamic CSS subset stylesheets in document head */
function updateSubsetFontStyles(families: string[], sampleText: string): void {
  // Clear previous preview links
  document.querySelectorAll(".font-market-subset-link").forEach((el) => el.remove());

  if (families.length === 0) return;

  // Extract unique character set for the subset + standard alphanumeric punctuation
  const chars = Array.from(
    new Set(
      sampleText +
        " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,'-;:",
    ),
  ).join("");
  const encodedChars = encodeURIComponent(chars);

  // Chunk in batches of 20 families to prevent overly long URLs
  const chunkSize = 20;
  for (let i = 0; i < families.length; i += chunkSize) {
    const chunk = families.slice(i, i + chunkSize);
    const familyParams = chunk
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`)
      .join("&");
    const url = `https://fonts.googleapis.com/css2?${familyParams}&text=${encodedChars}&display=swap`;

    const link = document.createElement("link");
    link.className = "font-market-subset-link";
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
    log.debug(
      "font-market",
      `Injected webfont subset link (${chunk.length} fonts): ${chunk.join(", ")}`,
    );
  }
}

function getSelectedTextLayer(): PageLayer | null {
  const page: Page | null = state.getActivePage();
  if (!page || !page._selectedLayerId) return null;
  const layer = page.layers.find((l) => l.id === page._selectedLayerId);
  if (!layer) return null;
  if (layer.type === "text-dialogue" || layer.type === "text-free") {
    return layer;
  }
  return null;
}

export const fontMarketModal = {
  async open(): Promise<void> {
    if (!st.overlay) {
      this.build();
    }
    const overlay = st.overlay;
    if (!overlay) return;

    overlay.classList.add("show");
    window.addEventListener("resize", onWindowResize);

    const modal = overlay.querySelector("#font-market-modal") as HTMLElement;
    applyRect(modal, clampRect(loadRect() ?? centerRect(940, 640), 720, 520));

    st.openMenuId = null;
    st.loading = true;
    this.render();

    try {
      await reloadFonts();
      if (window.lumina.getFontMarketCatalog) {
        st.curated = (await window.lumina.getFontMarketCatalog()) || [];
      }
    } catch {
      st.curated = [];
    } finally {
      st.loading = false;
      this.render();
    }
  },

  close(): void {
    // Clean up subset preview links from head
    document.querySelectorAll(".font-market-subset-link").forEach((el) => el.remove());

    if (st.overlay) {
      st.overlay.classList.remove("show");
      window.removeEventListener("resize", onWindowResize);
      st.openMenuId = null;
    }
  },

  build(): void {
    if (st.overlay) st.overlay.remove();

    const overlay = document.createElement("div");
    overlay.id = "font-market-overlay";
    overlay.className = "overlay font-market-overlay";
    overlay.innerHTML = `
      <div class="card card-raised settings-modal font-market-modal flex flex-col overflow-hidden" id="font-market-modal">
        <!-- Titlebar -->
        <div class="settings-titlebar flex items-center justify-between px-4 py-2.5 border-b border-surface-3" id="font-market-titlebar">
          <div class="flex items-center gap-2">
            <i data-lucide="store" class="w-4 h-4 text-lumina"></i>
            <span class="text-text-primary text-xs font-semibold">Font Market</span>
            <span class="text-[0.68rem] text-text-muted font-normal">• Manga & Comic Typography</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button class="btn p-1 text-text-secondary hover:text-text-primary" id="btn-font-market-folder" title="Open Local Fonts Folder">
              <i data-lucide="folder" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn p-1 text-text-secondary hover:text-text-primary" id="btn-font-market-close">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Clean Gallery Control Bar -->
        <div class="font-gallery-toolbar px-4 py-2 border-b border-surface-3 flex flex-col gap-2">
          <!-- Row 1: Mode Segmented Tabs + Search -->
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="font-gallery-modes" id="font-gallery-modes">
              <button class="font-gallery-mode-btn active" data-tab="curated">
                <i data-lucide="star" class="w-3.5 h-3.5 text-lumina"></i>
                <span>Curated Manga</span>
                <span class="font-gallery-badge">${st.curated.length || 47}</span>
              </button>
              <button class="font-gallery-mode-btn" data-tab="google">
                <i data-lucide="globe" class="w-3.5 h-3.5"></i>
                <span>Google Fonts</span>
                <span class="font-gallery-badge">1,960+</span>
              </button>
              <button class="font-gallery-mode-btn" data-tab="installed">
                <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
                <span>Installed</span>
              </button>
            </div>

            <!-- Search input -->
            <div class="relative flex items-center font-gallery-search-wrap flex-1 max-w-xs">
              <i data-lucide="search" class="w-3.5 h-3.5 text-text-muted absolute left-2.5 pointer-events-none"></i>
              <input type="text" class="input pl-8 pr-3 py-1 text-xs w-full font-gallery-search" id="font-gallery-search" placeholder="Filter by name, author..." />
            </div>
          </div>

          <!-- Row 2: Secondary Controls (Custom Sample Text + Size Slider + Category Chips) -->
          <div class="flex items-center justify-between gap-3 flex-wrap pt-0.5">
            <!-- Curated category pills (shown when in Curated mode) -->
            <div class="flex items-center gap-1 font-gallery-cat-pills" id="font-gallery-cat-pills">
              <button class="font-cat-pill active" data-cat="all">All</button>
              <button class="font-cat-pill" data-cat="dialogue">Dialogue</button>
              <button class="font-cat-pill" data-cat="scream">Scream</button>
              <button class="font-cat-pill" data-cat="whisper">Whisper</button>
              <button class="font-cat-pill" data-cat="sfx">SFX</button>
            </div>

            <!-- Google Fonts status counter -->
            <div class="text-[0.68rem] text-text-muted hidden" id="font-google-counter">
              Showing <span id="font-google-count">0</span> fonts
            </div>

            <div class="flex items-center gap-3 ml-auto">
              <!-- Custom Sample Text Input -->
              <div class="flex items-center gap-1.5 font-sample-text-wrap">
                <span class="text-[0.65rem] text-text-muted">Sample:</span>
                <input type="text" class="input py-0.5 px-2 text-xs w-52" id="font-custom-sample" value="${DEFAULT_PREVIEW_TEXT}" placeholder="Type preview text..." />
              </div>

              <!-- Font Size Slider -->
              <div class="flex items-center gap-1.5 font-size-slider-wrap">
                <span class="text-[0.65rem] text-text-muted" id="font-size-label">26px</span>
                <input type="range" class="font-size-slider" id="font-size-slider" min="16" max="64" value="26" step="2" />
              </div>
            </div>
          </div>
        </div>

        <!-- Feed List Body -->
        <div class="font-feed-body flex-1 overflow-y-auto custom-scrollbar" id="font-feed-body">
          <div class="font-feed-list" id="font-feed-list"></div>
          <div class="font-feed-footer py-4 flex items-center justify-center text-text-muted text-xs hidden" id="font-feed-footer">
            <i data-lucide="loader-2" class="w-4 h-4 animate-spin text-lumina mr-2"></i>
            <span>Loading more fonts...</span>
          </div>
        </div>

        <!-- Resize Grip -->
        <div class="settings-resize-grip" id="font-market-resize-grip" title="Resize">
          <i data-lucide="grip" class="w-3 h-3"></i>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    st.overlay = overlay;

    // Window Drag & Resize
    const modal = overlay.querySelector("#font-market-modal") as HTMLElement;
    const titlebar = overlay.querySelector("#font-market-titlebar") as HTMLElement;
    const grip = overlay.querySelector("#font-market-resize-grip") as HTMLElement;
    bindDrag(modal, titlebar, saveRect);
    bindResize(modal, grip, saveRect);

    // Close Button & Background Dismiss
    overlay.querySelector("#btn-font-market-close")?.addEventListener("click", () => this.close());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.close();
      if (!(e.target as HTMLElement).closest(".font-feed-action-wrap")) {
        if (st.openMenuId) {
          st.openMenuId = null;
          this.closeAllMenus();
        }
      }
    });

    // Open Local Fonts Folder
    overlay.querySelector("#btn-font-market-folder")?.addEventListener("click", async () => {
      if (window.lumina.openFontsFolder) {
        await window.lumina.openFontsFolder();
      }
    });

    // Custom Sample Text live update (debounced subset update)
    const sampleInput = overlay.querySelector("#font-custom-sample") as HTMLInputElement;
    if (sampleInput) {
      sampleInput.addEventListener("input", () => {
        st.customSampleText = sampleInput.value.trim() || DEFAULT_PREVIEW_TEXT;
        document.querySelectorAll(".font-feed-sample").forEach((el) => {
          el.textContent = st.customSampleText;
        });

        if (_sampleDebounceTimer) clearTimeout(_sampleDebounceTimer);
        _sampleDebounceTimer = setTimeout(() => {
          this.refreshSubsets();
        }, 400);
      });
    }

    // Font Size Slider
    const sizeSlider = overlay.querySelector("#font-size-slider") as HTMLInputElement;
    const sizeLabel = overlay.querySelector("#font-size-label") as HTMLElement;
    if (sizeSlider && sizeLabel) {
      sizeSlider.addEventListener("input", () => {
        const sz = parseInt(sizeSlider.value, 10) || 26;
        st.previewFontSize = sz;
        sizeLabel.textContent = `${sz}px`;
        document.querySelectorAll<HTMLElement>(".font-feed-sample").forEach((el) => {
          el.style.fontSize = `${sz}px`;
        });
      });
    }

    // Mode Switcher Buttons
    overlay.querySelectorAll(".font-gallery-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll(".font-gallery-mode-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = (btn.getAttribute("data-tab") || "curated") as ActiveTab;
        this.switchTab(tab);
      });
    });

    // Category Filter Pills
    overlay.querySelectorAll(".font-cat-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        overlay.querySelectorAll(".font-cat-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        st.categoryFilter = pill.getAttribute("data-cat") || "all";
        this.render();
      });
    });

    // Search Input
    const searchInput = overlay.querySelector("#font-gallery-search") as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        st.searchQuery = searchInput.value.trim().toLowerCase();
        if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);

        if (st.activeTab === "google") {
          _searchDebounceTimer = setTimeout(() => {
            st.googlePage = 0;
            st.googleHasMore = true;
            void this.loadGoogleFonts(false);
          }, 150);
        } else {
          this.render();
        }
      });
    }

    // Infinite scroll listener on feed body
    const feedBody = overlay.querySelector("#font-feed-body") as HTMLElement;
    if (feedBody) {
      feedBody.addEventListener("scroll", () => {
        if (st.activeTab !== "google") return;
        if (st.googleLoadingMore || !st.googleHasMore) return;

        const scrollBottom = feedBody.scrollHeight - (feedBody.scrollTop + feedBody.clientHeight);
        if (scrollBottom < 200) {
          st.googlePage += 1;
          void this.loadGoogleFonts(true);
        }
      });
    }

    createIcons({ root: overlay });
  },

  switchTab(tab: ActiveTab): void {
    st.activeTab = tab;
    st.openMenuId = null;

    const catPills = document.getElementById("font-gallery-cat-pills");
    const googleCounter = document.getElementById("font-google-counter");

    if (catPills) catPills.style.display = tab === "curated" ? "flex" : "none";
    if (googleCounter) googleCounter.classList.toggle("hidden", tab !== "google");

    if (tab === "google" && st.googleItems.length === 0) {
      st.googlePage = 0;
      st.googleHasMore = true;
      void this.loadGoogleFonts(false);
    } else {
      this.render();
    }
  },

  async loadGoogleFonts(append: boolean): Promise<void> {
    const seq = ++_currentSearchSeq;

    if (!append) {
      if (st.googleItems.length === 0) {
        st.loading = true;
        this.render();
      }
    } else {
      st.googleLoadingMore = true;
      const footer = document.getElementById("font-feed-footer");
      if (footer) footer.classList.remove("hidden");
    }

    try {
      if (window.lumina.searchGoogleFonts) {
        const res: GoogleFontSearchResult = await window.lumina.searchGoogleFonts({
          query: st.searchQuery,
          page: st.googlePage,
          pageSize: 28,
        });

        // Discard stale out-of-order response
        if (seq !== _currentSearchSeq) return;

        if (append) {
          st.googleItems = [...st.googleItems, ...res.items];
        } else {
          st.googleItems = res.items;
        }
        st.googleTotal = res.total;
        st.googleHasMore = res.hasMore;

        const countEl = document.getElementById("font-google-count");
        if (countEl) countEl.textContent = `${st.googleItems.length} of ${st.googleTotal}`;
      }
    } catch (err) {
      log.error(
        "font-market",
        `Failed to load Google Fonts: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (seq !== _currentSearchSeq) return;
      if (!append) st.googleItems = [];
      st.googleHasMore = false;
    } finally {
      if (seq === _currentSearchSeq) {
        st.loading = false;
        st.googleLoadingMore = false;
        const footer = document.getElementById("font-feed-footer");
        if (footer) footer.classList.add("hidden");
        this.render();
      }
    }
  },

  getCurrentDisplayItems(): FontMarketItem[] {
    if (st.activeTab === "curated") {
      return st.curated.filter((item) => {
        if (st.categoryFilter !== "all" && item.category !== st.categoryFilter) {
          return false;
        }
        if (st.searchQuery) {
          const text = `${item.family} ${item.author}`.toLowerCase();
          if (!text.includes(st.searchQuery)) return false;
        }
        return true;
      });
    } else if (st.activeTab === "google") {
      return st.googleItems;
    } else if (st.activeTab === "installed") {
      const seen = new Set<string>();
      const result: FontMarketItem[] = [];

      // 1. Curated fonts that are installed
      for (const item of st.curated) {
        const { status } = detectFontStatus(item.family);
        if (status !== "not_installed" && !seen.has(item.family.toLowerCase())) {
          seen.add(item.family.toLowerCase());
          result.push(item);
        }
      }

      // 2. Google fonts in memory that are installed
      for (const item of st.googleItems) {
        const { status } = detectFontStatus(item.family);
        if (status !== "not_installed" && !seen.has(item.family.toLowerCase())) {
          seen.add(item.family.toLowerCase());
          result.push(item);
        }
      }

      // 3. Any in-app or font-market installed fonts recorded in state.fontList
      for (const f of state.fontList || []) {
        const { status } = detectFontStatus(f.family);
        const p = f.path.toLowerCase().replace(/\\/g, "/");
        const isFromMarket =
          status === "in_app" ||
          p.includes("gfont-") ||
          st.curated.some((c) => c.family.toLowerCase() === f.family.toLowerCase());

        if (status !== "not_installed" && isFromMarket && !seen.has(f.family.toLowerCase())) {
          seen.add(f.family.toLowerCase());
          result.push({
            id: "gfont-" + safeFamilyId(f.family),
            family: f.family,
            category: "dialogue",
            author: "Google Fonts / Local",
            files: {
              regular: f.path,
            },
          });
        }
      }

      if (st.searchQuery) {
        return result.filter((item) => {
          const text = `${item.family} ${item.author}`.toLowerCase();
          return text.includes(st.searchQuery);
        });
      }
      return result;
    }
    return [];
  },

  refreshSubsets(): void {
    const items = this.getCurrentDisplayItems();
    const families = items.map((i) => i.family);
    updateSubsetFontStyles(families, st.customSampleText);
  },

  render(): void {
    const listHost = document.getElementById("font-feed-list");
    if (!listHost) return;
    listHost.innerHTML = "";

    if (st.loading) {
      listHost.innerHTML = `
        <div class="flex flex-col items-center justify-center h-56 gap-3 text-text-muted">
          <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-lumina"></i>
          <span class="text-xs">Loading font library...</span>
        </div>
      `;
      createIcons({ root: listHost });
      return;
    }

    const itemsToDisplay = this.getCurrentDisplayItems();

    if (itemsToDisplay.length === 0) {
      listHost.innerHTML = `
        <div class="flex flex-col items-center justify-center h-56 gap-2 text-text-muted">
          <i data-lucide="type" class="w-8 h-8 opacity-30"></i>
          <span class="text-xs">No fonts found matching your search</span>
        </div>
      `;
      createIcons({ root: listHost });
      return;
    }

    itemsToDisplay.forEach((item) => {
      const row = this.renderRow(item);
      listHost.appendChild(row);
    });

    createIcons({ root: listHost });

    // Request CSS webfont subsets for all displayed font families
    this.refreshSubsets();
  },

  renderRow(item: FontMarketItem): HTMLElement {
    const { status } = detectFontStatus(item.family);
    const isInstalling = st.installingIds.has(item.id);
    const selectedLayer = getSelectedTextLayer();
    const safeId = safeFamilyId(item.family);

    const row = document.createElement("div");
    row.className = "font-feed-row";
    row.id = `font-row-${safeId}`;
    row.dataset.fontId = safeId;

    const catBadge =
      st.activeTab === "curated"
        ? `<span class="font-cat-tag tag-${item.category}">${item.category}</span>`
        : `<span class="font-cat-tag tag-google">Google Font</span>`;

    let statusChip = "";
    if (status === "system") {
      statusChip = `<span class="font-status-badge badge-system"><i data-lucide="check" class="w-3 h-3"></i> System</span>`;
    } else if (status === "in_app") {
      statusChip = `<span class="font-status-badge badge-in-app"><i data-lucide="check" class="w-3 h-3"></i> In-App</span>`;
    }

    row.innerHTML = `
      <!-- Row Header -->
      <div class="font-feed-row-head">
        <div class="flex items-center gap-2 min-w-0">
          <span class="font-feed-family">${item.family}</span>
          ${catBadge}
          <span class="font-feed-meta">by ${item.author} • ${item.license || "OFL"}</span>
        </div>

        <div class="flex items-center gap-2.5 ml-auto flex-shrink-0">
          ${statusChip}
          <div class="font-feed-action-wrap relative" id="action-wrap-${safeId}"></div>
        </div>
      </div>

      <!-- Typography Preview Body (Native CSS Webfont Subset) -->
      <div
        class="font-feed-sample"
        id="sample-${safeId}"
        contenteditable="true"
        spellcheck="false"
        style="font-family: '${item.family}', sans-serif; font-size: ${st.previewFontSize}px;"
        title="Click to edit preview text"
      >
        ${st.customSampleText}
      </div>
    `;

    const actionHost = row.querySelector(`#action-wrap-${safeId}`) as HTMLElement;
    if (actionHost) {
      this.renderSingleActionButton(actionHost, item, status, isInstalling, selectedLayer);
    }

    return row;
  },

  renderSingleActionButton(
    host: HTMLElement,
    item: FontMarketItem,
    status: "not_installed" | "in_app" | "system",
    isInstalling: boolean,
    selectedLayer: PageLayer | null,
  ): void {
    host.innerHTML = "";
    const safeId = safeFamilyId(item.family);

    if (isInstalling) {
      const busyBtn = document.createElement("button");
      busyBtn.className = "btn text-xs font-market-btn-busy";
      busyBtn.disabled = true;
      busyBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Downloading...';
      host.appendChild(busyBtn);
      return;
    }

    const isMenuOpen = st.openMenuId === safeId;

    if (status === "not_installed") {
      const mainBtn = document.createElement("button");
      mainBtn.className = "btn primary text-xs flex items-center gap-1 font-market-single-btn";
      mainBtn.innerHTML = `
        <i data-lucide="download" class="w-3 h-3"></i>
        <span>Install</span>
        <i data-lucide="chevron-down" class="w-3 h-3 ml-0.5 opacity-70"></i>
      `;
      mainBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleDropdown(safeId);
      });
      host.appendChild(mainBtn);

      if (isMenuOpen) {
        const menu = document.createElement("div");
        menu.className = "font-action-dropdown";
        menu.innerHTML = `
          <button class="font-dropdown-item" id="opt-inapp-${safeId}">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-lumina"></i>
            <div class="flex flex-col text-left">
              <span class="font-medium text-text-primary">Install for Lumina (In-App)</span>
              <span class="text-[0.62rem] text-text-muted">Instant, clean, no administrator required</span>
            </div>
          </button>
          <button class="font-dropdown-item" id="opt-system-${safeId}">
            <i data-lucide="hard-drive" class="w-3.5 h-3.5 text-text-secondary"></i>
            <div class="flex flex-col text-left">
              <span class="font-medium text-text-primary">Install to Windows (System)</span>
              <span class="text-[0.62rem] text-text-muted">Available in Photoshop, CSP, and OS</span>
            </div>
          </button>
        `;
        menu.querySelector(`#opt-inapp-${safeId}`)?.addEventListener("click", async () => {
          this.closeAllMenus();
          await this.handleInstall(item, false);
        });
        menu.querySelector(`#opt-system-${safeId}`)?.addEventListener("click", async () => {
          this.closeAllMenus();
          await this.handleInstall(item, true);
        });
        host.appendChild(menu);
      }
    } else {
      const installedBtn = document.createElement("button");
      installedBtn.className = "btn text-xs flex items-center gap-1 font-market-single-btn font-market-installed-btn";
      installedBtn.innerHTML = `
        <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i>
        <span>Installed</span>
        <i data-lucide="chevron-down" class="w-3 h-3 ml-0.5 opacity-70"></i>
      `;
      installedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleDropdown(safeId);
      });
      host.appendChild(installedBtn);

      if (isMenuOpen) {
        const menu = document.createElement("div");
        menu.className = "font-action-dropdown";

        let html = "";
        if (selectedLayer) {
          html += `
            <button class="font-dropdown-item" id="opt-use-${safeId}">
              <i data-lucide="type" class="w-3.5 h-3.5 text-lumina"></i>
              <span class="font-medium text-text-primary">Use Font on Canvas</span>
            </button>
          `;
        }
        if (status === "in_app") {
          html += `
            <button class="font-dropdown-item" id="opt-promote-${safeId}">
              <i data-lucide="hard-drive" class="w-3.5 h-3.5 text-text-secondary"></i>
              <span class="font-medium text-text-primary">Install to Windows (System)</span>
            </button>
          `;
        }
        html += `
          <div class="font-dropdown-sep"></div>
          <button class="font-dropdown-item text-red-400 hover:text-red-300" id="opt-uninstall-${safeId}">
            <i data-lucide="trash-2" class="w-3.5 h-3.5 text-red-400"></i>
            <span>Uninstall Font</span>
          </button>
        `;
        menu.innerHTML = html;

        menu.querySelector(`#opt-use-${safeId}`)?.addEventListener("click", () => {
          this.closeAllMenus();
          this.applyFontToLayer(item);
        });
        menu.querySelector(`#opt-promote-${safeId}`)?.addEventListener("click", async () => {
          this.closeAllMenus();
          await this.handleInstall(item, true);
        });
        menu.querySelector(`#opt-uninstall-${safeId}`)?.addEventListener("click", async () => {
          this.closeAllMenus();
          await this.handleUninstall(item);
        });
        host.appendChild(menu);
      }
    }
  },

  toggleDropdown(safeId: string): void {
    if (st.openMenuId === safeId) {
      st.openMenuId = null;
    } else {
      st.openMenuId = safeId;
    }
    this.render();
  },

  closeAllMenus(): void {
    st.openMenuId = null;
    document.querySelectorAll(".font-action-dropdown").forEach((el) => el.remove());
  },

  async handleInstall(item: FontMarketItem, installToSystem: boolean): Promise<void> {
    st.installingIds.add(item.id);
    this.render();

    try {
      log.info(
        "font-market",
        `Installing ${item.family} (System: ${installToSystem})`,
      );
      const res = await window.lumina.installFont({
        fontId: item.id,
        family: item.family,
        downloadUrl: item.files.regular,
        installToSystem,
      });
      log.debug(
        "font-market",
        `Install result for ${item.family}: ok=${res.ok}`,
      );
      if (res.ok) {
        await reloadFonts();
        typeSection.refresh();
      } else {
        log.error("font-market", `Install failed: ${res.error}`);
      }
    } catch (err) {
      log.error(
        "font-market",
        `Install exception: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      st.installingIds.delete(item.id);
      this.render();
    }
  },

  async handleUninstall(item: FontMarketItem): Promise<void> {
    st.installingIds.add(item.id);
    this.render();

    try {
      log.info("font-market", `Uninstalling ${item.family}`);
      const res = await window.lumina.uninstallFont({
        fontId: item.id,
        family: item.family,
      });
      log.debug(
        "font-market",
        `Uninstall result for ${item.family}: ok=${res.ok}`,
      );
      if (res.ok) {
        await reloadFonts();
        typeSection.refresh();
      } else {
        log.error("font-market", `Uninstall failed: ${res.error}`);
      }
    } catch (err) {
      log.error(
        "font-market",
        `Uninstall exception: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      st.installingIds.delete(item.id);
      this.render();
    }
  },

  applyFontToLayer(item: FontMarketItem): void {
    const page: Page | null = state.getActivePage();
    if (!page) return;
    const layer = getSelectedTextLayer();
    if (!layer) return;

    const targetFont = internalFontName(item.family);
    layer.typography.fontFamily = targetFont;
    canvas.render();
    history.snapshot();
    typeSection.refresh();
    this.close();
  },
};
