/** Text Tool — in-place editing (textarea overlay) */
import Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import { history } from "../../../history";
import {
  imgToStage,
  getEditor,
  setEditor,
  setEditingLayerId,
  getEditingLayerId,
} from "./shared";
import { layerTextNodes } from "./shared";
import { getTransformer } from "./transformer";
import {
  showFormatBar,
  updateFormatBar,
  updateFormatBarPosition,
  hideFormatBar,
  notifyTyping,
  setFormatBarDim,
} from "./format-bar";
import { resolveSpans, adjustSpansOnTextChange } from "./spans";
import { typeSection } from "../../../sidebar/type-section";
import type { PageLayer } from "../../../../types";

export interface TextSelectionRange {
  start: number;
  end: number;
}

let _savedSelection: TextSelectionRange | null = null;
let _isFormattingActive = false;

export function getEditorText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return (el.innerText || el.textContent || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderEditorContent(ta: HTMLElement, lay: PageLayer): void {
  const text = lay.translation || lay.source || "";
  const typo = lay.typography;
  const resolved = resolveSpans(text, typo, lay.spans);
  let html = "";
  for (const span of resolved) {
    const styles: string[] = [];
    if (span.color) styles.push(`color: ${span.color}`);
    if (span.fontFamily) styles.push(`font-family: ${span.fontFamily}`);
    if (span.fontWeight) styles.push(`font-weight: ${span.fontWeight}`);
    if (span.fontStyle) styles.push(`font-style: ${span.fontStyle}`);
    const styleAttr =
      styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
    html += `<span${styleAttr}>${escapeHtml(span.text)}</span>`;
  }
  ta.innerHTML = html || "<br>";
}

function getCaretOffset(element: HTMLElement): TextSelectionRange {
  if (element instanceof HTMLTextAreaElement) {
    return { start: element.selectionStart, end: element.selectionEnd };
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
  const range = sel.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return { start: 0, end: 0 };
  }
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  preRange.setEnd(range.endContainer, range.endOffset);
  const end = preRange.toString().length;
  return { start, end };
}

function setCaretOffset(
  element: HTMLElement,
  start: number,
  end: number,
): void {
  if (element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(start, end);
    return;
  }
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let current = 0;
  let startNode: Node | null = null;
  let startOff = 0;
  let endNode: Node | null = null;
  let endOff = 0;

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length || 0;
      if (!startNode && start >= current && start <= current + len) {
        startNode = node;
        startOff = start - current;
      }
      if (!endNode && end >= current && end <= current + len) {
        endNode = node;
        endOff = end - current;
      }
      current += len;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i]);
      }
    }
  }

  traverse(element);

  if (startNode && endNode) {
    try {
      range.setStart(startNode, startOff);
      range.setEnd(endNode, endOff);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      /* ignore */
    }
  }
}

export function getEditorSelection(): TextSelectionRange | null {
  return _savedSelection;
}

export function saveEditorSelection(): void {
  const ta = getEditor();
  if (!ta) return;
  _savedSelection = getCaretOffset(ta);
}

export function restoreEditorSelection(): void {
  const ta = getEditor();
  if (!ta || !_savedSelection) return;
  setCaretOffset(ta, _savedSelection.start, _savedSelection.end);
}

export function syncEditorSpans(lay: PageLayer): void {
  const ta = getEditor();
  if (!ta) return;
  const sel = getEditorSelection();
  renderEditorContent(ta, lay);
  if (sel) {
    setCaretOffset(ta, sel.start, sel.end);
    saveEditorSelection();
  }
}

/** Check if click target belongs to typography inspector, font picker, or floating toolbar */
export function isFormattingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "#type-section, .font-picker-panel, .font-picker, #text-format-bar, input[type='color']",
    ),
  );
}

/** Commit and remove editor. Empty text on existing layer deletes it. */
export function removeEditor(commit: boolean): void {
  const ta = getEditor();
  if (!ta) return;
  const id = getEditingLayerId();
  hideFormatBar();
  _savedSelection = null;
  // Capture unrotated layout size BEFORE textarea is removed.
  // Using getBoundingClientRect() would return the expanded AABB for rotated boxes.
  const w = ta.offsetWidth;
  const h = ta.offsetHeight;
  setEditor(null);
  setEditingLayerId(null);
  ta.remove();
  if (commit && id) {
    const value = getEditorText(ta).trim();
    // Sync the textarea's (possibly resized) box back to the layer — the
    // text box can be resized while editing, Photoshop-style.
    const page = state.getActivePage();
    const lay = page
      ? page.layers.find(function (l) {
          return l.id === id;
        })
      : null;
    if (lay) {
      const sr = canvas.getScaleRatio();
      lay.bbox.w = Math.max(8, Math.round(w / sr));
      lay.bbox.h = Math.max(8, Math.round(h / sr));
      lay.spans = adjustSpansOnTextChange(lay.spans, value.length);
    }
    if (!value) {
      canvas.deleteLayer(id); // emptied text deletes the layer
    } else {
      canvas.setLayerText(id, "translation", value);
    }
  } else {
    canvas.render(); // restore hidden node visuals
  }
}

