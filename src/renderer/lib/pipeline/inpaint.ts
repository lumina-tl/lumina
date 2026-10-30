/* ── Lumina Pipeline — Inpainting (LaMa via Python backend) ──
 * The backend returns one RGBA patch per detection box; each patch becomes
 * an independent mask layer (Photoshop-style) composited over the original
 * image. The renderer no longer swaps to a single cleaned image.
 */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { invalidateComposite } from "../canvas/render";
import { sidebar } from "../sidebar";
import { models } from "../models";
import { log } from "../logger";
import type { BBox, InpaintMask, Page } from "../../types";

/** Convert a Windows path to a loadable file:// URL */
function fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function loadImage(p: string): Promise<HTMLImageElement> {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error("Failed to load patch image: " + p));
    };
    img.src = fileUrl(p);
  });
}

async function createMasks(
  page: Page,
  model: string,
  boxes: BBox[] = page.textDetections.map((d) => d.bbox),
): Promise<InpaintMask[]> {
  const result = await window.lumina.apiPost<{
    patches?: Array<{ bbox: BBox; imagePath: string }>;
    detail?: string;
    error?: string;
  }>("/inpaint", {
    imagePath: page.filePath,
    maskPath: page.maskPath ?? null,
    boxes,
    model,
  });
  if (!result || !Array.isArray(result.patches))
    throw new Error(result?.detail || result?.error || "Inpaint failed");

  const ts = Date.now();
  return Promise.all(
    result.patches.map(async (patch, i): Promise<InpaintMask> => ({
      id: "mask-" + ts + "-" + i,
      bbox: patch.bbox,
      imagePath: patch.imagePath,
      visible: true,
      opacity: 1,
      image: await loadImage(patch.imagePath),
    })),
  );
}

function clampBoxes(page: Page, boxes: BBox[]): BBox[] {
  return boxes
    .map((box) => {
      const x = Math.max(0, Math.min(page.naturalWidth, Math.round(box.x)));
      const y = Math.max(0, Math.min(page.naturalHeight, Math.round(box.y)));
      const right = Math.max(
        x,
        Math.min(page.naturalWidth, Math.round(box.x + box.w)),
      );
      const bottom = Math.max(
        y,
        Math.min(page.naturalHeight, Math.round(box.y + box.h)),
      );
      return { x, y, w: right - x, h: bottom - y };
    })
    .filter((box) => box.w >= 6 && box.h >= 6);
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode edited mask"));
    }, "image/png");
  });
}

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load edited mask"));
    };
    image.src = url;
  });
}

