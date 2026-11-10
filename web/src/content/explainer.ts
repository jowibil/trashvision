// Content layer for the Info page explainer sections. Components import from
// here; they never hardcode a number.
//
// Provenance of every figure in this file:
//   • training steps  — the run's own args.yaml + results.csv (stage1_v11_1280_fix)
//   • dataset counts  — the v11 export's data.yaml (mirrored in ml/dataset_manifest.json,
//                       which GET /info serves for the model card)
//   • base metrics    — the training notebook outputs (YOLOv8 / Faster R-CNN / SSD)
//   • fine-tuned row  — the same notebook, scoring the checkpoint we deploy
//
// Thresholds the platform COMPUTES with are deliberately absent: severity bands,
// dedup parameters and hex sizing arrive from GET /info, and the CCI bands come
// from services/hooks/useHexbins. Keep it that way — the page's contract is that
// no live threshold is re-typed in a content file.

import joebellePhoto from "../assets/explainer/team/joebelle-genota.jpg";
import ciarlienPhoto from "../assets/explainer/team/ciarlien-ruth-eturma.jpg";
import vincePhoto from "../assets/explainer/team/vince-keth-maarat.jpg";

export interface TrainingStep {
  title: string;
  body: string;
  /** [label, value] pairs shown under the step. */
  facts: [string, string][];
}

export const TRAINING_STEPS: TrainingStep[] = [
  {
    title: "Annotate",
    body:
      "Every piece of shoreline waste in a frame is boxed and labelled in Roboflow with one of the five classes.",
    facts: [
      ["Tool", "Roboflow"],
      ["Classes", "5"],
      ["License", "CC BY 4.0"],
    ],
  },
  {
    title: "Export & split",
    body:
      "Roboflow exports the set in YOLOv8 format with a fixed train/validation/test split — the same export the " +
      "training run consumed and the model card on this page reports.",
    facts: [
      ["Export", "v11"],
      ["Split", "1,635 / 350 / 351"],
      ["Images", "2,336"],
    ],
  },
  {
    title: "Train",
    body:
      "YOLOv8s starts from COCO-pretrained weights and trains in a Colab session with bounded augmentation, " +
      "at the resolution the detector is meant to run at.",
    facts: [
      ["Base weights", "yolov8s.pt"],
      ["Epochs", "80"],
      ["Batch", "12"],
      ["Image size", "1280 px"],
      ["Optimizer", "AdamW, lr 1e-3 with cosine decay"],
      ["Augmentation", "mosaic 0.2 · mixup 0.1 · ±10° · scale 0.2 · flip 0.5"],
      ["Wall clock", "≈ 1 h 55 m"],
    ],
  },
  {
    title: "Evaluate & deploy",
    body:
      "The checkpoint with the best validation score on the validation split is what the backend loads — " +
      "the fine-tuned row below is that checkpoint, measured at the training image size.",
    facts: [
      ["Checkpoint", "best.pt"],
      ["Evaluated at", "1280 px"],
      ["Deployed as", "ml/weights/trashvision/weights/best.pt"],
    ],
  },
];

export type MetricKey = "mAP50" | "mAP5095" | "precision" | "recall";

export interface ModelMetrics {
  id: string;
  name: string;
  family: string;
  mAP50: number;
  mAP5095: number;
  precision: number;
  recall: number;
}

/** Base-trained comparison: three detectors, one dataset, one protocol. */
export const BASE_MODELS: ModelMetrics[] = [
  {
    id: "yolov8",
    name: "YOLOv8",
    family: "single-stage · yolov8s",
    mAP50: 46.5,
    mAP5095: 26.5,
    precision: 62.7,
    recall: 44.3,
  },
  {
    id: "faster-rcnn",
    name: "Faster R-CNN",
    family: "two-stage",
    mAP50: 39.9,
    mAP5095: 23.8,
    precision: 39.9,
    recall: 39.0,
  },
  {
    id: "ssd",
    name: "SSD",
    family: "single-stage",
    mAP50: 24.5,
    mAP5095: 12.9,
    precision: 24.5,
    recall: 22.8,
  },
];

/** The model the platform ships. Same five classes, fine-tuned on the v11 export. */
export const FINE_TUNED = {
  name: "YOLOv8s, fine-tuned",
  mAP50: 62.09,
  mAP5095: 42.01,
  precision: 62.83,
  recall: 59.36,
};

export const WINNER_ID = "yolov8";

/** Per-class mAP@50-95 — the aggregate number hides which classes carry it. */
export const PER_CLASS: {
  cls: string;
  yolov8: number;
  faster: number;
  ssd: number;
  fineTuned: number;
}[] = [
  { cls: "composite_packaging", yolov8: 23.5, faster: 18.4, ssd: 6.2, fineTuned: 60.8 },
  { cls: "glass", yolov8: 28.3, faster: 21.1, ssd: 5.6, fineTuned: 59.0 },
  { cls: "metal", yolov8: 26.5, faster: 26.6, ssd: 27.5, fineTuned: 59.5 },
  { cls: "plastic", yolov8: 24.3, faster: 21.5, ssd: 7.9, fineTuned: 60.6 },
  { cls: "styrofoam", yolov8: 30.1, faster: 31.6, ssd: 17.1, fineTuned: 70.5 },
];

/** F1 from precision and recall — derived, so it can never drift out of sync. */
export const f1Score = (precision: number, recall: number): number =>
  precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

// ─── Development team ────────────────────────────────────────────────────────

export type TeamLinkKey = "github" | "linkedin" | "facebook" | "instagram";

export interface TeamMember {
  name: string;
  role: string;
  /** Imported asset URL (320×320 crop of the supplied portrait). */
  photo: string;
  /**
   * Platform → URL. AN EMPTY STRING IS A PLACEHOLDER: the page renders it as a
   * dashed, non-interactive chip — never as a dead link. Paste a URL here and
   * the chip becomes a real link, no component change needed.
   */
  links: Record<TeamLinkKey, string>;
}

export const TEAM_LINK_ORDER: TeamLinkKey[] = [
  "github",
  "linkedin",
  "facebook",
  "instagram",
];

export const TEAM_LINK_LABELS: Record<TeamLinkKey, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
};

export const TEAM: TeamMember[] = [
  {
    name: "Joebelle Genota",
    role: "Programmer",
    photo: joebellePhoto,
    links: { github: "", linkedin: "", facebook: "", instagram: "" },
  },
  {
    name: "Ciarlien Ruth Eturma",
    role: "Documentarian",
    photo: ciarlienPhoto,
    links: { github: "", linkedin: "", facebook: "", instagram: "" },
  },
  {
    name: "Vince Keth Maarat",
    role: "Project Manager",
    photo: vincePhoto,
    links: { github: "", linkedin: "", facebook: "", instagram: "" },
  },
];
