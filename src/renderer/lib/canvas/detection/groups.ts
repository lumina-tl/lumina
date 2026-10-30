/** Lumina Canvas — Detection group factories & bbox sync helpers */
import Konva from "konva";
import { state, CONST } from "../../state";
import { canvas } from "../index";
import { contextMenu, type MenuItem } from "../../ui/context-menu";
import { history } from "../../history";
import { sidebar } from "../../sidebar";
import { models } from "../../models";
import { ocr } from "../../pipeline/ocr";
import * as i18n from "../../i18n";
import type { BBox, TextDetection } from "../../../types";
import { groupRegistry } from "./group-registry";
import { applyTextSelection } from "./selection";

// ── Transformer accessors (called from render.ts) ──

canvas._setTextTransformer = function (t) {
  groupRegistry.setTextTransformer(t);
};

canvas._getTextTransformer = function () {
  return groupRegistry.getTextTransformer();
};

// ── Re-OCR submenu children: one row per installed OCR model ──

const BADGE_H = 16;
const BADGE_GAP = 2;
const BADGE_W = 28;

/** "Re-OCR" context-menu items — run OCR on a detection with chosen model. */
function _ocrReRunItems(idx: number): MenuItem[] {
  const current = models.selectedModel("ocr");
  return models
    .list()
    .filter(function (m) {
      return m.kind === "ocr";
    })
    .map(function (m): MenuItem {
      return {
        label: m.name,
        title: m.ready ? undefined : i18n.t("models.missing"),
        checked: m.id === current,
        disabled: !m.ready,
        action: function () {
          void ocr.runBoxes([idx], m.id);
        },
      };
    });
}

// ── Helpers ──

/** Stroke rect inside a detection group — Konva name selector needs the dot. */
export function detBoxRect(group: Konva.Group): Konva.Rect | null {
  return group.findOne<Konva.Rect>(".det-box") ?? null;
}

/** Badge is a LAYER sibling (not a child) so Transformer bounds match the box. */
function _badgeOf(group: Konva.Group): Konva.Group | null {
  const b = group.getAttr("badgeNode");
  return b instanceof Konva.Group ? b : null;
}

function _syncBadgePos(group: Konva.Group): void {
  const badge = _badgeOf(group);
  if (!badge) return;
  badge.position({
    x: group.x(),
    y: group.y() - (BADGE_H + BADGE_GAP),
  });
  badge.scaleX(1);
  badge.scaleY(1);
  badge.rotation(0);
}

function _syncBboxFromGroup(
  groups: Konva.Group[],
  dets: Array<{ bbox: BBox }>,
  idx: number,
): void {
  const group = groups[idx];
  const det = dets[idx];
  if (!group || !det) return;
  // Always read live scale/offset — create-time closures go stale after
  // zoom/pan and OCR would crop the original box forever.
  const sr = canvas.getScaleRatio() || 1;
  const off = canvas.getOffset();
  const rect = detBoxRect(group);
  const w = rect ? rect.width() : group.width();
  const h = rect ? rect.height() : group.height();
  det.bbox.x = Math.round((group.x() - off.x) / sr);
  det.bbox.y = Math.round((group.y() - off.y) / sr);
  // Floor at 8 image-px — a 1px box is an unusable hit target (usually from
  // fighting the Transformer mid-resize).
  det.bbox.w = Math.max(8, Math.round(w / sr));
  det.bbox.h = Math.max(8, Math.round(h / sr));
}

/**
 * Commit detection group geometry → textDetections[idx] only.
 * Dialogue text-layer bbox is independent — once the user typesets /
 * moves a text box, resizing a green det must not yank it back.
 * OCR / inpaint read detections; canvas text nodes read layers.
 */
function _syncTextBboxFromGroup(idx: number): void {
  const page = state.getActivePage();
  if (!page) return;
  _syncBboxFromGroup(groupRegistry.textGroups(), page.textDetections, idx);
}

/** Bake any on-stage detection transforms into the model before OCR/inpaint. */
export function flushDetBboxes(): void {
  const page = state.getActivePage();
  if (!page) return;
  // Finish any in-flight Transformer scale bake first.
  groupRegistry.textGroups().forEach(function (g) {
    _bakeGroupTransform(g);
  });
  for (let i = 0; i < page.textDetections.length; i++) {
    _syncTextBboxFromGroup(i);
  }
}

