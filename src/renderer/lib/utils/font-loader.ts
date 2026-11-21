/** Register system fonts from main process as FontFace instances. */
import { state } from "../state";

/** Internal family name used in CSS/Konva for a given system font */
export function internalFontName(family: string): string {
  return "lumina-" + family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Get human-readable font display name from internal font name */
export function fontDisplayName(internal: string | null): string {
  if (!internal) return "Default";
  for (const f of state.fontList || []) {
    if (internalFontName(f.family) === internal) return f.family;
  }
  return internal;
}

/** Register all system fonts as FontFaces so they render on canvas.
 * Style variants (Bold/Italic files) share the same internal family name —
 * each file is registered with its own weight/style so the browser picks
 * the right face for typography.fontWeight/fontStyle. */
export async function loadSystemFonts(): Promise<void> {
  if (!window.lumina.getFonts) return;
  let fonts: Array<{
    family: string;
    path: string;
    weight: number;
    italic: boolean;
    postScriptName: string;
  }> = [];
  try {
    fonts = (await window.lumina.getFonts()) || [];
  } catch {
    return;
  }
  state.fontList = fonts;

  const jobs = fonts.map(async function (f) {
    const name = internalFontName(f.family);
    try {
      // Windows paths need the canonical file:///C:/... form — a two-slash
      // "file://C:\..." URL parses with an empty host and fails to load.
      // Spaces in filenames (e.g. "CC Wild Words Roman.ttf") must be
      // percent-encoded — unquoted url() with spaces is invalid CSS and
      // FontFace.load() fails silently.
      const url =
        "file:///" +
        encodeURI(f.path.split(/[\\/]/).join("/")).replace(/#/g, "%23");
      const face = new FontFace(name, "url(" + url + ")", {
        weight: String(f.weight),
        style: f.italic ? "italic" : "normal",
      });
      await face.load();
      document.fonts.add(face);
    } catch {
      /* unreadable/unsupported font file — skip */
    }
  });
  await Promise.all(jobs);
}

/** Detect whether a font is installed and where (system or in-app) */
export function detectFontStatus(family: string): {
  status: "not_installed" | "in_app" | "system";
  matchedFont?: { family: string; path: string };
} {
  const norm = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  const found = (state.fontList || []).find(function (f) {
    return f.family.toLowerCase().replace(/[^a-z0-9]/g, "") === norm;
  });
  if (!found) {
    return { status: "not_installed" };
  }
  const p = found.path.toLowerCase().replace(/\\/g, "/");
  if (
    p.includes("/windows/fonts") ||
    p.includes("/microsoft/windows/fonts") ||
    p.includes("/library/fonts") ||
    p.includes("/usr/share/fonts")
  ) {
    return { status: "system", matchedFont: found };
  }
  return { status: "in_app", matchedFont: found };
}

/** Reload fonts from main process and re-register newly added FontFaces */
export async function reloadFonts(): Promise<void> {
  await loadSystemFonts();
}

