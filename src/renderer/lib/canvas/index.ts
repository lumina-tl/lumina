/** Canvas API — shared interface other modules attach to. */
import Konva from "konva";
import { state } from "../state";
import { contextMenu } from "../ui/context-menu";
export interface CanvasAPI {
  render(): void;
  /** rAF-coalesced render — prefer during high-frequency interactions */
  scheduleRender(): void;
  getStage(): Konva.Stage | null;
  getLayer(): Konva.Layer | null;
  getScaleRatio(): number;
  getBaseScaleRatio(): number;
  getOffset(): { x: number; y: number };
  TEXT_COLOR: string;

  _clearGroups(): void;
  _createTextGroup(
    det: import("../../types").TextDetection,
    idx: number,
    sr: number,
    off: { x: number; y: number },
  ): Konva.Group;
  _setTextTransformer(t: Konva.Transformer): void;
  _getTextTransformer(): Konva.Transformer | null;
  selectTextDetection(idx: number | null): void;
  deleteTextDetection(idx: number): void;
  moveTextDetection(idx: number, dir: number): void;
  setTextDetectionText(idx: number, text: string): void;
  selectLayer(id: string | null): void;
  setLayerText(id: string, field: "source" | "translation", text: string): void;
  toggleLayerVisible(id: string): void;
  deleteLayer(id: string): void;
  /** Insert layer `id` before `insertAt` (clamped to its type group) */
  moveLayerTo(id: string, insertAt: number): void;
  toggleMaskVisible(id: string): void;
  deleteMask(id: string): void;
  setMaskOpacity(id: string, opacity: number): void;
  toggleAllMasks(): void;
  toggleBackgroundVisible(): void;
  addCleanupMask(): void;
  toggleCleanupVisible(): void;
  deleteCleanupMask(): void;
  clearCleanupMask(): void;
  setCleanupOpacity(opacity: number): void;
  /** Sync the header "show detection boxes" toggle with page state */
  updateBoxToggle(): void;
  _refreshTextGroup(idx: number): void;
  _updateStatus(): void;
  onToolChange(tool: string): void;

  renderPageStrip(): void;
  switchPage(idx: number): void;
  removePage(idx: number): void;
  generateThumbnail(
    page: import("../../types").Page,
    maxW?: number,
    maxH?: number,
  ): string | null;

  setZoom(level: number, anchor?: { x: number; y: number }): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  initBindings(): void;
  _initWheelZoom(): void;
  _initPanDrag(): void;
  _initZoomControls(): void;
  _initKeyboard(): void;
  _initSidebarResize(): void;
  _initDeselectClick(): void;
}

export const canvas: CanvasAPI = {
  render() {},
  scheduleRender() {},
  getStage() {
    return null;
  },
  getLayer() {
    return null;
  },
  getScaleRatio() {
    return 1;
  },
  getBaseScaleRatio() {
    return 1;
  },
  getOffset() {
    return { x: 0, y: 0 };
  },
  TEXT_COLOR: "#00ff88",

  _clearGroups() {},
  _createTextGroup() {
    throw new Error("not implemented");
  },
  _setTextTransformer() {},
  _getTextTransformer() {
    return null;
  },
  selectTextDetection() {},
  deleteTextDetection() {},
  moveTextDetection() {},
  setTextDetectionText() {},
  selectLayer() {},
  setLayerText() {},
  toggleLayerVisible() {},
  deleteLayer() {},
  moveLayerTo() {},
  toggleMaskVisible() {},
  deleteMask() {},
  setMaskOpacity() {},
  toggleAllMasks() {},
  toggleBackgroundVisible() {},
  addCleanupMask() {},
  toggleCleanupVisible() {},
  deleteCleanupMask() {},
  clearCleanupMask() {},
  setCleanupOpacity() {},
  updateBoxToggle() {},
  _refreshTextGroup() {},
  _updateStatus() {},
  onToolChange() {},

  renderPageStrip() {},
  switchPage() {},
  removePage() {},
  generateThumbnail() {
    return null;
  },

  setZoom() {},
  zoomIn() {},
  zoomOut() {},
  zoomReset() {},
  initBindings() {},
  _initWheelZoom() {},
  _initPanDrag() {},
  _initZoomControls() {},
  _initKeyboard() {},
  _initSidebarResize() {},
  _initDeselectClick() {},
};

/** Keyboard shortcuts for canvas */
canvas._initKeyboard = function (): void {
  document.addEventListener("keydown", function (e) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    // Delete selected detection
    if (e.key === "Delete" || e.key === "Backspace") {
      // Paint tools own Delete — don't delete text layers while painting.
      const t = state.activeTool;
      if (
        t === "brush" ||
        t === "eraser" ||
        t === "bucket" ||
        t === "eyedropper"
      )
        return;
      const page = state.getActivePage();
      if (!page) return;
      if (page._selectedTextIdx !== null) {
        e.preventDefault();
        canvas.deleteTextDetection(page._selectedTextIdx);
      } else if (page._selectedLayerId) {
        e.preventDefault();
        canvas.deleteLayer(page._selectedLayerId);
      }
      return;
    }
  });
};

/** Wire deselect-on-empty-click once */
let _deselectBound = false;
canvas._initDeselectClick = function (): void {
  if (_deselectBound) return;
  const stage = canvas.getStage();
  if (!stage) return;
  _deselectBound = true;
  stage.on("click tap", function (e) {
    const t = state.activeTool;
    if (t === "brush" || t === "eraser" || t === "bucket" || t === "eyedropper")
      return;
    if (e.target === stage || e.target.getParent() === canvas.getLayer()) {
      canvas.selectTextDetection(null);
    }
  });
  stage.on("contextmenu", function (e) {
    if (e.target !== stage && e.target.getParent() !== canvas.getLayer())
      return;
    e.evt.preventDefault();
    contextMenu.show(e.evt.clientX, e.evt.clientY, [
      {
        labelKey: "ctx.deselect",
        action: function () {
          canvas.selectTextDetection(null);
        },
      },
    ]);
  });
};

/** Sync the header "show detection boxes" toggle with page state */
canvas.updateBoxToggle = function (): void {
  const btn = document.getElementById(
    "btn-toggle-boxes",
  ) as HTMLButtonElement | null;
  if (!btn) return;
  const page = state.getActivePage();
  const hasDet =
    !!page && !!page.textDetections && page.textDetections.length > 0;
  const hasMask = !!page && !!page.inpaintMasks && page.inpaintMasks.length > 0;
  btn.disabled = !hasDet || hasMask;
  btn.classList.toggle("active", !!state.showDetBoxes);
};

/** Init all canvas-related keyboard/UI bindings */
canvas.initBindings = function (): void {
  canvas._initKeyboard();
  canvas._initSidebarResize();
  canvas._initWheelZoom();
  canvas._initPanDrag();
  canvas._initZoomControls();
};
