# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Masks now visible in export preview.** Previously, the export window only showed text layers — inpaint and cleanup masks were missing because mask images weren't loaded before compositing.
- **Undo/redo no longer flickers.** Mask images are now preserved across snapshots when the file path hasn't changed, eliminating the 1-frame flash of the bare background during undo/redo.
- **Eraser tool now responds immediately during drag.** Previously the eraser appeared delayed because the blit fast-path (source-over) couldn't reflect erased pixels — it now re-composites the affected region so visual feedback is instant.
- **Font fitting no longer shifts on zoom.** Text word-wrapping is now pre-computed using image-space measurements and passed to Konva.Text with `wrap: 'none'`, preventing Konva from re-wrapping at zoom-dependent stage-space sizes where sub-pixel rounding differences caused line breaks to shift.
- **Layer and mask list items are numbered.** A visible index is shown on each row for easier identification and reorder reference.

### Changed

- **Layer list now reflects visual stacking order.** Index 1 in the list is the topmost layer visually; layers lower in the list sit underneath. Previously the list order was inverted relative to the canvas.
- **OCR text normalization option.** New setting in Settings → General to normalize OCR text case: as-is (default), lowercase, or uppercase.
- **Frontend codebase refactor.** All TypeScript renderer code reorganized for maintainability — files grouped into logical folders, filenames standardized to kebab-case, and comments simplified to short JSDoc.

## [0.3.4] - 08-09-2026

### Fixed

- **Source images no longer deleted when closing the app.** Previously, opening a `.lmi` project extracted its source images into the temp cache, and closing the app — or restarting the backend (e.g. after a CUDA runtime download) — wiped the entire cache, deleting the extracted source images while the project was still open. Extracted projects are now only cleaned up when the app truly quits.

## [0.3.3] - 08-09-2026

### Fixed

- **Brush strokes no longer vanish after save and reopen.** Previously, strokes could be silently dropped due to a timing issue — now they are always saved before the project file is written.
- **Undo/redo after brushing works reliably.** Previously, undoing right after a brush stroke could skip the step — now it always restores correctly.
- **Export window thumbnails load correctly.** Previously, thumbnails in the export sidebar could disappear on pages that weren't actively being viewed — now they always show.
- **Re-translate now follows surrounding context.** Previously, re-translating a single line could produce a literal result that ignored the tone of earlier lines — context is now always included in the prompt.
- **Inpaint patches no longer bleed into neighbouring boxes.** Previously, context-padding from adjacent detection boxes could overlap and produce visual artifacts. Each patch now detects whether its padded crop overlaps another — clamping the alpha when it does, preserving smooth feathering for isolated boxes.
- **Failed CUDA extraction cleans up partial files.** Previously, a failed extraction could leave a corrupted runtime directory — now the directory is removed on failure so the next launch re-downloads cleanly.

### Changed

- **Font fitting adapts to box shape.** Previously, all boxes used the same width/height usage ratio regardless of aspect ratio — now tall boxes use more width and wide boxes use more height, producing larger, better-fitted text.
- **Translation only fetches the API key for the active provider.** Previously, every translate or retranslate request fetched all four vault keys via IPC (causing repeated MISS logs for unused providers) — now only the relevant key is loaded.
- **CUDA runtime installation now shows extraction progress.** Previously, the progress indicator froze at 100% during the extraction phase — it now shows "Extracting CUDA runtime…" so users know the app is still working.

## [0.3.2] - 07-09-2026

### Fixed

- **CUDA runtime download failed after finishing (then re-downloaded on every launch)**: the downloaded archive was never finalized to its final name, so verification always failed and the app restarted the download from scratch. The download is now finalized correctly and verified before the runtime is used — a failed download no longer forces a re-download on the next launch.

## [0.3.1] - 07-09-2026

### Changed

- **Silent one-click installer**: updates and fresh installs no longer show the NSIS wizard — the app installs quietly into your user folder and relaunches, just like VS Code. (Install location is fixed per-user, which also keeps differential updates consistent.)

## [0.3.0] - 07-09-2026

### Changed

