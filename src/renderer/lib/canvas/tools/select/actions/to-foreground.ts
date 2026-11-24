/** Select action — convert selection into a foreground object cutout layer. */
import { state } from "../../../../state";
import { history } from "../../../../history";
import { canvas } from "../../../index";
import { sidebar } from "../../../../sidebar";
import { ui } from "../../../../ui";
import * as i18n from "../../../../i18n";
import { defaultTypography } from "../../../../../types";
import type { PageLayer } from "../../../../../types";
import {
  selections,
  clearSelections,
  selectionAABB,
  isHoleShape,
} from "../shared";
import { refreshOverlay } from "../render";
import { hideContextBar } from "../context-bar";
import { getPageRasterSource } from "../../../render";

export async function toForeground(): Promise<void> {
  const page = state.getActivePage();
  if (!page || !page.image) return;
  const selList = selections.slice();
  if (!selList.length) return;

  let createdCount = 0;

  for (const s of selList) {
    if (!s.shapes.length) continue;
    const aabb = selectionAABB(s);
    const x = Math.max(0, Math.round(aabb.x));
    const y = Math.max(0, Math.round(aabb.y));
    const x2 = Math.min(page.naturalWidth, Math.round(aabb.x + aabb.w));
    const y2 = Math.min(page.naturalHeight, Math.round(aabb.y + aabb.h));
    const w = x2 - x;
    const h = y2 - y;
    if (w < 4 || h < 4) continue;

    // Create offscreen canvas for the cutout
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) continue;

    ctx.beginPath();
    for (const shape of s.shapes) {
      if (isHoleShape(s.shapes, shape)) continue;
      if (shape.kind === "rect") {
        ctx.rect(shape.x - x, shape.y - y, shape.w, shape.h);
      } else if (shape.kind === "polygon") {
        shape.points.forEach((pt, idx) => {
          const px = pt.x - x;
          const py = pt.y - y;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
    }
    ctx.clip();

    // Draw from current raster (composite with inpaint patches + cleanup if present)
    const rasterSource = getPageRasterSource(page) || page.image;
    ctx.drawImage(rasterSource, x, y, w, h, 0, 0, w, h);

    // Save PNG into temp cache for persistence
    let imagePath: string | null = null;
    try {
      const blob: Blob | null = await new Promise((res) =>
        c.toBlob(res, "image/png"),
      );
      if (blob) {
        const buf = await blob.arrayBuffer();
        const res = await window.lumina.writeTempPng({
          data: new Uint8Array(buf),
          subdir: "cutouts",
          name: "object",
        });
        imagePath = res.path;
      }
    } catch (e) {
      console.warn("Failed to write cutout PNG:", e);
    }

    const objectCount = page.layers.filter((l) => l.type === "image").length;
    const newLayer: PageLayer = {
      id: "layer-obj-" + Date.now() + "-" + createdCount,
      type: "image",
      name: i18n.t("layers.foregroundObject", { count: objectCount + 1 }),
      bbox: { x, y, w, h, rotation: 0 },
      visible: true,
      opacity: 1,
      typography: defaultTypography(),
      imageCanvas: c,
      imagePath: imagePath || undefined,
    };

    // Smart Stacking: find intersecting text layers
    const intersectingTextLayers: Array<{
      layer: PageLayer;
      index: number;
      overlapRatio: number;
    }> = [];

    page.layers.forEach((l, idx) => {
      if (l.type === "image") return;
      const ix0 = Math.max(x, l.bbox.x);
      const iy0 = Math.max(y, l.bbox.y);
      const ix1 = Math.min(x2, l.bbox.x + l.bbox.w);
      const iy1 = Math.min(y2, l.bbox.y + l.bbox.h);
      const iw = ix1 - ix0;
      const ih = iy1 - iy0;
      if (iw > 0 && ih > 0) {
        const overlapArea = iw * ih;
        const textArea = Math.max(1, l.bbox.w * l.bbox.h);
        intersectingTextLayers.push({
          layer: l,
          index: idx,
          overlapRatio: overlapArea / textArea,
        });
      }
    });

    let insertIdx = 0;
    if (page._selectedLayerId) {
      // Respect explicit user layer selection
      const curIdx = page.layers.findIndex(
        (l) => l.id === page._selectedLayerId,
      );
      if (curIdx >= 0) {
        insertIdx = curIdx;
      }
    } else if (intersectingTextLayers.length >= 2) {
      // Multiple text layers: sandwich object between them (behind topmost text, in front of lower text)
      insertIdx = intersectingTextLayers[0].index + 1;
    } else if (intersectingTextLayers.length === 1) {
      const target = intersectingTextLayers[0];
      // If text is mostly inside the cutout (> 50% coverage, e.g. text inside this bubble),
      // keep the text in front (insert behind it: index + 1) so it doesn't disappear!
      // If it's an outside crossing obstacle (<= 50% coverage, e.g. hand/edge),
      // place object in front of the text (insert at target.index).
      if (target.overlapRatio > 0.5) {
        insertIdx = target.index + 1;
      } else {
        insertIdx = target.index;
      }
    } else {
      insertIdx = 0;
    }

    page.layers.splice(insertIdx, 0, newLayer);
    page._selectedLayerId = newLayer.id;
    page._selectedLayerIds = [newLayer.id];
    createdCount++;
  }

  clearSelections();
  refreshOverlay();
  hideContextBar();

  if (createdCount > 0) {
    canvas.render();
    sidebar.render();
    history.snapshot();
    ui.toast(i18n.t("toast.foregroundCreated"), "success", 3000);
  }
}
