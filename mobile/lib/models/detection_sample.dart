// GENERATED FILE — do not edit by hand.
//
// Written by ml/export_explainer_sample.py, the same run that produces
// web/src/content/detectionSample.ts and the JPEG beside it. Boxes are in the
// pixel space of assets/explainer/detection-sample.jpg, so the phone renders them as
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
  frame: 'DJI_20261105113701_0915_D.JPG',
  generated: '2026-11-11',
  imageFile: 'assets/explainer/detection-sample.jpg',
  imageWidth: 1200,
  imageHeight: 675,
  inferenceImgsz: 1280,
  inferenceConf: 0.25,
  stageBIouThreshold: 0.5,
  rawBoxes: 40,
  detectionCount: 37,
  mergedCount: 3,
  detections: <SampleDetection>[
    SampleDetection(
      id: 1,
      label: 'plastic',
      confidence: 0.781,
      box: [753.1, 382.3, 798.3, 424.7],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 2,
      label: 'plastic',
      confidence: 0.722,
      box: [195.1, 562.2, 255.4, 613.3],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 3,
      label: 'plastic',
      confidence: 0.711,
      box: [679.4, 177.5, 733.5, 233.9],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 4,
      label: 'plastic',
      confidence: 0.709,
      box: [0.2, 219, 26.8, 266],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 5,
      label: 'plastic',
      confidence: 0.701,
      box: [126.7, 56.8, 176.9, 88.3],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 6,
      label: 'plastic',
      confidence: 0.677,
      box: [149.3, 631.1, 182.6, 669.1],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 7,
      label: 'plastic',
      confidence: 0.66,
      box: [503, 654.9, 529.7, 675],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 8,
      label: 'plastic',
      confidence: 0.65,
      box: [631.2, 240.1, 676.1, 277.3],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 9,
      label: 'plastic',
      confidence: 0.646,
      box: [175.4, 339.6, 307, 466.8],
      merged: <SampleBox>[
        SampleBox(label: 'styrofoam', confidence: 0.347, box: [173.1, 340.2, 307.1, 463.5], iou: 0.953),
      ],
    ),
    SampleDetection(
      id: 10,
      label: 'plastic',
      confidence: 0.63,
      box: [565.5, 389.3, 676.9, 441.3],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 11,
      label: 'plastic',
      confidence: 0.622,
      box: [106.8, 591.2, 129.9, 618.2],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 12,
      label: 'plastic',
      confidence: 0.617,
      box: [409.8, 218.7, 443.2, 241.4],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 13,
      label: 'plastic',
      confidence: 0.576,
      box: [232.2, 54, 269.6, 91],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 14,
      label: 'plastic',
      confidence: 0.529,
      box: [283.3, 343.1, 313.7, 375.5],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 15,
      label: 'plastic',
      confidence: 0.526,
      box: [161.6, 290.2, 215.2, 340],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 16,
      label: 'plastic',
      confidence: 0.501,
      box: [592.2, 31.9, 636.2, 62.4],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 17,
      label: 'composite_packaging',
      confidence: 0.488,
      box: [0.2, 97.7, 29.3, 126.7],
      merged: <SampleBox>[
        SampleBox(label: 'plastic', confidence: 0.253, box: [0, 97.6, 29.4, 126.6], iou: 0.987),
      ],
    ),
    SampleDetection(
      id: 18,
      label: 'styrofoam',
      confidence: 0.462,
      box: [672.6, 395.9, 701.1, 438.6],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 19,
      label: 'plastic',
      confidence: 0.426,
      box: [383.4, 157.6, 425.7, 203],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 20,
      label: 'plastic',
      confidence: 0.404,
      box: [422.6, 238.1, 450.4, 264.7],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 21,
      label: 'plastic',
      confidence: 0.385,
      box: [749, 176.5, 786.5, 215.5],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 22,
      label: 'plastic',
      confidence: 0.383,
      box: [377.4, 223.1, 409, 247.8],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 23,
      label: 'plastic',
      confidence: 0.357,
      box: [768.3, 106.9, 809.3, 154.3],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 24,
      label: 'plastic',
      confidence: 0.353,
      box: [532.3, 521.7, 579.6, 570.7],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 25,
      label: 'plastic',
      confidence: 0.341,
      box: [542.2, 649.5, 585.3, 675],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 26,
      label: 'styrofoam',
      confidence: 0.325,
      box: [978.7, 467.8, 1033.8, 540.9],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 27,
      label: 'plastic',
      confidence: 0.322,
      box: [652.4, 89.5, 755.5, 155.9],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 28,
      label: 'plastic',
      confidence: 0.318,
      box: [103.3, 654.7, 136.6, 675],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 29,
      label: 'plastic',
      confidence: 0.317,
      box: [692.6, 163.1, 714.6, 180.3],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 30,
      label: 'plastic',
      confidence: 0.316,
      box: [229.7, 104.9, 271.2, 136.2],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 31,
      label: 'plastic',
      confidence: 0.312,
      box: [949.5, 381.1, 1047.9, 460.5],
      merged: <SampleBox>[
        SampleBox(label: 'styrofoam', confidence: 0.284, box: [949.5, 380.8, 1048.3, 460.9], iou: 0.986),
      ],
    ),
    SampleDetection(
      id: 32,
      label: 'plastic',
      confidence: 0.303,
      box: [571.8, 568.8, 595.1, 594.2],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 33,
      label: 'plastic',
      confidence: 0.289,
      box: [486.2, 376.2, 566.4, 452.9],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 34,
      label: 'plastic',
      confidence: 0.283,
      box: [127.4, 444.8, 164.7, 506.3],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 35,
      label: 'plastic',
      confidence: 0.266,
      box: [305.4, 18.3, 341.8, 44],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 36,
      label: 'styrofoam',
      confidence: 0.26,
      box: [832.3, 344.2, 880.3, 394.8],
      merged: <SampleBox>[],
    ),
    SampleDetection(
      id: 37,
      label: 'plastic',
      confidence: 0.251,
      box: [1164.2, 182, 1200, 217.1],
      merged: <SampleBox>[],
    ),
  ],
);
