"""RT-DETR-v2 r50vd (ogkalu comic detector) via ONNX Runtime."""
from __future__ import annotations

import numpy as np
from PIL import Image

from utils.logger import log

from ..base import BaseDetectModel
from ..tiling import image_tiles, merge_detections
from .config import MODEL_FILENAME, MODEL_ID, PREFER
from . import postprocess as pp
from . import preprocess as prep


class RTDetrModel(BaseDetectModel):
    """RT-DETR v2 r50vd fine-tuned for comics (text + speech bubbles)."""

    name = "RT-DETR Text & Bubble Detector"
    model_id = MODEL_ID
    model_filename = MODEL_FILENAME
    prefer = PREFER

    def detect(self, image_path: str) -> dict:
        session = self._load_session()

        log.debug(f"Detect input: {image_path}")
        with Image.open(image_path) as source:
            image = source.convert("RGB")
        detections = []
        tiles = image_tiles(image)
        for tile, offset_x, offset_y in tiles:
            tensor, w, h = prep.preprocess(tile)
            # The graph returns absolute coordinates for the tile dimensions.
            feed = {
                "images": tensor,
                "orig_target_sizes": np.array([[w, h]], dtype=np.int64),
            }
            outputs = [np.asarray(o) for o in session.run(None, feed)]
            labels, boxes, scores = pp.split_outputs(session, outputs)
            result = pp.postprocess(labels, boxes, scores, w, h)
            for detection in result["textDetections"]:
                detection["bbox"]["x"] += offset_x
                detection["bbox"]["y"] += offset_y
                detections.append(detection)

        detections = merge_detections(detections)
        log.info(f"Detected {len(detections)} text")
        return {"textDetections": detections, "bubbleDetections": []}
