/** PDF — combine rendered pages in export order. */
import { PDFDocument } from "pdf-lib";
import type { ExportImageFile } from "../../shared/bridge";

const MAX_PAGE_SIZE = 14400;

export async function pdfWrite(files: ExportImageFile[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const file of files) {
    const image = await doc.embedPng(file.data);
    const scale = Math.min(
      1,
      MAX_PAGE_SIZE / Math.max(image.width, image.height),
    );
    const { width, height } = image.scale(scale);
    const page = doc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return doc.save();
}