- **Fresh new app icon**
- **CUDA installer is now small**: the ~1.4 GB ONNX Runtime is no longer bundled in the installer. The app downloads it once into your user folder on first run (progress shown in Settings → Models) and verifies it before use — making every update after this one a small differential download. **CUDA users updating to this version will download the runtime once; later updates won't re-download it.** DML installs are unaffected.
- **Resize detection boxes from any edge**: the edges now work too, not just the corners.
- **Text boxes rotate with their content**: the whole box tilts with the text, like in Photoshop.
- **Enter to commit text edits**: pressing Enter in the layer list editor saves; Shift+Enter inserts a newline.
- **Undo/redo while editing text**: Ctrl+Z/Y inside the editor keeps it open so you can keep typing.
- **Live GPU badge per model**: shows the engine each model actually runs on (CUDA / DirectML / CPU).
- **API key tutorial link in Settings → Translation**: step-by-step guide in the docs.
- **Opening and browsing large images is much smoother**: long-strip manhwa pages load faster, and zooming/panning no longer stutters, even while OCR is running.
- **Smarter page thumbnails**: long-strip pages now show a real panel instead of a thin sliver.
- **More natural Indonesian translations**: translated dialogue now consistently uses standard Indonesian (e.g. "tidak" rather than "nggak"/"gak") unless the line is shouted or angry, with examples to keep it consistent.

### Fixed

- **Zooming into pages no longer turns them blurry**: artwork stays pixel-sharp at any zoom level.
- **Zooming in and out quickly no longer makes memory and CPU usage spike**.
- **Progress toasts showing raw placeholders**: the OCR and translate progress messages now show the real box/text count instead of `{{count}}`.
- **Re-translating a single line lost the surrounding context**: the app now sends the full conversation up to that point, so names and tone stay consistent with the rest of the page.

## [0.2.1] - 05-09-2026

> ⚠️ **0.2.0 withdrawn** — the 0.2.0 installers were pulled due to installer bugs (oversized `app.asar` and a console window popping up during CUDA extraction). The 0.2.0 changelog entry remains for reference at [CHANGELOG.md#020---05-09-2026](https://github.com/lumina-tl/lumina/blob/main/CHANGELOG.md#020---05-09-2026).

### Fixed

- **CUDA installer no longer pops a console window**: extracting the ~1.5 GB CUDA runtime used to open a separate terminal during setup. Extraction now runs inside the installer process itself, driving the native progress bar — no terminal.
- **Installers are dramatically smaller**: the app package (`app.asar`) was accidentally including the previous build's entire unpacked output (a second full Electron runtime, ~1.7 GB). It's now limited to the actual app code (~2 MB), shrinking both the DML and CUDA installers significantly.

## [0.2.0] - 05-09-2026

### Added

- **Differential updates**: starting with this version, updating is much smaller and faster — the app only downloads the changed parts of the new version instead of the whole installer again, and installs it automatically when you launch.
- **CUDA installer variant**: for NVIDIA GPU users, a separate `Lumina-Setup-CUDA` installer is available — **highly recommended** if you have an NVIDIA GPU, otherwise stick with the regular (DML) installer.
- **New tools**: brush, eraser, paint bucket (flood fill) and eyedropper for editing the new cleanup raster layer (show/hide, opacity, clear, delete) — with a Photoshop-like shortcut
- **Re-OCR a single text box**: if the text reading (OCR) for one bubble came out wrong, right-click it and pick a different OCR model just for that box — no need to redo the whole page. This can also be undone if the new result isn't better.
- **Text now fits the bubble shape**: translated text now follows the actual shape of the speech bubble instead of just a straight box, so it looks neater and sits better inside. If a bubble contains multiple separate text pieces, it keeps the old straight-box behavior to stay safe.
- **Tilted text detection (AngleNet)**: adds a very small, fast model that measures the slant of each text crop, so translated text is rotated to match the original typesetting. It's a global companion model auto-downloaded in the background on first launch.

### Changed

- The text editor (original vs. translated) now uses tabs instead of stacking both fields — saves space and is easier to read.
- Updated the description for the "PP-OCRv6" OCR model: it's now considered ready for regular use (no longer "in development"), works well for long or multi-line horizontal text, but for very long bubbles the "Baberu OCR" model is recommended instead. Tilted/rotated text is still often misread.
- Fixed how images are cropped before OCR — previously a small extra margin was added, which slightly distorted the image and sometimes caused the text direction to be misread (read sideways). This has been removed.
- Redesigned the home screen: it now shows your recent projects and images right away when you open the app.

### Fixed

- Text with line breaks in the middle no longer breaks the layer list or messes up automatic font sizing.
- Bubbles with long or multi-line horizontal text were sometimes wrongly detected as vertical text and rotated 90°, producing garbled/unreadable output. The app is now smarter at recognizing text direction before splitting lines.

## [0.1.0-experimental-preview] - 02-09-2026

Initial release — the first public preview of Lumina, a desktop app that automates manga/manhwa/manhua translation. Text detection, OCR, translation, inpainting, and typesetting run through a local ONNX Runtime backend (translation is the only step that calls external AI APIs), and every step stays editable.
