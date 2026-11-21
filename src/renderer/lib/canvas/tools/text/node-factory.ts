/** Konva.Text node factory — visual + interactive. */
import Konva from "konva";
import { canvas } from "../../index";
import type { PageLayer, Typography } from "../../../../types";
import { imgToStage } from "./shared";
import { fitTextToBox, selectPreset, wordWrap } from "./font-fit";
import { resolveSpans } from "./spans";

function makeRichTextGlyphsNode(
  layer: PageLayer,
  text: string,
  lw: number,
  lh: number,
  sr: number,
  imgFontSize: number,
  wrappedLines: string[],
): Konva.Shape {
  const typo: Typography = layer.typography;
  const resolved = resolveSpans(text, typo, layer.spans);

  return new Konva.Shape({
    name: "layer-text-glyphs",
    x: 0,
    y: 0,
    width: lw,
    height: lh,
    opacity: layer.opacity,
    listening: true,
    sceneFunc: function (context: Konva.Context) {
      const rawCtx = context._context;
      rawCtx.save();

      const lineHeight = imgFontSize * 1.25 * sr;
      const totalH = wrappedLines.length * lineHeight;
      const startY = Math.max(0, (lh - totalH) / 2);

      let textOffset = 0;

      for (let li = 0; li < wrappedLines.length; li++) {
        const lineText = wrappedLines[li];
        const lineLen = lineText.length;
        const lineStart = textOffset;
        const lineEnd = lineStart + lineLen;

        const lineSegments: Array<{
          text: string;
          color: string;
          fontFamily: string | null;
          fontSize?: number | null;
          fontWeight: number;
          fontStyle: "normal" | "italic";
          width: number;
        }> = [];

        for (const span of resolved) {
          const segStart = Math.max(lineStart, span.start);
          const segEnd = Math.min(lineEnd, span.end);
          if (segStart < segEnd) {
            const segText = text.substring(segStart, segEnd);
            const fs = (span.fontSize || imgFontSize) * sr;
            const weight = span.fontWeight >= 700 ? "bold" : "normal";
            const font = `${span.fontStyle} ${weight} ${fs}px ${span.fontFamily || typo.fontFamily || "Arial, sans-serif"}`;
            rawCtx.font = font;
            const w = rawCtx.measureText(segText).width;
            lineSegments.push({
              text: segText,
              color: span.color,
              fontFamily: span.fontFamily,
              fontSize: span.fontSize,
              fontWeight: span.fontWeight,
              fontStyle: span.fontStyle,
              width: w,
            });
          }
        }

        const totalLineWidth = lineSegments.reduce(
          (acc, s) => acc + s.width,
          0,
        );

        let curX = 0;
        if (typo.align === "center") {
          curX = Math.max(0, (lw - totalLineWidth) / 2);
        } else if (typo.align === "right") {
          curX = Math.max(0, lw - totalLineWidth);
        }

        const baselineY = startY + li * lineHeight + lineHeight * 0.8;

        for (const seg of lineSegments) {
          const fs = (seg.fontSize || imgFontSize) * sr;
          const weight = seg.fontWeight >= 700 ? "bold" : "normal";
          const font = `${seg.fontStyle} ${weight} ${fs}px ${seg.fontFamily || typo.fontFamily || "Arial, sans-serif"}`;
          rawCtx.font = font;

          if (typo.strokeColor && typo.strokeWidth > 0) {
            rawCtx.strokeStyle = typo.strokeColor;
            rawCtx.lineWidth = typo.strokeWidth * sr;
            rawCtx.lineJoin = "round";
            rawCtx.strokeText(seg.text, curX, baselineY);
          }

          rawCtx.fillStyle = seg.color;
          rawCtx.fillText(seg.text, curX, baselineY);

          curX += seg.width;
        }

        textOffset = lineEnd + 1;
      }

      rawCtx.restore();
    },
  });
}

export function makeNode(layer: PageLayer, text: string): Konva.Group {
  const sr = canvas.getScaleRatio();
  const p = imgToStage(layer.bbox.x, layer.bbox.y);
  const lw = Math.max(4, layer.bbox.w * sr);
  const lh = Math.max(4, layer.bbox.h * sr);
  const typo: Typography = layer.typography;

  // Fit in IMAGE space (zoom-independent), then scale to stage
  let imgFontSize = typo.fontSize;
  if (imgFontSize === null) {
    const fit = fitTextToBox(text, layer.bbox.w, layer.bbox.h, typo);
    imgFontSize = fit.fontSize;
    layer.typography.fontSize = fit.fontSize; // persist fitted size
    layer.fitStatus = fit.fitStatus; // drives sidebar review badge
  }

  // Pre-wrap using IMAGE-space measurements so line breaks stay consistent
  // across zoom levels (Canvas2D measureText sub-pixel rounding varies with
  // rendered font size, causing Konva's own wrapping to shift on zoom).
  const chars = text.replace(/[\s\n]/g, "").length;
  const preset = selectPreset(layer.bbox.w, layer.bbox.h, chars);
  const maxW = layer.bbox.w * preset.widthUsageRatio;
  const wrappedLines = wordWrap(text, imgFontSize, typo, maxW);
  const wrappedText = wrappedLines.join("\n");

  // Group + Rect + Text — mirrors the detection-group pattern so the
  // Transformer tracks the BOX (not the measured text) and the whole box
  // is hit-testable. The rect stays invisible — selection is shown by the
  // transformer's own border, so no duplicate outline appears.
  //
  // The group is rotated as a whole (box + glyphs together, Photoshop-style)
  // around its top-left corner; glyphs sit centered in the box so the
  // visual rotation is around the box center.
  const group = new Konva.Group({
    name: "layer-text",
    layerId: layer.id,
    x: p.x,
    y: p.y,
    rotation: layer.typography.rotation || 0,
  });

  group.add(
    new Konva.Rect({
      name: "layer-text-box",
      width: lw,
      height: lh,
      fill: "transparent",
      cornerRadius: 2,
    }),
  );

  const hasSpans = layer.spans && layer.spans.length > 0;
  const glyphsNode = hasSpans
    ? makeRichTextGlyphsNode(
        layer,
        text,
        lw,
        lh,
        sr,
        imgFontSize,
        wrappedLines,
      )
    : new Konva.Text({
        name: "layer-text-glyphs",
        x: lw / 2,
        y: lh / 2,
        width: lw,
        height: lh,
        offsetX: lw / 2,
        offsetY: lh / 2,
        text: wrappedText,
        fontSize: imgFontSize * sr,
        fontFamily: typo.fontFamily || "Arial, sans-serif",
        fontStyle: typo.fontStyle,
        fontVariant: typo.fontWeight >= 700 ? "bold" : "normal",
        wrap: "none",
        align: typo.align,
        verticalAlign: "middle",
        fill: typo.color,
        stroke: typo.strokeColor || undefined,
        strokeWidth: typo.strokeWidth * sr || 0,
        fillAfterStrokeEnabled: true,
        opacity: layer.opacity,
        listening: true,
      });

  group.add(glyphsNode);

  return group;
}
