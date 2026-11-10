"""Export one real frame + its detections as assets for the Info page demo.

One-shot local tool, not part of the API. It calls the production detector and
the production Stage B (`services.dbscan_service.cluster_boxes`), then writes:

    web/src/assets/explainer/detection-sample.jpg   resized frame
    web/src/content/detectionSample.ts              typed detection data

Every box in the emitted data is in the JPEG's own pixel space, so the page can
place it as a percentage of the image with no scaling state. Each surviving
detection also carries the raw boxes Stage B absorbed into it (`merged`), which
is what makes the demo's counts readable: N raw boxes -> M detections.

Run from the repo root:

    backend/venv/Scripts/python.exe ml/export_explainer_sample.py
    backend/venv/Scripts/python.exe ml/export_explainer_sample.py --frame DJI_0540.JPG
"""
import argparse
import glob
import json
import os
import statistics
import sys
from datetime import date

import cv2

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
sys.path.insert(0, os.path.join(PROJECT_ROOT, "backend"))

from ml.detect import INFERENCE_CONF, INFERENCE_IMGSZ, trash_detector  # noqa: E402
from services.dbscan_service import STAGE_B_IOU_EPS, _box_iou, cluster_boxes  # noqa: E402

DEFAULT_IMAGES = "C:/Users/vince/Downloads/TESTTHESEIMAGES"
DEFAULT_ASSETS = os.path.join(PROJECT_ROOT, "web", "src", "assets", "explainer")
DEFAULT_MODULE = os.path.join(PROJECT_ROOT, "web", "src", "content", "detectionSample.ts")
DEFAULT_DART_MODULE = os.path.join(
    PROJECT_ROOT, "mobile", "lib", "models", "detection_sample.dart"
)
DEFAULT_MOBILE_ASSETS = os.path.join(PROJECT_ROOT, "mobile", "assets", "explainer")

TS_HEADER = """// GENERATED FILE — do not edit by hand.
//
// Written by ml/export_explainer_sample.py, which runs the production detector
// and the production Stage B over one real drone frame. Boxes are in the
// pixel space of the JPEG beside this module (assets/explainer/detection-sample.jpg),
// so the page positions them as percentages of the rendered image.
//
// Regenerate after a weights change:
//   backend/venv/Scripts/python.exe ml/export_explainer_sample.py

export interface SampleBox {
  label: string;
  confidence: number;
  /** [x1, y1, x2, y2] in image pixels. */
  box: [number, number, number, number];
  /** IoU with the surviving box (only on merged entries). */
  iou: number;
}

export interface SampleDetection {
  id: number;
  label: string;
  confidence: number;
  box: [number, number, number, number];
  /** Raw boxes Stage B folded into this one. Empty for singletons. */
  merged: SampleBox[];
}

export interface DetectionSample {
  frame: string;
  generated: string;
  image: { file: string; width: number; height: number };
  inference: { imgsz: number; conf: number };
  stage_b: { iou_threshold: number };
  counts: { raw_boxes: number; detections: number; merged: number };
  detections: SampleDetection[];
}

export const DETECTION_SAMPLE: DetectionSample = """

# The phone reads the same frame, so the data is emitted twice from one run.
# Keep the two files in lockstep: the Info screen on both platforms documents the
# same detections, and a weights change must not leave one of them stale.
DART_HEADER = """// GENERATED FILE — do not edit by hand.
//
// Written by ml/export_explainer_sample.py, the same run that produces
// web/src/content/detectionSample.ts and the JPEG beside it. Boxes are in the
// pixel space of assets/explainer/__IMAGE__, so the phone renders them as
// fractions of the displayed frame and no scaling state is needed.
//
// Regenerate after a weights change:
//   backend/venv/Scripts/python.exe ml/export_explainer_sample.py

/// One raw box Stage B folded into a surviving detection.
class SampleBox {
  final String label;
  final double confidence;

  /// `[x1, y1, x2, y2]` in image pixels.
  final List<double> box;

  /// IoU with the surviving box.
  final double iou;

  const SampleBox({
    required this.label,
    required this.confidence,
    required this.box,
    required this.iou,
  });
}

/// One stored detection: the highest-confidence box of its Stage B group.
class SampleDetection {
  final int id;
  final String label;
  final double confidence;
  final List<double> box;

  /// Raw boxes this one absorbed. Empty for singletons.
  final List<SampleBox> merged;

  const SampleDetection({
    required this.id,
    required this.label,
    required this.confidence,
    required this.box,
    required this.merged,
  });
}

class DetectionSample {
  final String frame;
  final String generated;
  final String imageFile;
  final int imageWidth;
  final int imageHeight;
  final int inferenceImgsz;
  final double inferenceConf;
  final double stageBIouThreshold;
  final int rawBoxes;
  final int detectionCount;
  final int mergedCount;
  final List<SampleDetection> detections;

  const DetectionSample({
    required this.frame,
    required this.generated,
    required this.imageFile,
    required this.imageWidth,
    required this.imageHeight,
    required this.inferenceImgsz,
    required this.inferenceConf,
    required this.stageBIouThreshold,
    required this.rawBoxes,
    required this.detectionCount,
    required this.mergedCount,
    required this.detections,
  });
}

/// One real drone frame, run through the production detector and Stage B.
const DetectionSample detectionSample = DetectionSample(
"""


