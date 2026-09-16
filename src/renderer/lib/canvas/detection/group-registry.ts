/** Shared Konva group registry (text groups + transformer). */
import Konva from "konva";

const _textGroups: Konva.Group[] = [];
let _textTransformer: Konva.Transformer | null = null;

export const groupRegistry = {
  textGroups(): Konva.Group[] {
    return _textGroups;
  },
  textTransformer(): Konva.Transformer | null {
    return _textTransformer;
  },
  setTextTransformer(t: Konva.Transformer | null): void {
    _textTransformer = t;
  },
  getTextTransformer(): Konva.Transformer | null {
    return _textTransformer;
  },
  pushTextGroup(g: Konva.Group): void {
    _textGroups.push(g);
  },
  clear(): void {
    _textGroups.length = 0;
    _textTransformer = null;
  },
};
