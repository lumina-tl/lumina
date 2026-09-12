/** Sort detection bboxes in manga reading order (right→left, top→bottom). */
import type { BBox } from "../../types";

function centerY(b: BBox): number {
  return b.y + b.h / 2;
}

/** Vertical overlap ratio relative to the shorter box */
function vOverlapRatio(a: BBox, b: BBox): number {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const overlap = bottom - top;
  if (overlap <= 0) return 0;
  const shorter = Math.min(a.h, b.h);
  return shorter > 0 ? overlap / shorter : 0;
}

/**
 * Sort boxes in manga reading order (right→left, top→bottom).
 * Returns a new sorted array; does not mutate the input.
 */
export function sortReadingOrder<T extends { bbox: BBox }>(items: T[]): T[] {
  const rows: T[][] = [];

  // Seed rows by descending y-center
  const sorted = [...items].sort((a, b) => centerY(a.bbox) - centerY(b.bbox));
  for (const item of sorted) {
    const row = rows.find((r) =>
      r.some((x) => vOverlapRatio(x.bbox, item.bbox) > 0.5),
    );
    if (row) row.push(item);
    else rows.push([item]);
  }

  // Normalize each row's vertical extent for stable row ordering
  rows.sort((ra, rb) => {
    const minA = Math.min(...ra.map((x) => x.bbox.y));
    const minB = Math.min(...rb.map((x) => x.bbox.y));
    return minA - minB;
  });

  // Within a row: right→left
  for (const row of rows) {
    row.sort((a, b) => b.bbox.x - a.bbox.x);
  }

  return rows.flat();
}
