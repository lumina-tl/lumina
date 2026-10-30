/** Shared hit-test: Konva Transformer chrome (anchors / border / rotater).
 *  Text create, paint, and lasso/rect must all ignore these — otherwise
 *  resizing a box starts a stroke or marquee on the same press.
 */
import Konva from "konva";
import { getTransformer } from "./tools/text/transformer";
import { groupRegistry } from "./detection/group-registry";

export function hitTransformer(target: unknown): boolean {
  let node = target as {
    name?: () => string;
    getParent?: () => unknown;
    getClassName?: () => string;
    className?: string;
  } | null;
  while (node) {
    const cls =
      (typeof node.getClassName === "function" && node.getClassName()) ||
      node.className ||
      "";
    if (cls === "Transformer") return true;
    const name = node.name ? node.name() : "";
    if (
      name === "back" ||
      name === "rotater" ||
      name.indexOf("_anchor") >= 0
    ) {
      return true;
    }
    node = node.getParent
      ? (node.getParent() as typeof node)
      : null;
  }

  if (!(target instanceof Konva.Node)) return false;

  const candidates = [
    getTransformer(),
    groupRegistry.getTextTransformer(),
  ].filter(Boolean) as Konva.Transformer[];

  for (const tr of candidates) {
    let p: Konva.Node | null = target;
    while (p) {
      if (p === tr) return true;
      p = p.getParent();
    }
  }
  return false;
}
