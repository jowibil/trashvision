"""Render one annotated frame that visibly proves Stage B dedups.

Stage B only merges a handful of boxes per flight (v11 rarely double-detects:
~17 merges across 13 frames), so "draw the surviving boxes" would look exactly
like the raw output. This script therefore:

  1. scans a folder of frames and scores each by how many boxes Stage B merged;
  2. picks the frame with the most merges (ties broken by raw box count);
  3. draws retained boxes as thin outlines, the boxes Stage B discarded as
     thick dashed red with a connector to the box that absorbed them, and a
     header with the counts;
  4. crops each merge out of the FULL-RESOLUTION frame into its own labelled
     zoom tile — at full-frame scale two overlapping 40 px boxes are unreadable,
     and a single zoom inset misses merges that sit far apart.

It calls the production code (services.dbscan_service.cluster_boxes), never a
local re-implementation, so the picture shows the real decision.

Local review tool — not part of the API. Run from the repo root:

    backend/venv/Scripts/python.exe ml/preview_stage_b.py
    backend/venv/Scripts/python.exe ml/preview_stage_b.py --images <dir> --out ml/_review
"""
import argparse
import glob
import os
import sys

import cv2
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
sys.path.insert(0, os.path.join(PROJECT_ROOT, "backend"))

from ml.detect import INFERENCE_CONF, INFERENCE_IMGSZ, trash_detector  # noqa: E402
from services.dbscan_service import STAGE_B_IOU_EPS, _box_iou, cluster_boxes  # noqa: E402

DEFAULT_IMAGES = "C:/Users/vince/Downloads/TESTTHESEIMAGES"
DEFAULT_OUT = os.path.join(PROJECT_ROOT, "ml", "_review")

MAX_RENDER_WIDTH = 1800
HEADER_HEIGHT = 108
TILE_HEIGHT = 320
MAX_TILES = 3

# BGR — one colour per trained class, so a reader can tell a label change from
# a merge (Stage B keeps the surviving box's own class, never a fake mix).
CLASS_COLORS = {
    "composite_packaging": (86, 214, 86),
    "glass": (60, 200, 255),
    "metal": (200, 200, 200),
    "plastic": (255, 130, 40),
    "styrofoam": (180, 120, 255),
}
DEFAULT_COLOR = (255, 255, 255)
MERGE_COLOR = (60, 60, 235)  # red: the box Stage B discarded


def _color(label: str):
    return CLASS_COLORS.get(label, DEFAULT_COLOR)


def _box(det, scale, ox, oy):
    x1, y1, x2, y2 = det["bounding_box"]
    return [
        int(x1 * scale + ox),
        int(y1 * scale + oy),
        int(x2 * scale + ox),
        int(y2 * scale + oy),
    ]


def _center(box):
    return (int((box[0] + box[2]) / 2), int((box[1] + box[3]) / 2))


def _dashed_rect(img, box, color, thickness=2, dash=11, gap=7):
    """Rectangle with dashed edges — 'this box did not survive'."""
    x1, y1, x2, y2 = box
    for x in range(x1, x2, dash + gap):
        cv2.line(img, (x, y1), (min(x + dash, x2), y1), color, thickness)
        cv2.line(img, (x, y2), (min(x + dash, x2), y2), color, thickness)
    for y in range(y1, y2, dash + gap):
        cv2.line(img, (x1, y), (x1, min(y + dash, y2)), color, thickness)
        cv2.line(img, (x2, y), (x2, min(y + dash, y2)), color, thickness)