/** True when the last pointer press (in stage coords) falls on the edited
 * box or its transformer handles — those presses keep the editor open
 * (reposition caret, resize via anchor) instead of exiting edit mode. */
function _pressInsideBox(): boolean {
  const stage = canvas.getStage();
  const id = getEditingLayerId();
  if (!stage || !id) return false;
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === id;
  });
  if (!node) return false;
  const pos = stage.getPointerPosition();
  if (!pos) return false;
  const box = node.getClientRect();
  const M = 12; // transformer padding (6) + half anchor (4) + slack
  return (
    pos.x >= box.x - M &&
    pos.x <= box.x + box.width + M &&
    pos.y >= box.y - M &&
    pos.y <= box.y + box.height + M
  );
}

/** Any press outside the edited box while editing exits edit mode — even if
 * the textarea already lost focus (a suppressed blur), so the editor can't
 * get stuck open. */
document.addEventListener("mousedown", function (e: MouseEvent) {
  if (!getEditor() || !getEditingLayerId()) return;
  const target = e.target as HTMLElement | null;
  if (isFormattingTarget(target)) {
    _isFormattingActive = true;
    return;
  }
  _isFormattingActive = false;
  if (!_pressInsideBox()) removeEditor(true);
});

document.addEventListener("mouseup", function () {
  if (_isFormattingActive) {
    setTimeout(() => {
      _isFormattingActive = false;
    }, 150);
  }
});

/** Vertically center single-line content (Photoshop-like). */
function _fitLineHeight(ta: HTMLElement): void {
  ta.style.lineHeight = "1.25";
}

/** Show a contenteditable div positioned exactly over the layer's box — live preview */
export function startEdit(layerId: string): void {
  const page = state.getActivePage();
  const konvaLayer = canvas.getLayer();
  if (!page || !konvaLayer || getEditor()) return;
  const lay = page.layers.find(function (l) {
    return l.id === layerId;
  });
  if (!lay) return;
  const initial = lay.translation || lay.source || "";

  const sr = canvas.getScaleRatio();
  const p = imgToStage(lay.bbox.x, lay.bbox.y);
  const typo = lay.typography;

  const ta = document.createElement("div");
  ta.id = "text-tool-editor";
  ta.contentEditable = "true";
  ta.style.position = "absolute";
  ta.style.background = "rgba(14,14,16,0.35)";
  ta.style.color = typo.color;
  ta.style.border = "none";
  ta.style.borderRadius = "2px";
  ta.style.padding = "0";
  ta.style.margin = "0";
  ta.style.fontFamily = typo.fontFamily || "Arial, sans-serif";
  ta.style.fontStyle = typo.fontStyle;
  ta.style.fontWeight = String(typo.fontWeight);
  ta.style.textAlign = typo.align;
  ta.style.outline = "none";
  ta.style.overflow = "hidden";
  ta.style.zIndex = "50";
  ta.style.userSelect = "text";
  ta.style.whiteSpace = "pre-wrap";
  ta.style.wordBreak = "break-word";
  ta.style.display = "flex";
  ta.style.flexDirection = "column";
  ta.style.justifyContent = "center";

  renderEditorContent(ta, lay);

  // Hide only the text glyphs while editing — the textarea/div IS the preview.
  // The box stays visible so the transformer stays attached and the box can
  // be resized with real handles while typing (Photoshop behavior).
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === layerId;
  });
  if (node) {
    const glyphs = node.findOne(".layer-text-glyphs");
    if (glyphs) glyphs.visible(false);
  }
  // Re-assert selection on the edited box — onToolChange() cleared
  // _selectedLayerId when switching to the text tool, so re-attach here.
  page._selectedLayerId = layerId;
  const tr = getTransformer();
  if (tr && node) {
    tr.nodes([node]);
    node.draggable(true);
  }
  konvaLayer.draw();

  ta.addEventListener("mousedown", function (e) {
    e.stopPropagation();
  });
  ta.addEventListener("keydown", function (e) {
    notifyTyping();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        history.redo();
      } else {
        history.undo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      e.stopPropagation();
      history.redo();
      return;
    }
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      removeEditor(false);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      removeEditor(true);
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
    }
  });
  const onSelectionChanged = () => {
    saveEditorSelection();
    updateFormatBar(lay);
    typeSection.refresh();
  };

  ta.addEventListener("input", function () {
    notifyTyping();
    saveEditorSelection();
    const curLen = getEditorText(ta).length;
    lay.spans = adjustSpansOnTextChange(lay.spans, curLen);
    updateFormatBar(lay);
  });
  ta.addEventListener("mouseenter", function () {
    setFormatBarDim(true);
  });
  ta.addEventListener("mouseleave", function () {
    setFormatBarDim(false);
  });
  ta.addEventListener("select", onSelectionChanged);
  ta.addEventListener("mouseup", onSelectionChanged);
  ta.addEventListener("keyup", onSelectionChanged);
  ta.addEventListener("blur", function (e: FocusEvent) {
    saveEditorSelection();
    // Clicking the transformer handles or the box edge keeps the editor
    // open — only exit when focus leaves the text area for real.
    if (_pressInsideBox()) return;
    if (
      _isFormattingActive ||
      isFormattingTarget(e.relatedTarget) ||
      isFormattingTarget(document.activeElement)
    ) {
      return;
    }
    setTimeout(() => {
      if (
        _isFormattingActive ||
        isFormattingTarget(document.activeElement) ||
        !getEditor()
      ) {
        return;
      }
      removeEditor(true);
    }, 120);
  });

  canvas.getStage()?.container().appendChild(ta);
  setEditor(ta);
  setEditingLayerId(layerId);
  syncEditorBox();
  showFormatBar(layerId);
  ta.focus();
  setCaretOffset(ta, 0, initial.length);
  saveEditorSelection();
}

