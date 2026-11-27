# Integration Changes

## Scope

This document summarizes the user-edition features integrated with the official Lumina `main` branch, together with the follow-up fixes made during this integration. The work is on `integrate-luminapropio`; it has not been merged into the official `main` branch.

## Added and improved

### Images and workflow

- Added multi-image and folder import, lazy loading for inactive pages, and page-strip navigation/reordering. Right-clicking a page offers **Close This**, **Close Others**, and **Close All**.
- Added batch detection and OCR support across open pages.
- Updated **Full Pipeline** and **Clean Only** to process all open images and restore the page that was active before the run.
- **Clean Only** can run with or without OCR. Choosing OCR also runs translation.
- Added per-page completion markers for detection, OCR, translation, and inpainting. Completed stages are skipped on subsequent workflow runs, so newly imported pages can be processed without repeating all work on existing pages. Markers are saved with projects and included in undo/redo snapshots.
- Individual pipeline actions remain available to explicitly rerun a stage.

### Detection, selection, and cleanup

- Added tiled detection for long or high-resolution images, with detection tests.
- Improved detection preprocessing and runtime/provider handling.
- Integrated lasso, rectangle, multi-selection, and pen-based selection workflows, including conversion of selections into detection boxes.
- Added cleanup-mask painting tools and editing of generated inpaint masks.
- Synchronized detection results with dialogue layers, preserved manual layers, and improved detection-box visibility after batch detection and inpainting.

### Translation, models, and export

- Added Spanish localization files and Spanish versions of the README and contribution guide.
- Restored the Translation settings tab and added a standalone Translate action to the workflow bar.
- Standalone translation and OCR export operate across all open images.
- OCR text export produces one `.txt` containing page headings and original/translated dialogue when translations are available.
- Improved model-management UI, model descriptions, GPU/runtime support, model download cancellation, and model deletion.
- Added folder-aware export and expanded export support, including OCR text, PDF, and PSD workflows.

### Integration fixes

- Improved Python backend startup handling, including interpreter validation and clearer startup errors.
- Rebound cursor handlers whenever the canvas stage is recreated, including after closing all open pages.
- Fixed a duplicate `deleteModel` property that caused a TypeScript compiler error.
- Made model-registry failures visible in Settings → Models instead of silently leaving the model list empty.
- Added translation-provider and model-setting labels in English and Spanish.
- Kept project documentation edits limited; the Spanish guides are separate files.

## TODO review

- Marked **detection tiling for long-strip/high-resolution pages** complete; the implementation and focused tests are present.
- No other unchecked TODO item was clearly completed by this integration, so the remaining items stay open: custom NSIS uninstaller, PaddleOCR-VL `tokenizers` packaging, cleanup-mask tool, mask creation when converting selections to detections, before/after toggle, pen line mode, inverted default text cursor, copying objects between pages, and the ongoing bug-hunting task.

## Validation

- `npm run build` — passed.
- `git diff --check` — passed.
- The latest Python test attempt could not run because `pytest` is not installed in the project virtual environment.
