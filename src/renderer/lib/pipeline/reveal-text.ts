/** Switch canvas from green detection overlays to typeset text layers.
 *  Pipeline reaches this via post-inpaint; standalone OCR/Translate must
 *  do the same or the user only sees detection chrome with no text boxes.
 */
import { state } from "../state";

export function revealTypesetLayers(): void {
  state.showDetBoxes = false;
}
