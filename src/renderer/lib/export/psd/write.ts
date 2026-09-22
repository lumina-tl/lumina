/** Serialize PSD object to bytes via ag-psd. */
import { writePsd } from "ag-psd";
import type { Psd } from "ag-psd";

/**
 * Serialize a PSD document to a Uint8Array.
 * Text layers won't have rendered bitmaps — Photoshop will prompt "Update"
 * on open, which is expected behavior for ag-psd written text layers.
 */
export function serializePsd(psd: Psd): Uint8Array {
  const buf = writePsd(psd, {
    generateThumbnail: true,
    trimImageData: true,
    noBackground: true, // treat bottom layer as regular, not locked background
  });
  return new Uint8Array(buf);
}
