/** Lucide icon rendering (requires explicit icon map). */
import { createIcons as _createIcons, icons } from "lucide";
import type { CreateIconsOptions } from "lucide";

export function createIcons(
  options: Omit<CreateIconsOptions, "icons"> = {},
): void {
  _createIcons({ ...options, icons });
}
