/** Text tool — public entry point. */
import { getEditor } from "./shared";
import { removeEditor, isFormattingTarget } from "./editor";
import { bindStageInteractions } from "./interactions";

let _bound = false;

export function bindTextTool(): void {
  if (_bound) return;
  _bound = true;

  // Commit open editor when clicking anywhere outside it,
  // EXCEPT when clicking formatting UI or form controls.
  document.addEventListener("mousedown", function (e) {
    const ta = getEditor();
    if (!ta) return;
    const target = e.target as HTMLElement;
    if (
      target === ta ||
      isFormattingTarget(target) ||
      target.closest("select, input, textarea, button")
    ) {
      return;
    }
    ta.blur();
  });

  bindStageInteractions();
}

export { renderLayerTextNodes } from "./nodes";

export const textTool = {
  get editing(): boolean {
    return getEditor() !== null;
  },
  cancelEdit(): void {
    removeEditor(true);
  },
};