export const inpaint = {
  /** Inpaint all text detection boxes of the active page → mask layers */
  run: async function (): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    if (!page.textDetections.length) {
      ui.toast(i18n.t("toast.inpaintNoText"), "warn");
      return;
    }
    state.isRunning = true;

    const isFirstRun = !state._inpaintLoaded;
    const loadingToast = ui.toast(
      isFirstRun
        ? i18n.t("toast.inpaintFirstRun")
        : i18n.t("toast.inpaintRunning"),
      "running",
      0,
    );

    try {
      const model = models.selectedModel("inpaint") || "lama_manga";
      log.debug(
        "fe",
        `inpaint: start model=${model} boxes=${page.textDetections.length}`,
      );
      const masks = await createMasks(page, model);
      log.debug("fe", `inpaint: done ${masks.length} patch(es)`);

      // Replace previous masks (re-run = fresh set of patches).
      // Detection boxes stay in the page model but are no longer drawn —
      // see render.ts (overlays only while masks.length === 0).
      page.inpaintMasks = masks;
      state._inpaintLoaded = true;
      invalidateComposite(page.fileName);

      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.inpaintDone", { count: masks.length }),
        "success",
        3000,
      );
    } catch (err) {
      log.error("fe", `Inpaint: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast(
        (err as Error).message || i18n.t("toast.inpaintFailed"),
        "error",
      );
    } finally {
      state.isRunning = false;
    }
  },

  /** Generate and append inpaint patches for manually selected regions. */
  runBoxes: async function (boxes: BBox[]): Promise<boolean> {
    const page = state.getActivePage();
    const validBoxes = page ? clampBoxes(page, boxes) : [];
    if (state.isRunning || !page || validBoxes.length === 0) return false;

    state.isRunning = true;
    const loadingToast = ui.toast(
      i18n.t("toast.inpaintRunning"),
      "running",
      0,
    );
    try {
      const model = models.selectedModel("inpaint") || "lama_manga";
      const masks = await createMasks(page, model, validBoxes);
      page.inpaintMasks.push(...masks);
      if (masks.length)
        page._selectedMaskId = masks[masks.length - 1].id;
      state._inpaintLoaded = true;
      invalidateComposite(page.fileName);
      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.inpaintDone", { count: masks.length }),
        "success",
        3000,
      );
      return true;
    } catch (err) {
      log.error("fe", `Inpaint selected regions: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast(
        (err as Error).message || i18n.t("toast.inpaintFailed"),
        "error",
      );
      return false;
    } finally {
      state.isRunning = false;
    }
  },

  /** Erase the selected area from every overlapping generated inpaint mask. */
  eraseBoxes: async function (boxes: BBox[]): Promise<boolean> {
    const page = state.getActivePage();
    const validBoxes = page ? clampBoxes(page, boxes) : [];
    if (state.isRunning || !page || validBoxes.length === 0) return false;

    state.isRunning = true;
    const loadingToast = ui.toast(
      i18n.t("masks.erasingArea"),
      "running",
      0,
    );
    try {
      const edits: Array<{
        mask: InpaintMask;
        image: HTMLImageElement;
        imagePath: string;
      }> = [];
      for (const mask of page.inpaintMasks) {
        const intersecting = validBoxes.filter(
          (box) =>
            box.x < mask.bbox.x + mask.bbox.w &&
            box.x + box.w > mask.bbox.x &&
            box.y < mask.bbox.y + mask.bbox.h &&
            box.y + box.h > mask.bbox.y,
        );
        if (!intersecting.length || mask.bbox.w <= 0 || mask.bbox.h <= 0)
          continue;

        const original = mask.image ?? (await loadImage(mask.imagePath));
        const edited = document.createElement("canvas");
        edited.width = original.naturalWidth || original.width;
        edited.height = original.naturalHeight || original.height;
        const ctx = edited.getContext("2d");
        if (!ctx) throw new Error("Could not create mask editing canvas");
        ctx.drawImage(original, 0, 0, edited.width, edited.height);

        for (const box of intersecting) {
          const x = Math.max(box.x, mask.bbox.x);
          const y = Math.max(box.y, mask.bbox.y);
          const right = Math.min(
            box.x + box.w,
            mask.bbox.x + mask.bbox.w,
          );
          const bottom = Math.min(
            box.y + box.h,
            mask.bbox.y + mask.bbox.h,
          );
          const scaleX = edited.width / mask.bbox.w;
          const scaleY = edited.height / mask.bbox.h;
          ctx.clearRect(
            (x - mask.bbox.x) * scaleX,
            (y - mask.bbox.y) * scaleY,
            (right - x) * scaleX,
            (bottom - y) * scaleY,
          );
        }

        const blob = await canvasBlob(edited);
        const data = new Uint8Array(await blob.arrayBuffer());
        const saved = await window.lumina.writeTempPng({
          data,
          subdir: "inpaint",
          name: mask.id,
        });
        edits.push({
          mask,
          image: await imageFromBlob(blob),
          imagePath: saved.path,
        });
      }

      ui.dismissToast(loadingToast);
      if (!edits.length) {
        ui.toast(i18n.t("masks.eraseNoOverlap"), "warn", 3000);
        return false;
      }
      edits.forEach(({ mask, image, imagePath }) => {
        mask.image = image;
        mask.imagePath = imagePath;
      });
      invalidateComposite(page.fileName);
      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.toast(
        i18n.t("masks.eraseDone", { count: edits.length }),
        "success",
        3000,
      );
      return true;
    } catch (err) {
      log.error("fe", `Erase inpaint mask region: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast(
        (err as Error).message || i18n.t("masks.eraseFailed"),
        "error",
      );
      return false;
    } finally {
      state.isRunning = false;
    }
  },
};
