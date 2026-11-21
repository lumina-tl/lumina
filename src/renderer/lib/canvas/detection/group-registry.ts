/** Shared Konva group registry (text groups + transformers). */
import Konva from "konva";

const _textGroups: Konva.Group[] = [];
let _textTransformers: Konva.Transformer[] = [];

export const groupRegistry = {
  textGroups(): Konva.Group[] {
    return _textGroups;
  },
  textTransformers(): Konva.Transformer[] {
    return _textTransformers;
  },
  textTransformer(): Konva.Transformer | null {
    return _textTransformers[0] || null;
  },
  setTextTransformer(t: Konva.Transformer | null): void {
    _textTransformers.forEach((tr) => tr.destroy());
    _textTransformers = t ? [t] : [];
  },
  addTextTransformer(t: Konva.Transformer): void {
    _textTransformers.push(t);
  },
  clearTextTransformers(): void {
    _textTransformers.forEach((tr) => tr.destroy());
    _textTransformers = [];
  },
  getTextTransformer(): Konva.Transformer | null {
    return _textTransformers[0] || null;
  },
  pushTextGroup(g: Konva.Group): void {
    _textGroups.push(g);
  },
  clear(): void {
    _textGroups.length = 0;
    this.clearTextTransformers();
  },
};
