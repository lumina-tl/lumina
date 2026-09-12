/* ── Lumina Canvas — Cursor management ── */
import { state } from "../state";
import { canvas } from "./index";

/** Global hover-cursor handler — keeps the cursor in sync with what's under
 * the mouse. Konva.Transformer sets an inline resize cursor on stage.content
 * (its anchor mouseenter) but never restores it after a resize drag ends,
 * leaving a stale cursor behind — even across tool switches. This handler
 * re-asserts the correct cursor on every mousemove, computing the resize
 * cursor per-anchor instead of deferring to Konva. */
let _cursorBound = false;
export function bindHoverCursor(): void {
  if (_cursorBound) return;
  _cursorBound = true;

  const toolCursor = function (): string {
    if (state.activeTool === "lasso" || state.activeTool === "rect")
      return "crosshair";
    if (state.activeTool === "text") return "text";
    // Paint tools hide the OS cursor — #paint-cursor renders crosshair /
    // icon / brush circle instead.
    if (
      state.activeTool === "brush" ||
      state.activeTool === "eraser" ||
      state.activeTool === "bucket" ||
      state.activeTool === "eyedropper"
    )
      return "none";
    return "default";
  };

  // Transformer anchors are named after the 8 resize handles, plus the
  // rotate handle ("rotater"). Konva maps these to CSS resize cursors (the
  // rotater defaults to crosshair) — we mirror that map.
  const anchorCursor: Record<string, string> = {
    "top-left": "nwse-resize",
    "top-right": "nesw-resize",
    "bottom-left": "nesw-resize",
    "bottom-right": "nwse-resize",
    "top-center": "ns-resize",
    "bottom-center": "ns-resize",
    "middle-left": "ew-resize",
    "middle-right": "ew-resize",
    rotater: "crosshair",
  };

  const setCursor = function (cursor: string): void {
    // Konva writes its (stale) cursor to stage.content — the element that
    // actually paints over the canvas — so re-assert there, not just on the
    // container, otherwise the inline style keeps winning.
    const stage = canvas.getStage();
    const container = document.getElementById("canvas-container");
    if (container) container.style.cursor = cursor;
    if (stage && stage.content) stage.content.style.cursor = cursor;
  };

  const bind = function (): void {
    const stage = canvas.getStage();
    const container = document.getElementById("canvas-container");
    if (!stage || !container) {
      setTimeout(bind, 500);
      return;
    }
    stage.on("mousemove", function (e) {
      // Panning owns the cursor
      if (container.style.cursor === "grabbing") return;
      const target = e.target;
      // Over a transformer anchor → set the matching resize cursor ourselves
      // so it keeps tracking even after Konva left a stale one behind.
      if (
        target &&
        target.getParent &&
        target.getParent()?.className === "Transformer"
      ) {
        // Konva names anchors "top-left _anchor" (name + ' _anchor') —
        // strip the suffix before looking up the CSS cursor.
        const name = target.name().replace(/ ?_anchor$/, "");
        if (anchorCursor[name]) {
          setCursor(anchorCursor[name]);
          return;
        }
      }
      let cursor = toolCursor();
      // Hovering interactive content → move affordance
      if (target && target !== stage && target.name() !== "bg") {
        const name = target.name();
        if (name !== "" && name !== "bg" && state.activeTool === "select") {
          cursor = "move";
        }
      }
      setCursor(cursor);
    });
    // Mouse leaving the canvas entirely → drop any stale resize cursor.
    stage.content.addEventListener("mouseleave", function () {
      if (stage.content) stage.content.style.cursor = "";
    });
  };
  bind();
}