/** Resize the green rect + reflow OCR label (same bake path as text boxes). */
export function layoutDetGroup(group: Konva.Group, w: number, h: number): void {
  const nw = Math.max(4, w);
  const nh = Math.max(4, h);
  group.width(nw);
  group.height(nh);
  const rect = detBoxRect(group);
  if (rect) {
    rect.width(nw);
    rect.height(nh);
    rect.scaleX(1);
    rect.scaleY(1);
    rect.x(0);
    rect.y(0);
    rect.cornerRadius(2);
  }
  group.getChildren().forEach(function (child) {
    if (child instanceof Konva.Text) {
      child.scaleX(1);
      child.scaleY(1);
      child.x(4);
      child.width(Math.max(1, nw - 8));
      child.height(Math.max(1, nh - 4));
    }
  });
  _syncBadgePos(group);
}

/**
 * Bake Transformer scale on the GROUP into box width/height — identical to
 * the text-layer transform path. Badge is a sibling so it never stretches.
 */
function _bakeGroupTransform(group: Konva.Group): void {
  const sx = group.scaleX();
  const sy = group.scaleY();
  if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) {
    _syncBadgePos(group);
    return;
  }
  const rect = detBoxRect(group);
  const baseW = rect ? rect.width() : group.width();
  const baseH = rect ? rect.height() : group.height();
  const newW = Math.max(4, Math.abs(baseW * sx));
  const newH = Math.max(4, Math.abs(baseH * sy));
  group.scaleX(1);
  group.scaleY(1);
  layoutDetGroup(group, newW, newH);
  groupRegistry.textTransformer()?.forceUpdate();
}

function _makeBadge(idx: number, x: number, y: number): Konva.Group {
  // Badge is a layer sibling (not inside the det group) so Transformer
  // bounds stay box-only — but it must still receive hits to select.
  const bg = new Konva.Group({
    x: x,
    y: y - (BADGE_H + BADGE_GAP),
    name: "det-badge",
    listening: true,
  });
  bg.add(
    new Konva.Rect({
      width: BADGE_W,
      height: BADGE_H,
      cornerRadius: 8,
      fill: canvas.TEXT_COLOR,
      listening: true,
    }),
  );
  bg.add(
    new Konva.Text({
      text: "T" + (idx + 1),
      fontSize: 10,
      fontFamily: CONST.FONT_FAMILY,
      fontStyle: "bold",
      fill: "#000",
      width: BADGE_W,
      align: "center",
      y: 2,
      listening: false,
    }),
  );
  return bg;
}

// ── Group factories ──

