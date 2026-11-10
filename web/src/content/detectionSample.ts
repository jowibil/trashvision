// GENERATED FILE — do not edit by hand.
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

export const DETECTION_SAMPLE: DetectionSample = {
  "frame": "DJI_20261105113701_0915_D.JPG",
  "generated": "2026-11-11",
  "image": {
    "file": "detection-sample.jpg",
    "width": 1200,
    "height": 675
  },
  "inference": {
    "imgsz": 1280,
    "conf": 0.25
  },
  "stage_b": {
    "iou_threshold": 0.5
  },
  "counts": {
    "raw_boxes": 40,
    "detections": 37,
    "merged": 3
  },
  "detections": [
    {
      "id": 1,
      "label": "plastic",
      "confidence": 0.781,
      "box": [
        753.1,
        382.3,
        798.3,
        424.7
      ],
      "merged": []
    },
    {
      "id": 2,
      "label": "plastic",
      "confidence": 0.722,
      "box": [
        195.1,
        562.2,
        255.4,
        613.3
      ],
      "merged": []
    },
    {
      "id": 3,
      "label": "plastic",
      "confidence": 0.711,
      "box": [
        679.4,
        177.5,
        733.5,
        233.9
      ],
      "merged": []
    },
    {
      "id": 4,
      "label": "plastic",
      "confidence": 0.709,
      "box": [
        0.2,
        219.0,
        26.8,
        266.0
      ],
      "merged": []
    },
    {
      "id": 5,
      "label": "plastic",
      "confidence": 0.701,
      "box": [
        126.7,
        56.8,
        176.9,
        88.3
      ],
      "merged": []
    },
    {
      "id": 6,
      "label": "plastic",
      "confidence": 0.677,
      "box": [
        149.3,
        631.1,
        182.6,
        669.1
      ],
      "merged": []
    },
    {
      "id": 7,
      "label": "plastic",
      "confidence": 0.66,
      "box": [
        503.0,
        654.9,
        529.7,
        675.0
      ],
      "merged": []
    },
    {
      "id": 8,
      "label": "plastic",
      "confidence": 0.65,
      "box": [
        631.2,
        240.1,
        676.1,
        277.3
      ],
      "merged": []
    },
    {
      "id": 9,
      "label": "plastic",
      "confidence": 0.646,
      "box": [
        175.4,
        339.6,
        307.0,
        466.8
      ],
      "merged": [
        {
          "label": "styrofoam",
          "confidence": 0.347,
          "box": [
            173.1,
            340.2,
            307.1,
            463.5
          ],
          "iou": 0.953
        }
      ]
    },
    {
      "id": 10,
      "label": "plastic",
      "confidence": 0.63,
      "box": [
        565.5,
        389.3,
        676.9,
        441.3
      ],
      "merged": []
    },
    {
      "id": 11,
      "label": "plastic",
      "confidence": 0.622,
      "box": [
        106.8,
        591.2,
        129.9,
        618.2
      ],
      "merged": []
    },
    {
      "id": 12,
      "label": "plastic",
      "confidence": 0.617,
      "box": [
        409.8,
        218.7,
        443.2,
        241.4
      ],
      "merged": []
    },
    {
      "id": 13,
      "label": "plastic",
      "confidence": 0.576,
      "box": [
        232.2,
        54.0,
        269.6,
        91.0
      ],
      "merged": []
    },
    {
      "id": 14,
      "label": "plastic",
      "confidence": 0.529,
      "box": [
        283.3,
        343.1,
        313.7,
        375.5
      ],
      "merged": []
    },
    {
      "id": 15,
      "label": "plastic",
      "confidence": 0.526,
      "box": [
        161.6,
        290.2,
        215.2,
        340.0
      ],
      "merged": []
    },
    {
      "id": 16,
      "label": "plastic",
      "confidence": 0.501,
      "box": [
        592.2,
        31.9,
        636.2,
        62.4
      ],
      "merged": []
    },
    {
      "id": 17,
      "label": "composite_packaging",
      "confidence": 0.488,
      "box": [
        0.2,
        97.7,
        29.3,
        126.7
      ],
      "merged": [
        {
          "label": "plastic",
          "confidence": 0.253,
          "box": [
            0.0,
            97.6,
            29.4,
            126.6
          ],
          "iou": 0.987
        }
      ]
    },
    {
      "id": 18,
      "label": "styrofoam",
      "confidence": 0.462,
      "box": [
        672.6,
        395.9,
        701.1,
        438.6
      ],
      "merged": []
    },
    {
      "id": 19,
      "label": "plastic",
      "confidence": 0.426,
      "box": [
        383.4,
        157.6,
        425.7,
        203.0
      ],
      "merged": []
    },
    {
      "id": 20,
      "label": "plastic",
      "confidence": 0.404,
      "box": [
        422.6,
        238.1,
        450.4,
        264.7
      ],
      "merged": []
    },
    {
      "id": 21,
      "label": "plastic",
      "confidence": 0.385,
      "box": [
        749.0,
        176.5,
        786.5,
        215.5
      ],
      "merged": []
    },
    {
      "id": 22,
      "label": "plastic",
      "confidence": 0.383,
      "box": [
        377.4,
        223.1,
        409.0,
        247.8
      ],
      "merged": []
    },
    {
      "id": 23,
      "label": "plastic",
      "confidence": 0.357,
      "box": [
        768.3,
        106.9,
        809.3,
        154.3
      ],
      "merged": []
    },
    {
      "id": 24,
      "label": "plastic",
      "confidence": 0.353,
      "box": [
        532.3,
        521.7,
        579.6,
        570.7
      ],
      "merged": []
    },
    {
      "id": 25,
      "label": "plastic",
      "confidence": 0.341,
      "box": [
        542.2,
        649.5,
        585.3,
        675.0
      ],
      "merged": []
    },
    {
      "id": 26,
      "label": "styrofoam",
      "confidence": 0.325,
      "box": [
        978.7,
        467.8,
        1033.8,
        540.9
      ],
      "merged": []
    },
    {
      "id": 27,
      "label": "plastic",
      "confidence": 0.322,
      "box": [
        652.4,
        89.5,
        755.5,
        155.9
      ],
      "merged": []
    },
    {
      "id": 28,
      "label": "plastic",
      "confidence": 0.318,
      "box": [
        103.3,
        654.7,
        136.6,
        675.0
      ],
      "merged": []
    },
    {
      "id": 29,
      "label": "plastic",
      "confidence": 0.317,
      "box": [
        692.6,
        163.1,
        714.6,
        180.3
      ],
      "merged": []
    },
    {
      "id": 30,
      "label": "plastic",
      "confidence": 0.316,
      "box": [
        229.7,
        104.9,
        271.2,
        136.2
      ],
      "merged": []
    },
    {
      "id": 31,
      "label": "plastic",
      "confidence": 0.312,
      "box": [
        949.5,
        381.1,
        1047.9,
        460.5
      ],
      "merged": [
        {
          "label": "styrofoam",
          "confidence": 0.284,
          "box": [
            949.5,
            380.8,
            1048.3,
            460.9
          ],
          "iou": 0.986
        }
      ]
    },
    {
      "id": 32,
      "label": "plastic",
      "confidence": 0.303,
      "box": [
        571.8,
        568.8,
        595.1,
        594.2
      ],
      "merged": []
    },
    {
      "id": 33,
      "label": "plastic",
      "confidence": 0.289,
      "box": [
        486.2,
        376.2,
        566.4,
        452.9
      ],
      "merged": []
    },
    {
      "id": 34,
      "label": "plastic",
      "confidence": 0.283,
      "box": [
        127.4,
        444.8,
        164.7,
        506.3
      ],
      "merged": []
    },
    {
      "id": 35,
      "label": "plastic",
      "confidence": 0.266,
      "box": [
        305.4,
        18.3,
        341.8,
        44.0
      ],
      "merged": []
    },
    {
      "id": 36,
      "label": "styrofoam",
      "confidence": 0.26,
      "box": [
        832.3,
        344.2,
        880.3,
        394.8
      ],
      "merged": []
    },
    {
      "id": 37,
      "label": "plastic",
      "confidence": 0.251,
      "box": [
        1164.2,
        182.0,
        1200.0,
        217.1
      ],
      "merged": []
    }
  ]
};
