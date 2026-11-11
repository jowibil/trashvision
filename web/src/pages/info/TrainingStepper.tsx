// "How the detector was trained" — four steps, each carrying the real values
// from the training run (content lives in src/content/explainer.ts).
import { TRAINING_STEPS } from "../../content/explainer";
import { SectionHeading } from "./parts";

export default function TrainingStepper() {
  return (
    <section id="training" aria-labelledby="training-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
      <SectionHeading id="training-heading">How the detector was trained</SectionHeading>
      <p className="mt-3 text-sm text-slate-500 max-w-[68ch] leading-relaxed">
        Four steps, in order. The values are the run that produced the checkpoint
        the backend serves — read from its own training arguments, not estimated.
      </p>

      <ol className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 list-none p-0 text-left">
        {TRAINING_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#005D90] text-xs font-bold text-white"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <p className="mt-3 text-sm font-bold text-slate-900">{step.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{step.body}</p>
            {/* Two columns, not a flex row: a repo path is longer than a card
                at xl:grid-cols-4, and `contents` keeps the dt/dd pairs as grid
                items so the value wraps inside its own column. */}
            <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs">
              {step.facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-all text-right font-semibold text-slate-700 tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-slate-500 leading-relaxed">
        Training arguments and wall-clock time come from the run&apos;s{" "}
        <code className="font-mono">args.yaml</code> and{" "}
        <code className="font-mono">results.csv</code>; the image counts come from
        the export&apos;s own <code className="font-mono">data.yaml</code>.
      </p>
    </section>
  );
}
