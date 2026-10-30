/** Text Tool — stage interactions: marquee (paragraph) + click (point) */
import { state } from "../../../state";
import { canvas } from "../../index";
import { stageToImg, cleanedViewReady } from "./shared";
import { createAndEdit } from "./create";
import { hitTransformer } from "../../hit-transformer";

interface DragState {
  startX: number;
  startY: number;
  active: boolean;
}

let marquee: HTMLDivElement | null = null;
/** Hard gate — one create per gesture, even with duplicate listeners. */
let _createLock = false;

function removeMarquee(): void {
  if (marquee) {
    marquee.remove();
    marquee = null;
  }
}

function updateMarquee(x1: number, y1: number, x2: number, y2: number): void {
  if (!marquee) return;
  marquee.style.left = Math.min(x1, x2) + "px";
  marquee.style.top = Math.min(y1, y2) + "px";
  marquee.style.width = Math.abs(x2 - x1) + "px";
  marquee.style.height = Math.abs(y2 - y1) + "px";
}

/** True when the event target is an existing free/dialogue text layer. */
function hitExistingTextLayer(target: unknown, stage: unknown): boolean {
  let node = target as {
    name?: () => string;
    getParent?: () => unknown;
    getAttr?: (k: string) => unknown;
  } | null;
  while (node && node !== stage) {
    const name = node.name ? node.name() : "";
    if (
      name === "layer-text" ||
      name === "layer-text-box" ||
      name === "layer-text-glyphs" ||
      name === "layer-text-glyphs-col"
    ) {
      return true;
    }
    if (node.getAttr && node.getAttr("layerId")) return true;
    node = node.getParent
      ? (node.getParent() as typeof node)
      : null;
  }
  return false;
}

/** Detection overlays — never spawn a free-text box on top of them. */
function hitDetection(target: unknown, stage: unknown): boolean {
  let node = target as {
    name?: () => string;
    getParent?: () => unknown;
  } | null;
  while (node && node !== stage) {
    const name = node.name ? node.name() : "";
    if (name === "det-group" || name === "det-box" || name === "det-badge") {
      return true;
    }
    node = node.getParent
      ? (node.getParent() as typeof node)
      : null;
  }
  return false;
}

/** Empty page / image background only — not text, dets, or handles. */
function isEmptyBackground(target: unknown, stage: unknown): boolean {
  if (hitTransformer(target)) return false;
  if (hitExistingTextLayer(target, stage)) return false;
  if (hitDetection(target, stage)) return false;
  if (target === stage) return true;
  let node = target as {
    name?: () => string;
    getParent?: () => unknown;
  } | null;
  while (node && node !== stage) {
    const name = node.name ? node.name() : "";
    // Named interactive chrome is never "empty".
    if (name && name !== "bg") return false;
    if (name === "bg") return true;
    node = node.getParent
      ? (node.getParent() as typeof node)
      : null;
  }
  // Unnamed nodes under the layer (legacy) — only treat as empty if the
  // walk reached stage/layer without hitting known chrome.
  return target === stage;
}

let _boundStage: ReturnType<typeof canvas.getStage> = null;

/** Allow re-bind after destroyStage() creates a fresh Konva stage. */
export function resetStageBinding(): void {
  _boundStage = null;
}

export function bindStageInteractions(): void {
  const bindWhenReady = function (): void {
    const stage = canvas.getStage();
    if (!stage) {
      setTimeout(bindWhenReady, 500);
      return;
    }
    // Same stage already wired — do NOT stack duplicate listeners.
    if (_boundStage === stage) return;
    _boundStage = stage;
    const container = stage.container();
    const drag: DragState = { startX: 0, startY: 0, active: false };

    stage.on("mousedown touchstart", function (e) {
      if (state.activeTool !== "text") return;
      if (e.evt.button !== 0 && e.type === "mousedown") return;
      if (_createLock) return;
      // Handles / selected box / dets — never begin a create gesture.
      if (hitTransformer(e.target)) return;
      if (hitExistingTextLayer(e.target, stage)) return;
      if (hitDetection(e.target, stage)) return;
      if (!isEmptyBackground(e.target, stage)) return;
      if (!cleanedViewReady()) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;
      e.cancelBubble = true;

      drag.startX = pos.x;
      drag.startY = pos.y;
      drag.active = true;

      // Rubber-band marquee div
      removeMarquee();
      const div = document.createElement("div");
      div.id = "text-tool-marquee";
      div.style.position = "absolute";
      div.style.border = "1px dashed #e94560";
      div.style.background = "rgba(233,69,96,0.08)";
      div.style.pointerEvents = "none";
      div.style.zIndex = "40";
      container.appendChild(div);
      marquee = div;
    });

    stage.on("mousemove touchmove", function () {
      if (!drag.active) return;
      const pos = stage.getPointerPosition();
      if (pos) updateMarquee(drag.startX, drag.startY, pos.x, pos.y);
    });

    const finishGesture = function (): void {
      if (!drag.active) return;
      drag.active = false;
      const pos = stage.getPointerPosition();
      const px = pos ? pos.x : drag.startX;
      const py = pos ? pos.y : drag.startY;
      const dx = px - drag.startX;
      const dy = py - drag.startY;
      removeMarquee();
      if (!cleanedViewReady()) return;
      if (state.activeTool !== "text") return;
      if (_createLock) return;
      // Abort if the pointer ended on chrome (transform can steal the gesture).
      if (pos) {
        const endTarget = stage.getIntersection(pos);
        if (
          endTarget &&
          (hitTransformer(endTarget) ||
            hitExistingTextLayer(endTarget, stage) ||
            hitDetection(endTarget, stage))
        ) {
          return;
        }
      }
      _createLock = true;
      window.setTimeout(function () {
        _createLock = false;
      }, 400);

      if (Math.abs(dx) > 12 && Math.abs(dy) > 6) {
        // Paragraph text: marquee defines the box
        const a = stageToImg(drag.startX, drag.startY);
        const b = stageToImg(px, py);
        createAndEdit({
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          w: Math.abs(b.x - a.x),
          h: Math.abs(b.y - a.y),
        });
      } else {
        // Point text: default-size box at the click position
        const img = stageToImg(drag.startX, drag.startY);
        createAndEdit({ x: img.x, y: img.y, w: 200, h: 44 });
      }
    };

    stage.on("mouseup touchend", finishGesture);
  };
  bindWhenReady();
}
