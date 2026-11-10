import 'package:flutter/material.dart';

/// Content layer for the Info screen's training / comparison / sample / team
/// sections — the mobile twin of `web/src/content/explainer.ts`. Screens and
/// widgets import from here; they never hardcode a number.
///
/// Provenance of every figure (identical to the web file, so both surfaces can
/// be checked against each other):
///   • training steps  — the run's own args.yaml + results.csv (stage1_v11_1280_fix)
///   • dataset counts  — the v11 export's data.yaml (ml/dataset_manifest.json)
///   • base metrics    — the training notebook outputs (YOLOv8 / Faster R-CNN / SSD)
///   • fine-tuned row  — the same notebook, scoring the checkpoint we deploy
///
/// Thresholds the platform COMPUTES with are deliberately absent: severity
/// bands, dedup parameters and hex sizing arrive from GET /info, and the CCI
/// bands come from theme.dart. Keep it that way.

class TrainingStep {
  final String title;
  final String body;

  /// `[label, value]` pairs shown under the step.
  final List<(String, String)> facts;

  const TrainingStep(this.title, this.body, this.facts);
}

const List<TrainingStep> trainingSteps = [
  TrainingStep(
    'Annotate',
    'Every piece of shoreline waste in a frame is boxed and labelled in '
        'Roboflow with one of the five classes.',
    [
      ('Tool', 'Roboflow'),
      ('Classes', '5'),
      ('License', 'CC BY 4.0'),
    ],
  ),
  TrainingStep(
    'Export & split',
    'Roboflow exports the set in YOLOv8 format with a fixed '
        'train/validation/test split — the same export the training run '
        'consumed and the model card above reports.',
    [
      ('Export', 'v11'),
      ('Split', '1,635 / 350 / 351'),
      ('Images', '2,336'),
    ],
  ),
  TrainingStep(
    'Train',
    'YOLOv8s starts from COCO-pretrained weights and trains in a Colab '
        'session with bounded augmentation, at the resolution the detector is '
        'meant to run at.',
    [
      ('Base weights', 'yolov8s.pt'),
      ('Epochs', '80'),
      ('Batch', '12'),
      ('Image size', '1280 px'),
      ('Optimizer', 'AdamW, lr 1e-3 with cosine decay'),
      ('Augmentation', 'mosaic 0.2 · mixup 0.1 · ±10° · scale 0.2 · flip 0.5'),
      ('Wall clock', '≈ 1 h 55 m'),
    ],
  ),
  TrainingStep(
    'Evaluate & deploy',
    'The checkpoint with the best validation score on the validation split '
        'is what the backend loads — the fine-tuned row below is that '
        'checkpoint, measured at the training image size.',
    [
      ('Checkpoint', 'best.pt'),
      ('Evaluated at', '1280 px'),
      ('Deployed as', 'ml/weights/trashvision/weights/best.pt'),
    ],
  ),
];

class ModelScore {
  final String id;
  final String name;
  final String family;
  final double map50;
  final double map5095;
  final double precision;
  final double recall;

  const ModelScore(
    this.id,
    this.name,
    this.family,
    this.map50,
    this.map5095,
    this.precision,
    this.recall,
  );
}

/// Base-trained comparison: three detectors, one dataset, one protocol.
const List<ModelScore> baseModels = [
  ModelScore('yolov8', 'YOLOv8', 'single-stage · yolov8s', 46.5, 26.5, 62.7, 44.3),
  ModelScore('faster-rcnn', 'Faster R-CNN', 'two-stage', 39.9, 23.8, 39.9, 39.0),
  ModelScore('ssd', 'SSD', 'single-stage', 24.5, 12.9, 24.5, 22.8),
];

/// The model the platform ships. Same five classes, fine-tuned on v11.
const ModelScore fineTuned = ModelScore(
  'fine-tuned',
  'YOLOv8s, fine-tuned',
  'deployed checkpoint',
  62.09,
  42.01,
  62.83,
  59.36,
);