canvas._createTextGroup = function (
  det: TextDetection,
  idx: number,
  sr: number,
  off: { x: number; y: number },
): Konva.Group {
  const x = off.x + det.bbox.x * sr;
  const y = off.y + det.bbox.y * sr;
  const w = Math.max(1, det.bbox.w * sr);
  const h = Math.max(1, det.bbox.h * sr);

  // Same structure as text layers: transformable group = box + content only.
  // Badge is a layer sibling so Transformer client-rect matches the box.
  const group = new Konva.Group({
    name: "det-group",
    x: x,
    y: y,
    width: w,
    height: h,
    listening:
      state.showDetBoxes &&
      (state.activeTool === "select" ||
        state.activeTool === "text" ||
        state.activeTool === "lasso" ||
        state.activeTool === "rect"),
    draggable:
      state.showDetBoxes &&
      (state.activeTool === "select" ||
        state.activeTool === "text" ||
        state.activeTool === "lasso" ||
        state.activeTool === "rect"),
  });

  const boxRect = new Konva.Rect({
    name: "det-box",
    width: w,
    height: h,
    stroke: canvas.TEXT_COLOR,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    cornerRadius: 2,
    fill: "rgba(0,255,136,0.08)",
  });
  group.add(boxRect);

  const ocrText = det.text ? det.text : "";
  group.add(
    new Konva.Text({
      text: ocrText || (det.type === "text_bubble" ? "bubble" : "free"),
      fontSize: 9 * sr,
      fontFamily: CONST.FONT_FAMILY,
      fill: ocrText ? canvas.TEXT_COLOR : "#888",
      x: 4,
      y: 2,
      width: Math.max(1, w - 8),
      height: Math.max(1, h - 4),
      wrap: "none",
      listening: false,
    }),
  );

  const badge = _makeBadge(idx, x, y);
  group.setAttr("badgeNode", badge);

  // Select on press / dragstart so drag already shows handles (not after click).
  // Always re-apply — skipping when already selected left stroke stuck at 1px.
  const selectDet = function (): void {
    canvas.selectTextDetection(idx);
  };
  const paintBlocked = function (): boolean {
    const t = state.activeTool;
    return (
      t === "brush" ||
      t === "eraser" ||
      t === "bucket" ||
      t === "eyedropper"
    );
  };
  const wireSelect = function (node: Konva.Node): void {
    node.on("mousedown touchstart", function (e) {
      e.cancelBubble = true;
      if (paintBlocked()) return;
      selectDet();
    });
    node.on("click tap", function (e) {
      e.cancelBubble = true;
      if (paintBlocked()) return;
      selectDet();
    });
    node.on("contextmenu", function (e) {
      e.cancelBubble = true;
      e.evt.preventDefault();
      if (paintBlocked()) return;
      canvas.selectTextDetection(idx);
      const page = state.getActivePage();
      if (!page) return;
      const reOcrItems = _ocrReRunItems(idx);
      contextMenu.show(e.evt.clientX, e.evt.clientY, [
        {
          labelKey: "ctx.delete",
          danger: true,
          action: function () {
            canvas.deleteTextDetection(idx);
          },
        },
        {
          labelKey: "ctx.cycleStatus",
          action: function () {
            const d = page.textDetections[idx];
            if (!d) return;
            d.status =
              d.status === "auto"
                ? "rejected"
                : d.status === "rejected"
                  ? "adjusted"
                  : "auto";
            canvas._refreshTextGroup(idx);
            history.snapshot();
          },
        },
        ...(reOcrItems.length
          ? [
              {
                labelKey: "ctx.reOcr",
                separatorBefore: true,
                children: reOcrItems,
              },
            ]
          : []),
        {
          labelKey: "ctx.deselect",
          separatorBefore: true,
          action: function () {
            canvas.selectTextDetection(null);
          },
        },
      ]);
    });
    node.on("dblclick dbltap", function (e) {
      e.cancelBubble = true;
      if (paintBlocked()) return;
      const page = state.getActivePage();
      if (!page) return;
      const d = page.textDetections[idx];
      d.status =
        d.status === "auto"
          ? "rejected"
          : d.status === "rejected"
            ? "adjusted"
            : "auto";
      canvas._refreshTextGroup(idx);
      history.snapshot();
    });
  };
  wireSelect(group);
  wireSelect(badge);
  group.on("dragstart", function () {
    // Always re-apply chrome — selectDet no-ops when already selected, which
    // left the box stuck at 1px stroke after a prior overlay fight.
    canvas.selectTextDetection(idx);
  });
  group.on("dragmove", function () {
    _syncBadgePos(group);
    _syncTextBboxFromGroup(idx);
  });
  group.on("dragend", function () {
    _syncBadgePos(group);
    _syncTextBboxFromGroup(idx);
    applyTextSelection(idx);
    history.snapshot();
  });

  // Bake scale into width each frame (Transformer expects scale reset to 1).
  // Do NOT sync the model here — mid-resize commits fought the Transformer
  // and collapsed boxes to 1 image-px.
  group.on("transform", function () {
    _bakeGroupTransform(group);
  });
  group.on("transformend", function () {
    _bakeGroupTransform(group);
    _syncTextBboxFromGroup(idx);
    const page = state.getActivePage();
    if (!page || !page.textDetections[idx]) return;
    if (page.textDetections[idx].status === "auto") {
      page.textDetections[idx].status = "adjusted";
    }
    canvas.render();
    applyTextSelection(page._selectedTextIdx ?? null);
    sidebar.render();
    history.snapshot();
  });

  groupRegistry.pushTextGroup(group);
  return group;
};

/** Add the detection group + its badge sibling to the Konva layer. */
export function addDetGroupToLayer(
  layer: Konva.Layer,
  group: Konva.Group,
): void {
  layer.add(group);
  const badge = _badgeOf(group);
  if (badge) layer.add(badge);
}
