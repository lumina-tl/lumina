/** Text Tool — node lifecycle & event wiring (called from render.ts) */
import Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import { sidebar } from "../../../sidebar";
import { history } from "../../../history";
import { tools } from "../../../ui/tools";
import {
  layerTextNodes,
  isEditing,
  stageToImg,
  getEditingLayerId,
} from "./shared";

// Manual double-click detection. selectLayer() full-renders, which destroys
// the node mid-gesture and breaks Konva's native dblclick — a timestamp
// check in the click handler is immune to that.
const _lastClickAt: Record<string, number> = {};
let _multiDragStarts: Map<Konva.Node, { x: number; y: number }> | null = null;
let _dragLeaderStart: { x: number; y: number } | null = null;
import { makeNode } from "./node-factory";
import {
  syncTransformerSelection,
  onNodeTransformEnd,
  resetTransformer,
  getTransformer,
  getTransformers,
} from "./transformer";
import { getEditor } from "./shared";
import {
  startEdit,
  syncEditorBox,
  refreshEditingState,
  restoreEditorSelection,
} from "./editor";

/** Rebuild all layer text nodes on stage (one Konva.Text per layer). */
export function renderLayerTextNodes(): void {
  const konvaLayer = canvas.getLayer();
  const page = state.getActivePage();
  layerTextNodes.forEach(function (n) {
    n.destroy();
  });
  layerTextNodes.length = 0;
  resetTransformer();
  if (!konvaLayer || !page) return;

  (page.layers || [])
    .slice()
    .reverse()
    .forEach(function (lay) {
      if (!lay.visible) return;
      // OCR/translation of dialogue layers only appears after inpainting —
      // before that the canvas shows the untouched original + boxes.
      if (lay.type === "text-dialogue" && page.inpaintMasks.length === 0)
        return;
      const text = lay.translation || lay.source || "";
      if (!text) return;
      const node = makeNode(lay, text);
      node.on("click tap", function (e) {
        e.cancelBubble = true;
        if (isEditing()) return;
        // Paint tools own the pointer — brush/eraser/bucket/eyedropper must
        // never select text layers underneath.
        const t = state.activeTool;
        if (
          t === "brush" ||
          t === "eraser" ||
          t === "bucket" ||
          t === "eyedropper"
        )
          return;
        const now = Date.now();
        if (now - (_lastClickAt[lay.id] || 0) < 350) {
          // Double-click → edit in place (switching to the text tool first).
          delete _lastClickAt[lay.id];
          if (state.activeTool !== "text") tools.setActive("text");
          startEdit(lay.id);
          // Also expand the sidebar editor for this layer.
          canvas.expandLayer(lay.id);
          return;
        }
        _lastClickAt[lay.id] = now;
        // Click = select (shows transform handles).
        const isToggle = !!(
          e.evt &&
          (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)
        );
        canvas.selectLayer(lay.id, { toggle: isToggle });
        syncTransformerSelection();
        canvas.getLayer()?.draw();
      });
      node.on("dragstart", function () {
        const page = state.getActivePage();
        const selIds =
          page?._selectedLayerIds && page._selectedLayerIds.length > 0
            ? page._selectedLayerIds
            : page?._selectedLayerId
              ? [page._selectedLayerId]
              : [];
        if (!selIds.includes(lay.id)) {
          canvas.selectLayer(lay.id);
        }
        const activeSelIds = page?._selectedLayerIds || [lay.id];
        const selectedNodes = activeSelIds
          .map((id) => layerTextNodes.find((n) => n.getAttr("layerId") === id))
          .filter((n): n is Konva.Group => !!n);

        if (selectedNodes.length > 1 && selectedNodes.includes(node)) {
          _multiDragStarts = new Map();
          selectedNodes.forEach((n) => {
            _multiDragStarts!.set(n, { x: n.x(), y: n.y() });
          });
          _dragLeaderStart = { x: node.x(), y: node.y() };
        } else {
          _multiDragStarts = null;
          _dragLeaderStart = null;
        }
      });
      node.on("dragmove", function () {
        if (_multiDragStarts && _dragLeaderStart) {
          const dx = node.x() - _dragLeaderStart.x;
          const dy = node.y() - _dragLeaderStart.y;
          _multiDragStarts.forEach((pos, other) => {
            if (other !== node) {
              other.position({ x: pos.x + dx, y: pos.y + dy });
            }
          });
          getTransformers().forEach((tr) => tr.forceUpdate());
        }
      });
      node.on("dragend", function () {
        // Dragging moves the whole group; node.x()/y() is its local top-left
        // (already rotated with the group) — commit directly. Using the AABB
        // would shift the box for non-cardinal rotations.
        if (_multiDragStarts) {
          const activeSelIds = page?._selectedLayerIds || [lay.id];
          const selectedNodes = activeSelIds
            .map((id) => layerTextNodes.find((n) => n.getAttr("layerId") === id))
            .filter((n): n is Konva.Group => !!n);
          selectedNodes.forEach((n) => {
            const img = stageToImg(n.x(), n.y());
            const target = page.layers.find(function (l) {
              return l.id === (n.getAttr("layerId") as string);
            });
            if (target) {
              target.bbox.x = img.x;
              target.bbox.y = img.y;
            }
          });
          _multiDragStarts = null;
          _dragLeaderStart = null;
          getTransformers().forEach((tr) => tr.forceUpdate());
          history.snapshot();
        } else {
          const img = stageToImg(node.x(), node.y());
          const target = page.layers.find(function (l) {
            return l.id === (node.getAttr("layerId") as string);
          });
          if (target) {
            target.bbox.x = img.x;
            target.bbox.y = img.y;
            history.snapshot();
          }
        }
        sidebar.render();
      });
      node.on("transformend", function () {
        // Multi-node transform is handled on the Transformer instance;
        // single-node transform falls back here if not handled by transformer.
        const tr = getTransformer();
        const trNodes = tr?.nodes() || [];
        if (trNodes.length <= 1) {
          onNodeTransformEnd(node);
        }
        // Box was resized with the transformer while editing — onNodeTransformEnd()
        // full-renders, so re-hide the fresh node's glyphs, keep the handles
        // attached and move the textarea to the new box.
        if (getEditingLayerId() === lay.id) {
          refreshEditingState();
          const ta = getEditor();
          if (ta) {
            ta.focus();
            restoreEditorSelection();
          }
        }
      });
      konvaLayer.add(node);
      layerTextNodes.push(node);
    });

  syncTransformerSelection();
  konvaLayer.draw();
  // Full render (zoom/pan) while editing must not show the committed text
  // as a "shadow" under the textarea — re-hide glyphs + re-sync the editor.
  refreshEditingState();
}
