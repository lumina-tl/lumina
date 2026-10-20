"""Overlapping image tiles for detection on long pages."""
from __future__ import annotations

from PIL import Image

TILE_SIZE = 2048
TILE_OVERLAP = 256


def _tile_starts(length: int, tile_size: int) -> list[int]:
    if length <= tile_size:
        return [0]
    step = tile_size - min(TILE_OVERLAP, tile_size // 4)
    starts = list(range(0, length - tile_size + 1, step))
    last = length - tile_size
    if starts[-1] != last:
        starts.append(last)
    return starts


def image_tiles(image: Image.Image) -> list[tuple[Image.Image, int, int]]:
    """Return tiles and their source offsets, preserving the original pixels."""
    width, height = image.size
    if max(width, height) <= TILE_SIZE:
        return [(image, 0, 0)]

    tile_width = min(width, TILE_SIZE)
    tile_height = min(height, TILE_SIZE)
    if width < height:
        tile_height = min(tile_height, width * 2)
    else:
        tile_width = min(tile_width, height * 2)

    tiles = []
    for y in _tile_starts(height, tile_height):
        for x in _tile_starts(width, tile_width):
            right = min(x + tile_width, width)
            bottom = min(y + tile_height, height)
            tiles.append((image.crop((x, y, right, bottom)), x, y))
    return tiles


def merge_detections(detections: list[dict]) -> list[dict]:
    """Remove duplicate boxes from overlapping tiles using confidence-ranked NMS."""
    kept: list[dict] = []
    for detection in sorted(
        detections, key=lambda item: item.get("confidence", 0), reverse=True
    ):
        box = detection["bbox"]
        x0, y0 = box["x"], box["y"]
        x1, y1 = x0 + box["w"], y0 + box["h"]
        duplicate = False
        for existing in kept:
            if detection.get("type") != existing.get("type"):
                continue
            other = existing["bbox"]
            ox0, oy0 = other["x"], other["y"]
            ox1, oy1 = ox0 + other["w"], oy0 + other["h"]
            intersection = max(0, min(x1, ox1) - max(x0, ox0)) * max(
                0, min(y1, oy1) - max(y0, oy0)
            )
            union = box["w"] * box["h"] + other["w"] * other["h"] - intersection
            if union and intersection / union >= 0.5:
                duplicate = True
                break
        if not duplicate:
            kept.append(detection)
    return sorted(
        kept,
        key=lambda item: (
            item["bbox"]["y"],
            item["bbox"]["x"],
        ),
    )