def _dart_num(value):
    """44.0 -> 44, 0.781 -> 0.781: Dart reads both as double in a double list."""
    if isinstance(value, int):
        return str(value)
    if float(value).is_integer():
        return str(int(value))
    return repr(float(value))


def _dart_box(box):
    return "[" + ", ".join(_dart_num(v) for v in box) + "]"


def render_dart(sample):
    """Dart twin of the TS module — same numbers, same order, same boxes."""
    lines = [DART_HEADER.replace("__IMAGE__", sample["image"]["file"])]
    lines.append(f"  frame: '{sample['frame']}',\n")
    lines.append(f"  generated: '{sample['generated']}',\n")
    lines.append(f"  imageFile: 'assets/explainer/{sample['image']['file']}',\n")
    lines.append(f"  imageWidth: {sample['image']['width']},\n")
    lines.append(f"  imageHeight: {sample['image']['height']},\n")
    lines.append(f"  inferenceImgsz: {sample['inference']['imgsz']},\n")
    lines.append(f"  inferenceConf: {_dart_num(sample['inference']['conf'])},\n")
    lines.append(
        f"  stageBIouThreshold: {_dart_num(sample['stage_b']['iou_threshold'])},\n"
    )
    lines.append(f"  rawBoxes: {sample['counts']['raw_boxes']},\n")
    lines.append(f"  detectionCount: {sample['counts']['detections']},\n")
    lines.append(f"  mergedCount: {sample['counts']['merged']},\n")
    lines.append("  detections: <SampleDetection>[\n")
    for det in sample["detections"]:
        lines.append("    SampleDetection(\n")
        lines.append(f"      id: {det['id']},\n")
        lines.append(f"      label: '{det['label']}',\n")
        lines.append(f"      confidence: {_dart_num(det['confidence'])},\n")
        lines.append(f"      box: {_dart_box(det['box'])},\n")
        if det["merged"]:
            lines.append("      merged: <SampleBox>[\n")
            for merged in det["merged"]:
                lines.append(
                    "        SampleBox("
                    f"label: '{merged['label']}', "
                    f"confidence: {_dart_num(merged['confidence'])}, "
                    f"box: {_dart_box(merged['box'])}, "
                    f"iou: {_dart_num(merged['iou'])}),\n"
                )
            lines.append("      ],\n")
        else:
            lines.append("      merged: <SampleBox>[],\n")
        lines.append("    ),\n")
    lines.append("  ],\n")
    lines.append(");\n")
    return "".join(lines)


def _survivor(group):
    """Highest-confidence box of a Stage B group — the row that gets stored."""
    return max(group["members"], key=lambda m: m["raw_det"]["confidence_score"])["raw_det"]


def _scaled(box, scale):
    x1, y1, x2, y2 = box
    return [round(v * scale, 1) for v in (x1, y1, x2, y2)]


def build_sample(raw, groups, scale, width, height):
    detections = []
    merged_total = 0
    for idx, group in enumerate(groups, start=1):
        best = _survivor(group)
        merged = []
        for member in group["members"]:
            det = member["raw_det"]
            if det is best:
                continue
            merged.append(
                {
                    "label": det["classification"],
                    "confidence": round(float(det["confidence_score"]), 3),
                    "box": _scaled(det["bounding_box"], scale),
                    "iou": round(float(_box_iou(best["bounding_box"], det["bounding_box"])), 3),
                }
            )
        merged_total += len(merged)
        detections.append(
            {
                "id": idx,
                "label": best["classification"],
                "confidence": round(float(best["confidence_score"]), 3),
                "box": _scaled(best["bounding_box"], scale),
                "merged": merged,
            }
        )

    detections.sort(key=lambda d: -d["confidence"])
    return {
        "image": {"file": "detection-sample.jpg", "width": width, "height": height},
        "inference": {"imgsz": INFERENCE_IMGSZ, "conf": INFERENCE_CONF},
        "stage_b": {"iou_threshold": STAGE_B_IOU_EPS},
        "counts": {
            "raw_boxes": len(raw),
            "detections": len(detections),
            "merged": merged_total,
        },
        "detections": detections,
    }


