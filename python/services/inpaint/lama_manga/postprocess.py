"""LaMa Manga output handling: scale, un-letterbox, feather, package patch."""
from __future__ import annotations

import cv2 as cv
import numpy as np

from .config import OUTPUT_SCALE


def compose_patch(
    output: np.ndarray,
    mask: np.ndarray,
    nw: int,
    nh: int,
    pad_x: int,
    pad_y: int,
    box_rect: tuple[int, int, int, int] | None = None,
    *,
    clamp: bool = False,
) -> np.ndarray:
    """Convert the raw CHW graph output into an RGBA patch (BGR + alpha).

    RGB = inpainted pixels scaled back to 0..255, A = feathered glyph mask
    (same blur the compositor uses) so edges blend into the artwork.

    When *clamp* is True the alpha channel is zeroed outside *box_rect*,
    preventing context-padding bleed into neighbouring patches.
    """
    result = np.asarray(output, dtype=np.float32) * OUTPUT_SCALE
    result = np.transpose(result, (1, 2, 0))
    result = np.clip(result, 0, 255).astype(np.uint8)
    result = result[pad_y : pad_y + nh, pad_x : pad_x + nw]
    result = cv.resize(
        result, (mask.shape[1], mask.shape[0]), interpolation=cv.INTER_LINEAR
    )

    alpha = cv.GaussianBlur(mask, (0, 0), 2).astype(np.float32)
    alpha = np.clip(alpha, 0, 255).astype(np.uint8)

    # Clamp alpha outside the text box to prevent context-bleed artifacts.
    if clamp and box_rect is not None:
        by0, by1 = box_rect[1], box_rect[3]
        bx0, bx1 = box_rect[0], box_rect[2]
        alpha[:by0, :] = 0
        alpha[by1:, :] = 0
        alpha[:, :bx0] = 0
        alpha[:, bx1:] = 0

    return np.dstack([result, alpha])
