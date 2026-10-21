"""KoharuLayout RF-DETR Seg 2XL (ShiniShiho ONNX) via ONNX Runtime."""
from __future__ import annotations

import numpy as np
import cv2 as cv
from PIL import Image

from utils.logger import log

from ..base import BaseDetectModel
from ..tiling import image_tiles, merge_detections
from .config import MODEL_FILENAME, MODEL_ID, PREFER
from . import mask as mask_io
from . import postprocess as pp
from . import preprocess as prep


class RfDetrSegModel(BaseDetectModel):
    """Text/bubble boxes + instance masks for manga pages."""

    name = "KoharuLayout RF-DETR Seg (Text + Masks)"
    model_id = MODEL_ID
    model_filename = MODEL_FILENAME
    prefer = PREFER

    def detect(self, image_path: str) -> dict:
        session = self._load_session()

        log.debug(f"Detect input: {image_path}")
        with Image.open(image_path) as source:
            image = source.convert("RGB")
        width, height = image.size
        detections = []
        full_mask = np.zeros((height, width), np.uint8)
        has_mask = False
        tiles = image_tiles(image)
        for tile, offset_x, offset_y in tiles:
            tensor, tile_w, tile_h = prep.preprocess(tile)
            inp_type = session.get_inputs()[0].type
            if "float16" in inp_type:
                tensor = tensor.astype(np.float16)
            outputs = [
                np.asarray(o, dtype=np.float32)
                for o in session.run(None, {"input": tensor})
            ]
            dets, labels, masks = pp.split_outputs(session, outputs)
            result, mask = pp.postprocess(
                dets, labels, masks, tile_w, tile_h
            )
            for detection in result["textDetections"]:
                detection["bbox"]["x"] += offset_x
                detection["bbox"]["y"] += offset_y
                detections.append(detection)
            if mask is not None:
                full_mask[
                    offset_y : offset_y + tile_h,
                    offset_x : offset_x + tile_w,
                ] = np.maximum(
                    full_mask[
                        offset_y : offset_y + tile_h,
                        offset_x : offset_x + tile_w,
                    ],
                    mask,
                )
                has_mask = True

        detections = merge_detections(detections)
        result = {
            "textDetections": detections,
            "bubbleDetections": [],
        }
        if has_mask:
            result["maskPath"] = mask_io.save_mask(full_mask, image_path)
            log.debug(f"Mask saved: {result['maskPath']}")

        log.info(
            f"Detected {len(detections)} text "
            f"(mask: {'yes' if has_mask else 'no'})"
        )
        return result