def score(path):
    raw = trash_detector.run_inference(path)
    groups = cluster_boxes(raw)
    return raw, groups, len(raw) - len(groups)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export an Info-page detection sample")
    parser.add_argument("--images", default=DEFAULT_IMAGES, help="folder of source frames")
    parser.add_argument("--frame", default=None, help="pick this frame instead of scoring all")
    parser.add_argument("--assets", default=DEFAULT_ASSETS, help="asset output folder")
    parser.add_argument("--module", default=DEFAULT_MODULE, help="generated TS module path")
    parser.add_argument(
        "--dart-module",
        default=DEFAULT_DART_MODULE,
        help="generated Dart module path (mobile)",
    )
    parser.add_argument(
        "--mobile-assets",
        default=DEFAULT_MOBILE_ASSETS,
        help="mobile asset folder that receives the same JPEG",
    )
    parser.add_argument("--width", type=int, default=1200, help="export width in pixels")
    parser.add_argument("--quality", type=int, default=82, help="JPEG quality")
    args = parser.parse_args()

    paths = sorted(
        p
        for p in glob.glob(os.path.join(args.images, "*"))
        if os.path.splitext(p)[1].lower() in (".jpg", ".jpeg", ".png")
    )
    if args.frame:
        paths = [p for p in paths if args.frame.lower() in os.path.basename(p).lower()]
    if not paths:
        print(f"no frames found in {args.images} matching {args.frame or '*'}")
        return 1

    best = None
    print(f"{'frame':>34}  {'raw':>4}  {'kept':>4}  {'merged':>6}  {'med box':>8}")
    for path in paths:
        raw, groups, merged = score(path)
        shot = cv2.imread(path)
        if shot is None:
            print(f"{os.path.basename(path):>34}  (could not read)")
            continue
        widths = [
            (d["bounding_box"][2] - d["bounding_box"][0]) / shot.shape[1] * 100 for d in raw
        ]
        median_pct = statistics.median(widths) if widths else 0.0
        print(
            f"{os.path.basename(path):>34}  {len(raw):>4}  {len(groups):>4}  "
            f"{merged:>6}  {median_pct:>7.1f}%"
        )
        # Rank by what a reader can actually SEE in the demo: a frame where
        # Stage B merged at least once, then the largest objects (this dataset's
        # litter runs 4-8 cm, so most boxes are ~2% of a 4000 px frame and
        # unreadable as boxes), then the busier frame as a tie-break.
        key = (merged > 0, median_pct, len(raw))
        if best is None or key > best[0]:
            best = (key, path, raw, groups)

    _, path, raw, groups = best
    frame = cv2.imread(path)
    if frame is None:
        raise SystemExit(f"could not read {path}")
    height, width = frame.shape[:2]
    scale = min(1.0, args.width / width)
    out_w, out_h = int(width * scale), int(height * scale)
    resized = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)

    os.makedirs(args.assets, exist_ok=True)
    image_path = os.path.join(args.assets, "detection-sample.jpg")
    cv2.imwrite(image_path, resized, [int(cv2.IMWRITE_JPEG_QUALITY), args.quality])

    sample = {
        "frame": os.path.basename(path),
        "generated": date.today().isoformat(),
        **build_sample(raw, groups, scale, out_w, out_h),
    }
    os.makedirs(os.path.dirname(args.module), exist_ok=True)
    with open(args.module, "w", encoding="utf-8", newline="\n") as f:
        f.write(TS_HEADER)
        f.write(json.dumps(sample, indent=2))
        f.write(";\n")

    # The phone documents the same frame, so both outputs come from this run.
    os.makedirs(args.mobile_assets, exist_ok=True)
    mobile_image = os.path.join(args.mobile_assets, "detection-sample.jpg")
    if os.path.abspath(mobile_image) != os.path.abspath(image_path):
        cv2.imwrite(mobile_image, resized, [int(cv2.IMWRITE_JPEG_QUALITY), args.quality])
    os.makedirs(os.path.dirname(args.dart_module), exist_ok=True)
    with open(args.dart_module, "w", encoding="utf-8", newline="\n") as f:
        f.write(render_dart(sample))

    counts = sample["counts"]
    print()
    print(f"picked    : {sample['frame']} (merged, then largest objects)")
    print(
        f"result    : raw {counts['raw_boxes']} -> detections {counts['detections']}, "
        f"{counts['merged']} merged away"
    )
    print(f"image     : {image_path} ({out_w}x{out_h})")
    print(f"image     : {mobile_image}")
    print(f"data      : {args.module}")
    print(f"data      : {args.dart_module}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
