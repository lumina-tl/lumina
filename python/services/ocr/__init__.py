"""OCR model registry + region grouping."""
from __future__ import annotations

from typing import Optional

from .base import BaseOcrModel, ProgressCallback
from .baberu.model import BaberuOcrModel
from .manga_ocr.model import MangaOcrModel
from .paddleocr_vl.model import PaddleOcrVlModel
from .ppocrv6.model import PPOcrV6Model

MODELS: dict[str, BaseOcrModel] = {
    "manga_ocr": MangaOcrModel(),
    "ppocrv6": PPOcrV6Model(),
    "baberu": BaberuOcrModel(),
    "paddleocr_vl": PaddleOcrVlModel(),
}
DEFAULT_MODEL = "manga_ocr"

progress_callback: ProgressCallback = None


def get_models() -> dict[str, BaseOcrModel]:
    return dict(MODELS)


def get_models_info() -> list[dict]:
    """Registry metadata for the settings → Models manager."""
    return [
        {
            "id": name,
            "name": m.name,
            "kind": "ocr",
            "status": m.status,
            "ready": m.is_ready(),
            "size": m.size(),
            "prefer": getattr(m, "prefer", None),
        }
        for name, m in MODELS.items()
    ]


def is_model_ready(model: Optional[str] = None) -> bool:
    names = [model] if model else list(MODELS)
    return all(MODELS[n].is_ready() for n in names)


def download_model(callback: ProgressCallback = None) -> None:
    cb = callback or progress_callback
    for name, m in MODELS.items():
        if not m.is_ready():
            print(f"[Lumina] Downloading OCR model: {name}")
            m.download(cb)


REGION_GAP = 48  # px — boxes closer than this chain together
REGION_MAX_BOXES = 10


def _group_regions(boxes: list[dict]) -> list[dict]:
    """Chain reading-order boxes into region crops (AABB within REGION_GAP)."""
    regions: list[dict] = []
    cur: Optional[dict] = None
    for b in boxes:
        if cur is not None and len(cur["boxes"]) < REGION_MAX_BOXES:
            gx = max(cur["x"] - (b["x"] + b["w"]), b["x"] - (cur["x"] + cur["w"]), 0)
            gy = max(cur["y"] - (b["y"] + b["h"]), b["y"] - (cur["y"] + cur["h"]), 0)
            if gx <= REGION_GAP and gy <= REGION_GAP:
                cur["boxes"].append(b)
                cur["x"] = min(cur["x"], b["x"])
                cur["y"] = min(cur["y"], b["y"])
                cur["w"] = max(cur["x"] + cur["w"], b["x"] + b["w"]) - cur["x"]
                cur["h"] = max(cur["y"] + cur["h"], b["y"] + b["h"]) - cur["y"]
                continue
        if cur is not None:
            regions.append(cur)
        cur = {"boxes": [b], "x": b["x"], "y": b["y"], "w": b["w"], "h": b["h"]}
    if cur is not None:
        regions.append(cur)
    return regions


def ocr_boxes(
    image_path: str,
    boxes: list[dict],
    model: str = DEFAULT_MODEL,
) -> list[str]:
    """Recognize text in every box; returns one string per box."""
    if model not in MODELS:
        raise ValueError(f"Unknown OCR model: {model}")
    m = MODELS[model]
    if m.supports_regions():
        per_region = m.ocr_regions(image_path, _group_regions(boxes))
        return [line for r in per_region for line in r]
    return m.ocr_boxes(image_path, boxes)


def unload_models() -> None:
    """Release every loaded OCR session (frees VRAM/RAM)."""
    for m in MODELS.values():
        try:
            m.unload()
        except Exception:
            pass
