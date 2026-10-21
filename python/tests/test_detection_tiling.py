from PIL import Image

from services.detect.tiling import TILE_SIZE, image_tiles, merge_detections


def test_long_image_tiles_cover_full_height_with_overlap():
    image = Image.new("RGB", (800, 11000))
    tiles = image_tiles(image)

    assert len(tiles) > 1
    assert max(tile.height for tile, _, _ in tiles) <= TILE_SIZE
    assert tiles[0][1:] == (0, 0)
    assert tiles[-1][2] + tiles[-1][0].height == image.height
    assert tiles[1][2] < tiles[0][0].height
    assert tiles[1][2] > 0


def test_short_image_is_not_cropped_or_resized():
    image = Image.new("RGB", (800, 1200))

    tiles = image_tiles(image)

    assert len(tiles) == 1
    assert tiles[0][0].size == image.size


def test_merge_detections_suppresses_same_box_even_when_types_differ():
    detections = [
        {
            "bbox": {"x": 10, "y": 20, "w": 30, "h": 40},
            "type": "text_free",
            "confidence": 0.8,
        },
        {
            "bbox": {"x": 11, "y": 20, "w": 30, "h": 40},
            "type": "text_free",
            "confidence": 0.9,
        },
        {
            "bbox": {"x": 11, "y": 20, "w": 30, "h": 40},
            "type": "text_bubble",
            "confidence": 0.7,
        },
    ]

    merged = merge_detections(detections)

    assert len(merged) == 1
    assert merged[0]["confidence"] == 0.9


def test_merge_detections_suppresses_near_contained_duplicate():
    detections = [
        {
            "bbox": {"x": 10, "y": 20, "w": 100, "h": 80},
            "type": "text_free",
            "confidence": 0.9,
        },
        {
            "bbox": {"x": 15, "y": 25, "w": 70, "h": 60},
            "type": "text_free",
            "confidence": 0.8,
        },
    ]

    merged = merge_detections(detections)

    assert len(merged) == 1
    assert merged[0]["confidence"] == 0.9
