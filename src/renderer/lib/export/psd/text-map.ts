/** Map Lumina PageLayer → PSD editable text layer. */
import type { Layer } from "ag-psd";
import type { PageLayer } from "../../../types";
import { fitTextToBox } from "../../canvas/tools/text/font-fit";
import { wordWrap } from "../../canvas/tools/text/font-fit";
import { resolvePsFont } from "./fonts";
import { bboxToTransform, bboxToBoxBounds } from "./transform";

/** Parse hex color string → PSD {r, g, b} (0-255). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h,
    16,
  );
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Map Lumina align → PSD justification. */
function mapJustification(align: string): "left" | "center" | "right" {
  if (align === "right") return "right";
  if (align === "center") return "center";
  return "left";
}

/**
 * Convert a PageLayer to a PSD text layer descriptor.
 * Returns `null` if layer has no renderable text.
 */
export function mapLayerToPsdText(
  layer: PageLayer,
  offsetX = 0,
  offsetY = 0,
): Layer | null {
  const text = layer.translation || layer.source || "";
  if (!text) return null;

  const t = layer.typography;
  const bbox = layer.bbox;

  // Resolve auto-fit fontSize (null = auto-fit to bbox)
  let fontSize = t.fontSize;
  if (fontSize === null) {
    const fit = fitTextToBox(text, bbox.w, bbox.h, t);
    fontSize = fit.fontSize;
  }

  // Wrap text to fit bbox width (same logic as node-factory)
  const chars = text.replace(/[\s\n]/g, "").length;
  const maxW = bbox.w * 0.76; // default widthUsageRatio
  const wrapped = t.rotation
    ? text.replace(/\n/g, "\r") // vertical rotation — preserve explicit newlines
    : wordWrap(text, fontSize, t, maxW).join("\r");

  // Build PSD text descriptor
  const psFont = resolvePsFont(
    t.fontFamily,
    t.fontWeight,
    t.fontStyle === "italic",
  );
  const fillColor = hexToRgb(t.color);
  const transform = bboxToTransform(bbox, offsetX, offsetY);
  const boxBounds = bboxToBoxBounds(bbox);

  const layerText: Layer = {
    name:
      layer.type === "text-dialogue"
        ? `Text: ${text.slice(0, 20)}`
        : `Free: ${text.slice(0, 20)}`,
    top: offsetY + bbox.y,
    left: offsetX + bbox.x,
    bottom: offsetY + bbox.y + bbox.h,
    right: offsetX + bbox.x + bbox.w,
    opacity: layer.opacity,
    hidden: !layer.visible,
    text: {
      text: wrapped,
      transform,
      antiAlias: "smooth",
      shapeType: "box",
      style: {
        font: { name: psFont },
        fontSize: fontSize,
        fillColor,
        fauxBold: false,
        fauxItalic: false,
        horizontalScale: 1,
        verticalScale: 1,
        tracking: 0,
        autoKerning: true,
        baselineShift: 0,
        ligatures: true,
      },
      paragraphStyle: {
        justification: mapJustification(t.align),
      },
      boxBounds,
    },
  };

  return layerText;
}
