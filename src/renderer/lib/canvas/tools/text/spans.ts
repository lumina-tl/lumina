/** Multi-color and multi-font text span utilities. */
import type { PageLayer, TextStyleSpan, Typography } from "../../../../types";

export interface ResolvedSpan {
  text: string;
  start: number;
  end: number;
  color: string;
  fontFamily: string | null;
  fontSize?: number | null;
  fontWeight: number;
  fontStyle: "normal" | "italic";
}

/** Check if two styles are identical for merging adjacent spans */
function isSameStyle(a: ResolvedSpan, b: ResolvedSpan): boolean {
  return (
    a.color === b.color &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle
  );
}

/** Break text into contiguous resolved slices from 0 to text.length */
export function resolveSpans(
  text: string,
  base: Typography,
  spans?: TextStyleSpan[],
): ResolvedSpan[] {
  const len = text.length;
  if (len === 0) return [];
  if (!spans || spans.length === 0) {
    return [
      {
        text,
        start: 0,
        end: len,
        color: base.color,
        fontFamily: base.fontFamily,
        fontSize: base.fontSize,
        fontWeight: base.fontWeight,
        fontStyle: base.fontStyle,
      },
    ];
  }

  // Collect all unique boundary points
  const points = new Set<number>([0, len]);
  for (const s of spans) {
    const st = Math.max(0, Math.min(len, s.start));
    const en = Math.max(0, Math.min(len, s.end));
    if (st < en) {
      points.add(st);
      points.add(en);
    }
  }

  const sorted = Array.from(points).sort((a, b) => a - b);
  const result: ResolvedSpan[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const st = sorted[i];
    const en = sorted[i + 1];
    if (st >= en) continue;

    // Resolve active style at this segment (last matching span wins)
    let color = base.color;
    let fontFamily = base.fontFamily;
    let fontSize = base.fontSize;
    let fontWeight = base.fontWeight;
    let fontStyle = base.fontStyle;

    for (const s of spans) {
      if (st >= s.start && en <= s.end) {
        if (s.color !== undefined) color = s.color;
        if (s.fontFamily !== undefined) fontFamily = s.fontFamily;
        if (s.fontSize !== undefined) fontSize = s.fontSize;
        if (s.fontWeight !== undefined) fontWeight = s.fontWeight;
        if (s.fontStyle !== undefined) fontStyle = s.fontStyle;
      }
    }

    const sliceText = text.substring(st, en);
    const spanItem: ResolvedSpan = {
      text: sliceText,
      start: st,
      end: en,
      color,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
    };

    // Merge with previous if style is identical
    const last = result[result.length - 1];
    if (last && isSameStyle(last, spanItem)) {
      last.text += spanItem.text;
      last.end = spanItem.end;
    } else {
      result.push(spanItem);
    }
  }

  return result;
}

/** Apply style override to a character range [start, end] in layer.spans */
export function applySpanStyle(
  layer: PageLayer,
  start: number,
  end: number,
  patch: Partial<TextStyleSpan>,
): void {
  const text = layer.translation || layer.source || "";
  const len = text.length;
  const st = Math.max(0, Math.min(len, start));
  const en = Math.max(0, Math.min(len, end));
  if (st >= en) return;

  const currentSpans = layer.spans ? [...layer.spans] : [];
  const nextSpans: TextStyleSpan[] = [];

  for (const s of currentSpans) {
    if (s.end <= st || s.start >= en) {
      // Disjoint: keep
      nextSpans.push(s);
    } else if (s.start < st && s.end > en) {
      // Span spans across: split into left and right
      nextSpans.push({ ...s, end: st });
      nextSpans.push({ ...s, start: en });
    } else if (s.start < st && s.end <= en) {
      // Overlaps left: truncate right
      nextSpans.push({ ...s, end: st });
    } else if (s.start >= st && s.end > en) {
      // Overlaps right: truncate left
      nextSpans.push({ ...s, start: en });
    }
    // Completely inside [st, en]: dropped and replaced by new patch
  }

  // Insert the new span
  nextSpans.push({
    start: st,
    end: en,
    ...patch,
  });

  // Sort and filter empty
  nextSpans.sort((a, b) => a.start - b.start);
  layer.spans = nextSpans.filter((s) => s.start < s.end);
}

/** Adjust spans after text length change */
export function adjustSpansOnTextChange(
  spans: TextStyleSpan[] | undefined,
  maxLen: number,
): TextStyleSpan[] {
  if (!spans || spans.length === 0) return [];
  const out: TextStyleSpan[] = [];
  for (const s of spans) {
    const st = Math.min(maxLen, s.start);
    const en = Math.min(maxLen, s.end);
    if (st < en) {
      out.push({ ...s, start: st, end: en });
    }
  }
  return out;
}

/** Get active typography at a specific character offset */
export function getStyleAtSelection(
  layer: PageLayer,
  start: number,
  _end?: number,
): Typography {
  const base = layer.typography;
  if (!layer.spans || layer.spans.length === 0) return base;
  for (let i = layer.spans.length - 1; i >= 0; i--) {
    const s = layer.spans[i];
    if (start >= s.start && start < s.end) {
      return {
        ...base,
        color: s.color !== undefined ? s.color : base.color,
        fontFamily: s.fontFamily !== undefined ? s.fontFamily : base.fontFamily,
        fontSize: s.fontSize !== undefined ? s.fontSize : base.fontSize,
        fontWeight: s.fontWeight !== undefined ? s.fontWeight : base.fontWeight,
        fontStyle: s.fontStyle !== undefined ? s.fontStyle : base.fontStyle,
      };
    }
  }
  return base;
}