/** Re-apply editing visuals after canvas.render() (zoom/pan/resize). */
export function refreshEditingState(): void {
  const id = getEditingLayerId();
  const ta = getEditor();
  if (!id || !ta) return;
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === id;
  });
  if (!node) return;
  const glyphs = node.findOne(".layer-text-glyphs");
  if (glyphs) glyphs.visible(false);
  const tr = getTransformer();
  if (tr) {
    tr.nodes([node]);
    node.draggable(true);
  }
  const page = state.getActivePage();
  const lay = page?.layers.find((l) => l.id === id);
  if (lay) {
    renderEditorContent(ta, lay);
    updateFormatBar(lay);
  }
  syncEditorBox();
}

/** Re-position/resize the editor textarea to the layer's current box —
 * called after the box is resized via the transformer while editing. */
export function syncEditorBox(): void {
  const ta = getEditor();
  const id = getEditingLayerId();
  if (!ta || !id) return;
  const page = state.getActivePage();
  if (!page) return;
  const lay = page.layers.find(function (l) {
    return l.id === id;
  });
  if (!lay) return;
  const sr = canvas.getScaleRatio();
  const p = imgToStage(lay.bbox.x, lay.bbox.y);
  const w = Math.max(8, lay.bbox.w * sr);
  const h = Math.max(8, lay.bbox.h * sr);
  ta.style.left = p.x + "px";
  ta.style.top = p.y + "px";
  ta.style.width = w + "px";
  ta.style.height = h + "px";
  const fs = (lay.typography.fontSize || Math.max(8, lay.bbox.h * 0.6)) * sr;
  ta.style.fontSize = fs + "px";
  const typo = lay.typography;
  ta.style.color = typo.color;
  ta.style.fontFamily = typo.fontFamily || "Arial, sans-serif";
  ta.style.fontStyle = typo.fontStyle;
  ta.style.fontWeight = String(typo.fontWeight);
  ta.style.textAlign = typo.align;
  // Match the box rotation — Konva.Group rotates around its top-left (p.x, p.y),
  // so the textarea must also rotate around "0 0" (top-left) to align with the transformer.
  const rot = lay.bbox.rotation || lay.typography.rotation || 0;
  if (rot !== 0) {
    ta.style.transformOrigin = "0 0";
    ta.style.transform = "rotate(" + rot + "deg)";
  } else {
    ta.style.transformOrigin = "";
    ta.style.transform = "";
  }
  _fitLineHeight(ta);
  updateFormatBar(lay);
  updateFormatBarPosition();
}
