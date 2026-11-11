// "One frame, before and after the model" — a draggable reveal over a real
// drone frame, with the boxes produced by the production pipeline.
//
// Data is generated, not hand-written: ml/export_explainer_sample.py runs the
// detector and Stage B over one frame and emits src/content/detectionSample.ts
// plus assets/explainer/detection-sample.jpg. Boxes carry the JPEG's pixel
// space, and are placed here as percentages — so the overlay tracks the image
// at any rendered size with no scaling state.
//
// Why not components/shared/AnnotatedImage: that viewer draws 12-user-unit
// labels in the image's native pixel space (correct for full-size frames) and
// one red palette. Here the frame renders ~3× smaller than native — labels
// would shrink below legibility — and the five classes need distinct colours.
import { useState } from "react";
import { ChevronLeft, ChevronRight, ScanSearch } from "lucide-react";
import { DETECTION_SAMPLE } from "../../content/detectionSample";
import sampleImage from "../../assets/explainer/detection-sample.jpg";
import { SectionHeading } from "./parts";

// Same palette as the review renders in ml/preview_stage_b.py (converted from
// its BGR values), so a box looks the same on this page as in the local
// previews the team reviews.
const CLASS_COLORS: Record<string, string> = {
  composite_packaging: "#56D656",
  glass: "#FFC83C",
  metal: "#C8C8C8",
  plastic: "#2882FF",
  styrofoam: "#FF78B4",
};
const FALLBACK_COLOR = "#E5E7EB";

// Labels only where they can be read: this dataset's litter is 4–8 cm, so most
// boxes are ~2% of frame width and a label would be wider than the object.
const LABEL_MIN_WIDTH_PCT = 6;

export default function ImageCompare() {
  const sample = DETECTION_SAMPLE;
  const { width, height } = sample.image;

  const [reveal, setReveal] = useState(45);
  const [conf, setConf] = useState(sample.inference.conf);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const classes = Array.from(new Set(sample.detections.map((d) => d.label))).map(
    (label) => ({ label, count: sample.detections.filter((d) => d.label === label).length }),
  );

  const visible = sample.detections.filter(
    (d) => d.confidence >= conf && !hidden.has(d.label),
  );

  const toggleClass = (label: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const pctOf = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <section id="sample" aria-labelledby="sample-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
      <SectionHeading id="sample-heading">
        One frame, before and after the model
      </SectionHeading>
      <p className="mt-3 text-sm text-slate-500 leading-relaxed">
        A real survey frame at the operating point the backend uses, with the
        boxes the detector actually returned. Drag the divider to compare, then
        raise the confidence cut-off and watch detections drop out: what survives
        is what reaches the map.
      </p>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Reveal control. The range input sits transparently over the frame so
            mouse, touch and arrow keys all work without custom pointer code. */}
        <div
          className="relative select-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#005D90]"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <img
            src={sampleImage}
            alt={`Drone frame ${sample.frame} of a littered shoreline, no annotations`}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />

          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 0 0 ${reveal}%)` }}
            aria-hidden="true"
          >
            <img
              src={sampleImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            {visible.map((det) => {
              const [x1, y1, x2, y2] = det.box;
              const color = CLASS_COLORS[det.label] ?? FALLBACK_COLOR;
              const wide = ((x2 - x1) / width) * 100 >= LABEL_MIN_WIDTH_PCT;
              return (
                <div
                  key={det.id}
                  title={`${det.label.replace(/_/g, " ")} · ${Math.round(det.confidence * 100)}%${
                    det.merged.length > 0 ? ` · ${det.merged.length + 1} boxes merged` : ""
                  }`}
                  className="absolute border-[1.5px]"
                  style={{
                    left: pctOf(x1, width),
                    top: pctOf(y1, height),
                    width: pctOf(x2 - x1, width),
                    height: pctOf(y2 - y1, height),
                    borderColor: color,
                    backgroundColor: `${color}1F`,
                  }}
                >
                  {wide && (
                    <span
                      className="absolute -top-4 left-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-tight"
                      style={{ color, textShadow: "0 0 3px #000, 0 0 3px #000" }}
                    >
                      {det.label.replace(/_/g, " ")} {Math.round(det.confidence * 100)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Divider + grip */}
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{ left: `${reveal}%` }}
            aria-hidden="true"
          >
            <span className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow">
              <ChevronLeft size={14} aria-hidden="true" />
              <ChevronRight size={14} aria-hidden="true" />
            </span>
          </div>

          <span className="pointer-events-none absolute top-2 left-2 z-10 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Raw frame
          </span>
          <span className="pointer-events-none absolute top-2 right-2 z-10 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Detections
          </span>

          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={reveal}
            onChange={(e) => setReveal(Number(e.target.value))}
            aria-label="Drag to reveal the annotated detection boxes"
            className="absolute inset-0 z-20 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0"
          />
        </div>

        {/* Controls */}
        <div className="border-t border-slate-200 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <ScanSearch size={13} aria-hidden="true" />
              Classes
            </span>
            {classes.map(({ label, count }) => {
              const off = hidden.has(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleClass(label)}
                  aria-pressed={!off}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    off
                      ? "border-slate-200 bg-white text-slate-400 line-through"
                      : "border-slate-300 bg-slate-50 text-slate-700"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: CLASS_COLORS[label] ?? FALLBACK_COLOR }}
                    aria-hidden="true"
                  />
                  {label.replace(/_/g, " ")}
                  <span className="text-slate-400 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="sample-conf"
              className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-slate-600"
            >
              Confidence cut-off
              <span className="tabular-nums text-slate-900">{Math.round(conf * 100)}%</span>
              <span className="font-normal text-slate-500">
                — the pipeline itself runs at {Math.round(sample.inference.conf * 100)}%
              </span>
            </label>
            <input
              id="sample-conf"
              type="range"
              min={sample.inference.conf}
              max={0.95}
              step={0.01}
              value={conf}
              onChange={(e) => setConf(Number(e.target.value))}
              className="w-full accent-[#005D90]"
            />
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            {visible.length === 0 ? (
              <>Nothing survives this threshold or class filter — that is the honest
              answer, not a rendering glitch.</>
            ) : (
              <>
                Showing <strong className="font-bold text-slate-700">{visible.length}</strong> of{" "}
                {sample.counts.detections} stored detections. The frame returned{" "}
                {sample.counts.raw_boxes} raw boxes; Stage B merged{" "}
                {sample.counts.merged} of them away (IoU ≥{" "}
                {sample.stage_b.iou_threshold.toFixed(1)}), which is why the map counts{" "}
                {sample.counts.detections} for this photo — not{" "}
                {sample.counts.raw_boxes}.
              </>
            )}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-500 font-extrabold leading-relaxed">
        Frame <code className="font-mono break-all">{sample.frame}</code>, generated{" "}
        {sample.generated} by running this repository&apos;s detector at{" "}
        {sample.inference.imgsz}&nbsp;px and {Math.round(sample.inference.conf * 100)}%
        confidence. Nothing in this picture is drawn by hand.
      </p>
    </section>
  );
}