const String winnerId = 'yolov8';

class PerClassScore {
  final String cls;
  final double yolov8;
  final double faster;
  final double ssd;
  final double fineTuned;

  const PerClassScore(
    this.cls,
    this.yolov8,
    this.faster,
    this.ssd,
    this.fineTuned,
  );

  /// Strongest base detector for this class — derived, never hand-marked.
  double get bestBase => [yolov8, faster, ssd].reduce((a, b) => a > b ? a : b);

  /// Which base detector that figure belongs to.
  String get bestBaseModel {
    if (bestBase == yolov8) return 'YOLOv8';
    if (bestBase == faster) return 'Faster R-CNN';
    return 'SSD';
  }
}

/// Per-class mAP@50-95 — the aggregate number hides which classes carry it.
const List<PerClassScore> perClassScores = [
  PerClassScore('composite_packaging', 23.5, 18.4, 6.2, 60.8),
  PerClassScore('glass', 28.3, 21.1, 5.6, 59.0),
  PerClassScore('metal', 26.5, 26.6, 27.5, 59.5),
  PerClassScore('plastic', 24.3, 21.5, 7.9, 60.6),
  PerClassScore('styrofoam', 30.1, 31.6, 17.1, 70.5),
];

/// F1 from precision and recall — derived, so it can never drift out of sync.
double f1Score(double precision, double recall) => precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

// ─── Development team ───────────────────────────────────────────────────────

enum TeamLink { github, linkedin, facebook, instagram }

const Map<TeamLink, String> teamLinkLabels = {
  TeamLink.github: 'GitHub',
  TeamLink.linkedin: 'LinkedIn',
  TeamLink.facebook: 'Facebook',
  TeamLink.instagram: 'Instagram',
};

const List<TeamLink> teamLinkOrder = [
  TeamLink.github,
  TeamLink.linkedin,
  TeamLink.facebook,
  TeamLink.instagram,
];

/// Role → glyph. Presentation only, so it stays here rather than in the data;
/// an unrecognised role still gets a neutral person icon.
IconData teamRoleIcon(String role) {
  switch (role) {
    case 'Programmer':
      return Icons.code;
    case 'Documentarian':
      return Icons.menu_book_outlined;
    case 'Project Manager':
      return Icons.checklist_rtl_outlined;
    default:
      return Icons.person_outline;
  }
}

class TeamMember {
  final String name;
  final String role;

  /// Asset path of the supplied portrait.
  final String photo;

  /// Platform → URL. AN EMPTY STRING IS A PLACEHOLDER: rendered as a dashed,
  /// non-interactive icon button — never as a dead link. Paste a URL here and
  /// the button becomes a real link, no widget change needed.
  final Map<TeamLink, String> links;

  const TeamMember(this.name, this.role, this.photo, this.links);

  int get placeholderCount =>
      teamLinkOrder.where((key) => (links[key] ?? '').isEmpty).length;
}

const List<TeamMember> team = [
  TeamMember(
    'Joebelle Genota',
    'Programmer',
    'assets/explainer/joebelle-genota.jpg',
    {
      TeamLink.github: '',
      TeamLink.linkedin: '',
      TeamLink.facebook: '',
      TeamLink.instagram: '',
    },
  ),
  TeamMember(
    'Ciarlien Ruth Eturma',
    'Documentarian',
    'assets/explainer/ciarlien-ruth-eturma.jpg',
    {
      TeamLink.github: '',
      TeamLink.linkedin: '',
      TeamLink.facebook: '',
      TeamLink.instagram: '',
    },
  ),
  TeamMember(
    'Vince Keth Maarat',
    'Project Manager',
    'assets/explainer/vince-keth-maarat.jpg',
    {
      TeamLink.github: '',
      TeamLink.linkedin: '',
      TeamLink.facebook: '',
      TeamLink.instagram: '',
    },
  ),
];