def _label(img, text, origin, color, font_scale=0.5):
    """Black plate + coloured text: legible over any frame content."""
    (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
    x, y = int(origin[0]), int(origin[1])
    # Keep the plate inside the image: zoom tiles are narrow and a clipped
    # "kept (dup=2)" is exactly the part a reader needs.
    if x + tw + 3 > img.shape[1] - 2:
        x = max(2, img.shape[1] - tw - 5)
    cv2.rectangle(img, (x - 2, y - th - 5), (x + tw + 3, y + base), (0, 0, 0), -1)
    cv2.putText(
        img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 1, cv2.LINE_AA
    )


def _survivor(group):
    return max(group["members"], key=lambda m: m["raw_det"]["confidence_score"])["raw_det"]


def draw_group(img, group, scale, ox, oy, thick, font, tag=None):
    """One merge group: dashed losers + connector, solid survivor on top.

    Returns (x1, y1, x2, y2, iou) per discarded box, in image coordinates, so
    the caller can build a zoom tile around exactly what was drawn.
    """
    best = _survivor(group)
    survivor_box = _box(best, scale, ox, oy)
    discarded = []

    for member in group["members"]:
        det = member["raw_det"]
        if det is best:
            continue
        box = _box(det, scale, ox, oy)
        iou = _box_iou(best["bounding_box"], det["bounding_box"])
        _dashed_rect(img, box, MERGE_COLOR, max(2, thick - 1))
        cv2.line(img, _center(box), _center(survivor_box), MERGE_COLOR, 1, cv2.LINE_AA)
        # Below the box: the survivor's label sits above its own box, and the
        # two boxes are usually within one label-height of each other.
        label_y = box[3] + 16
        if label_y > img.shape[0] - 6:
            label_y = max(box[1] - 6, 14)
        _label(
            img,
            f"discarded  IoU {iou:.2f}",
            (box[0] + 2, label_y),
            MERGE_COLOR,
            font * 0.9,
        )
        discarded.append((*box, iou))

    color = _color(best["classification"])
    cv2.rectangle(
        img, (survivor_box[0], survivor_box[1]), (survivor_box[2], survivor_box[3]), color, thick
    )
    text = f"{best['classification']} {best['confidence_score']:.2f}"
    if len(group["members"]) > 1:
        text += f"  kept (dup={len(group['members'])})"
    if tag:
        text = f"[{tag}] " + text
    _label(img, text, (survivor_box[0] + 2, max(survivor_box[1] - 6, 14)), color, font)
    return best, discarded


def score_frame(path):
    raw = trash_detector.run_inference(path)
    groups = cluster_boxes(raw)
    return raw, groups, len(raw) - len(groups)


def render(path, raw, groups, out_path):
    frame = cv2.imread(path)
    if frame is None:
        raise SystemExit(f"could not read {path}")

    height, width = frame.shape[:2]
    scale = min(1.0, MAX_RENDER_WIDTH / width)
    view = cv2.resize(
        frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA
    )

    merge_groups = [g for g in groups if len(g["members"]) > 1]

    # Full view: clean outlines everywhere, detail only where something merged.
    for group in groups:
        if len(group["members"]) == 1:
            box = _box(group["members"][0]["raw_det"], scale, 0, 0)
            cv2.rectangle(
                view,
                (box[0], box[1]),
                (box[2], box[3]),
                _color(group["members"][0]["raw_det"]["classification"]),
                1,
            )

    discarded_all = []
    for idx, group in enumerate(merge_groups, start=1):
        _, discarded = draw_group(
            view, group, scale, 0, 0, thick=3, font=0.52, tag=f"MERGE {idx}"
        )
        discarded_all.append(discarded)

    # Bottom strip: one full-resolution crop per merge, so the duplicate pair
    # is actually visible instead of implied by two 30 px boxes.
    tiles = []
    for idx, group in enumerate(merge_groups[:MAX_TILES], start=1):
        boxes = [m["raw_det"]["bounding_box"] for m in group["members"]]
        x1 = min(b[0] for b in boxes)
        y1 = min(b[1] for b in boxes)
        x2 = max(b[2] for b in boxes)
        y2 = max(b[3] for b in boxes)
        pad = max(28.0, 0.35 * max(x2 - x1, y2 - y1))
        cx1 = max(0, int(x1 - pad))
        cy1 = max(0, int(y1 - pad))
        cx2 = min(width, int(x2 + pad))
        cy2 = min(height, int(y2 + pad))

        crop = frame[cy1:cy2, cx1:cx2]
        tile_w = view.shape[1] // max(1, min(len(merge_groups), MAX_TILES))
        inner_w, inner_h = tile_w - 16, TILE_HEIGHT - 62
        zoom = min(inner_w / crop.shape[1], inner_h / crop.shape[0])
        tile = cv2.resize(crop, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)

        # Draw in crop coordinates: p_view = p_full * zoom - c1 * zoom.
        best, discarded = draw_group(
            tile, group, zoom, -cx1 * zoom, -cy1 * zoom, thick=3, font=0.52
        )
        iou = discarded[0][4] if discarded else float("nan")
        caption = (
            f"MERGE {idx}  x{zoom / scale:.1f} vs main view",
            f"{best['classification']} {best['confidence_score']:.2f} kept, "
            f"1 discarded (IoU {iou:.2f})",
        )
        tiles.append((tile, caption))

    tile_strip = np.zeros((TILE_HEIGHT if tiles else 0, view.shape[1], 3), dtype=np.uint8)
    if tiles:
        slot = view.shape[1] // max(1, len(tiles))
        image_area = TILE_HEIGHT - 56  # captions share one baseline across tiles
        for i, (tile, caption) in enumerate(tiles):
            ox = i * slot + max(0, (slot - tile.shape[1]) // 2)
            oy = max(8, (image_area - tile.shape[0]) // 2 + 8)
            tile_strip[oy : oy + tile.shape[0], ox : ox + tile.shape[1]] = tile
            cv2.rectangle(
                tile_strip, (ox, oy), (ox + tile.shape[1], oy + tile.shape[0]), (90, 90, 90), 1
            )
            for line_no, text in enumerate(caption):
                cv2.putText(
                    tile_strip,
                    text,
                    (i * slot + 10, TILE_HEIGHT - 30 + line_no * 22),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (120, 220, 255) if line_no == 0 else (235, 235, 235),
                    1,
                    cv2.LINE_AA,
                )

    header = np.zeros((HEADER_HEIGHT, view.shape[1], 3), dtype=np.uint8)
    merged = len(raw) - len(groups)
    lines = [
        f"STAGE B  same-frame dedup  -  {os.path.basename(path)}",
        f"v11 @ {INFERENCE_IMGSZ}px, conf {INFERENCE_CONF}  |  DBSCAN eps="
        f"{1.0 - STAGE_B_IOU_EPS:.2f} (1 - IoU), min_samples=1  |  merge when IoU >= {STAGE_B_IOU_EPS}",
        f"raw {len(raw)}  ->  retained {len(groups)}   |   {merged} duplicate box(es) discarded   "
        f"|   thin = kept rows, dashed red = discarded",
    ]
    for i, text in enumerate(lines):
        color = (255, 255, 255) if i < 2 else (120, 220, 255)
        cv2.putText(
            header,
            text,
            (18, 30 + i * 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.62 if i == 0 else 0.55,
            color,
            1,
            cv2.LINE_AA,
        )

    canvas = np.vstack([header, view, tile_strip])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cv2.imwrite(out_path, canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return len(groups), merged


def main() -> int:
    parser = argparse.ArgumentParser(description="Annotated Stage B dedup preview")
    parser.add_argument("--images", default=DEFAULT_IMAGES, help="folder of source frames")
    parser.add_argument("--out", default=DEFAULT_OUT, help="output folder")
    args = parser.parse_args()

    paths = sorted(
        p
        for p in glob.glob(os.path.join(args.images, "*"))
        if os.path.splitext(p)[1].lower() in (".jpg", ".jpeg", ".png")
    )
    if not paths:
        print(f"no frames found in {args.images}")
        return 1

    best = None
    print(f"{'frame':>34}  {'raw':>4}  {'kept':>4}  {'merged':>6}")
    for path in paths:
        raw, groups, merged = score_frame(path)
        print(
            f"{os.path.basename(path):>34}  {len(raw):>4}  {len(groups):>4}  {merged:>6}"
        )
        key = (merged, len(raw))
        if best is None or key > best[0]:
            best = (key, path, raw, groups)

    _, path, raw, groups = best
    out_path = os.path.join(
        args.out, f"stageb_preview_{os.path.splitext(os.path.basename(path))[0]}.jpg"
    )
    kept, merged = render(path, raw, groups, out_path)
    print()
    print(f"picked    : {os.path.basename(path)} (most merges)")
    print(f"result    : raw {len(raw)} -> retained {kept}, {merged} merged away")
    print(f"written   : {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
