// "Which detector, and how well" — base comparison + the shipped fine-tune +
// per-class breakdown. Values live in src/content/explainer.ts; F1 is derived
// from precision and recall at render time so it can never disagree with them.
import { Award } from "lucide-react";
import {
  BASE_MODELS,
  FINE_TUNED,
  PER_CLASS,
  WINNER_ID,
  f1Score,
  type MetricKey,
} from "../../content/explainer";
import { SectionHeading } from "./parts";

const COLUMNS: { key: MetricKey | "f1"; label: string }[] = [
  { key: "mAP50", label: "mAP@50" },
  { key: "mAP5095", label: "mAP@50-95" },
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1", label: "F1" },
];

const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

export default function ModelCompare() {
  const rows = BASE_MODELS.map((model) => ({
    ...model,
    f1: f1Score(model.precision, model.recall),
  }));
  // Best value per column across the three base detectors (all are "higher is
  // better" except none of them here). Computed, never hand-marked.
  const best = {
    mAP50: Math.max(...rows.map((r) => r.mAP50)),
    mAP5095: Math.max(...rows.map((r) => r.mAP5095)),
    precision: Math.max(...rows.map((r) => r.precision)),
    recall: Math.max(...rows.map((r) => r.recall)),
    f1: Math.max(...rows.map((r) => r.f1)),
  };
  const fineTunedF1 = f1Score(FINE_TUNED.precision, FINE_TUNED.recall);

  return (
    <section id="compare" aria-labelledby="compare-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
      <SectionHeading id="compare-heading">Which detector, and how well it scores</SectionHeading>
      <p className="mt-3 text-sm text-slate-500 leading-relaxed">
        Three detectors were trained and scored on the same five classes. YOLOv8
        led on every aggregate metric, so that is the family we kept — and then
        fine-tuned. Bold figures mark the best value in each column.
      </p>

      {/* Base comparison */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 overflow-x-auto">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Base training
        </p>
        <table className="mt-3 w-full min-w-[36rem] text-left text-xs sm:text-sm">
          <thead>
            <tr className="text-slate-500">
              <th scope="col" className="py-2 pr-4 font-semibold">Model</th>
              {COLUMNS.map((col) => (
                <th key={col.key} scope="col" className="py-2 pr-4 font-semibold tabular-nums">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className={row.id === WINNER_ID ? "bg-[#005D90]/5" : undefined}>
                <th scope="row" className="py-2 pr-4 font-medium text-slate-700">
                  <span className="flex items-center gap-1.5">
                    {row.id === WINNER_ID && (
                      <Award size={14} className="text-[#005D90] shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {row.name}
                      <span className="block text-[11px] font-normal text-slate-500">
                        {row.family}
                      </span>
                    </span>
                  </span>
                </th>
                {COLUMNS.map((col) => {
                  const value = row[col.key];
                  const isBest = value === best[col.key];
                  return (
                    <td
                      key={col.key}
                      className={`py-2 pr-4 tabular-nums ${
                        isBest ? "font-bold text-slate-900" : "text-slate-600"
                      }`}
                    >
                      {pct(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          F1 is derived here as 2PR/(P+R), so it always matches the precision and
          recall beside it.
        </p>
      </div>

      {/* The shipped checkpoint */}
      <div className="mt-5 rounded-2xl border border-[#005D90]/20 bg-white shadow-sm p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Award size={16} className="text-[#005D90]" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-900">{FINE_TUNED.name}</p>
          <span className="rounded-full bg-[#005D90] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
            Deployed
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          The checkpoint the backend loads, scored on the validation split of the
          v11 export at the 1280 px training size. One 22.6 MB file detects all
          five classes — no separate model per class.
        </p>
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            ["mAP@50", pct(FINE_TUNED.mAP50, 2)],
            ["mAP@50-95", pct(FINE_TUNED.mAP5095, 2)],
            ["Precision", pct(FINE_TUNED.precision, 2)],
            ["Recall", pct(FINE_TUNED.recall, 2)],
            ["F1", pct(fineTunedF1, 2)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-lg font-black text-slate-900 tabular-nums leading-none">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Per class */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 overflow-x-auto">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Per-class mAP@50-95
        </p>
        <table className="mt-3 w-full min-w-[32rem] text-left text-xs sm:text-sm">
          <thead>
            <tr className="text-slate-500">
              <th scope="col" className="py-2 pr-4 font-semibold">Class</th>
              <th scope="col" className="py-2 pr-4 font-semibold tabular-nums">YOLOv8</th>
              <th scope="col" className="py-2 pr-4 font-semibold tabular-nums">Faster R-CNN</th>
              <th scope="col" className="py-2 pr-4 font-semibold tabular-nums">SSD</th>
              <th scope="col" className="py-2 font-semibold tabular-nums">YOLOv8 fine-tuned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PER_CLASS.map((row) => {
              const baseBest = Math.max(row.yolov8, row.faster, row.ssd);
              const cell = (v: number) =>
                `py-2 pr-4 tabular-nums ${
                  v === baseBest ? "font-bold text-slate-900" : "text-slate-600"
                }`;
              return (
                <tr key={row.cls}>
                  <th scope="row" className="py-2 pr-4 font-medium text-slate-700">
                    {row.cls.replace(/_/g, " ")}
                  </th>
                  <td className={cell(row.yolov8)}>{pct(row.yolov8)}</td>
                  <td className={cell(row.faster)}>{pct(row.faster)}</td>
                  <td className={cell(row.ssd)}>{pct(row.ssd)}</td>
                  <td className="py-2 bg-[#005D90]/5 font-semibold text-slate-900 tabular-nums text-center">
                    {pct(row.fineTuned)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          The aggregate win is not a clean sweep: on base training SSD edges the
          others on metal and Faster R-CNN leads on styrofoam. The fine-tuned
          column is the point — every class finishes at 59% or better, where the
          base detectors sat between 5.6% and 31.6%.
        </p>
      </div>
    </section>
  );
}
