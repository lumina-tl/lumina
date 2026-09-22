/** Resolve user font family name → PostScript name for PSD text layers. */
import { state } from "../../state";
import { internalFontName } from "../../utils/font-loader";

const _cache = new Map<string, string>();

/**
 * PSD needs the exact PostScript name embedded in the font file.
 * We read it at scan time (nameID 6) and store it in FontInfo.postScriptName.
 */
export function resolvePsFont(
  family: string | null,
  fontWeight = 400,
  italic = false,
): string {
  if (!family) return "ArialMT";
  const cacheKey = `${family}|${fontWeight}|${italic}`;
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  const fontList = state.fontList || [];

  // Find the font entry matching family + weight + italic
  const entry = fontList.find(
    (f) =>
      (internalFontName(f.family) === family ||
        f.family.toLowerCase() === family.toLowerCase()) &&
      f.weight === fontWeight &&
      f.italic === italic,
  );

  // Use the real PostScript name if we have it
  if (entry?.postScriptName) {
    _cache.set(cacheKey, entry.postScriptName);
    return entry.postScriptName;
  }

  // Fallback: match family only, use its PostScript name
  const familyEntry = fontList.find(
    (f) =>
      internalFontName(f.family) === family ||
      f.family.toLowerCase() === family.toLowerCase(),
  );
  if (familyEntry?.postScriptName) {
    _cache.set(cacheKey, familyEntry.postScriptName);
    return familyEntry.postScriptName;
  }

  // Last resort: derive from family name
  let name = family;
  if (family.startsWith("lumina-")) {
    name = family
      .replace(/^lumina-/, "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  const psName = name.replace(/\s+/g, "");
  _cache.set(cacheKey, psName);
  return psName;
}
