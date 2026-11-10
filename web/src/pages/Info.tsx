// Portal Info page: honest ML documentation (dataset counts + algorithm
// notes + the one CCI ruler at two zoom levels). Operate-mode product UI — restraint
// per .agents/design-skills-routing.md (no decorative motion, Tailwind
// utilities only, inline styles solely for data-driven colors).
//
// Honesty contract: every threshold on this page is either (a) served by
// GET /info from the same backend constant that computes with it (severity
// bands, DBSCAN stage params, hex sizing), or (b) imported directly from
// the web implementation (CCI bands, colors, K factor —
// services/hooks/useHexbins.ts, shared with MapView; the phone app runs the
// same CCI in mobile theme.dart). No threshold is re-typed. UI label
// wording quoted from the apps is copy, not thresholds.
import { AlertTriangle, Image as ImageIcon, Map as MapIcon } from "lucide-react";
import {
  CCI_LEGEND_ITEMS,
  DRONE_K_FACTOR,
  getCciColor,
} from "../services/hooks/useHexbins";
import { useMlInfoState } from "../services/mlInfo";
import DedupDemos from "./info/DedupDemos";
import HexDemo from "./info/HexDemo";
import ImageCompare from "./info/ImageCompare";
import ModelCompare from "./info/ModelCompare";
import SectionNav from "./info/SectionNav";
import TeamSection from "./info/TeamSection";
import TrainingStepper from "./info/TrainingStepper";
import { SectionHeading } from "./info/parts";

// ─── Small shared pieces ─────────────────────────────────────────────────────

// One locale everywhere (brief D): all figures on the page go through this.
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));

// Area of a full (unclipped) regular hexagon with an edge of `edgeM` meters.
const hexAreaM2 = (edgeM: number) => (3 * Math.sqrt(3) / 2) * edgeM * edgeM;

/** Skeleton line for the loading state — static, no pulse (operate-mode). */
function Placeholder({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block h-5 rounded bg-slate-100 ${className}`} />;
}

// Presentation tint for the severity names served by the API (thresholds
// always come from the response; this is styling only).
const SEVERITY_CHIP: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-green-100 text-green-700",
};

// Section ids and chip labels for the pinned nav, in page order.
const SECTIONS: [string, string][] = [
  ["#overview", "Overview"],
  ["#model", "Model"],
  ["#training", "Training"],
  ["#compare", "Comparison"],
  ["#sample", "Sample"],
  ["#dedup", "De-duplication"],
  ["#cci", "Clean Coast Index"],
  ["#rulers", "Alert vs map"],
  ["#sources", "Sources"],
  ["#limits", "Limits"],
  ["#team", "Team"],
];

interface InfoProps {
  /** CSS top offset for the pinned section nav — the height of whatever sticky
   *  chrome the shell puts above the content. 0 inside the portal (its scroll
   *  container already starts below the chrome), 4rem under DocShell's h-16
   *  header. */
  stickyTop?: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Info({ stickyTop = "0px" }: InfoProps) {
  const { status, info, retry } = useMlInfoState();
  const dataset = info?.dataset ?? null;

  // Derived (never re-typed) figures for the CCI section: the smallest FULL
  // cell's area and the count its Moderate band would need.
  const minEdge = info?.hex_grid?.edge_min_m;
  const minEdgeDefault = minEdge ?? 25;
  const fullCellArea = Math.round(hexAreaM2(minEdgeDefault));
  // CCI > 5 needs count > 5 × area / K.
  const moderateNeeds = Math.ceil((5 * fullCellArea) / DRONE_K_FACTOR);

  // Alert band display ranges, derived from the served thresholds — the map's
  // CCI edges: Critical "> 20", High "11 – 20", Medium "6 – 10", Low "≤ 5"
  // (the ladder collapses the two clean bands into Low, hence "≤ 5").
  const bands = info?.severity_bands ?? [];
  const bandRange = (i: number): string => {
    const band = bands[i];
    if (!band) return "—";
    if (i === 0) return `> ${band.above}`;
    if (band.above < 0) return `≤ ${bands[i - 1].above}`;
    return `${band.above + 1} – ${bands[i - 1].above}`;
  };

  const stageA = info?.dedup?.stage_a;
  const stageB = info?.dedup?.stage_b;
  // Retired Stage B rule (gsd_factor × gsd_meters). Served as legacy history so
  // the page can document what changed — never used as a live threshold.
  const legacyStageBRadiusM =
    stageB?.gsd_factor != null && stageB.gsd_meters != null
      ? stageB.gsd_factor * stageB.gsd_meters
      : null;

  // `relative` on the root is load-bearing, not decorative: it makes this page
  // the containing block for absolutely positioned descendants (e.g. the
  // visually-hidden labels Tailwind's `sr-only` renders at their static
  // position). Without it they resolve against <body>, and the portal's clipped
  // <main> cannot hide them — the labels near the bottom of the page stretched
  // the DOCUMENT to their own y-offset, which let the window scroll past the app
  // chrome into an empty white band.
  return (
    <div
      id="top"
      className="relative p-4 md:p-8 space-y-14 max-w-5xl mx-auto text-left text-slate-800"
    >
      {/* No border-b: the pinned nav below draws the divider, and a line plus a
          gap plus the bar reads as two separators. */}
      <header className="max-w-[64ch] pb-2">
        <p className="text-xs font-bold uppercase tracking-widest text-[#005D90]">Documentation</p>
        <h4 className="mt-2 text-3xl md:text-4xl font-black text-slate-900 tracking-tight opacity-100! animate-none!">
          Info
        </h4>
        <p className="text-sm md:text-base text-slate-600 mt-3 leading-relaxed">
          How TrashVision detects, de-duplicates and maps coastal waste — and which
          numbers decide an alert. Every threshold below is served by the API
          from the same constant the code computes with, or imported straight
          from the implementation; the phone app runs the same CCI ruler as the
          web map. Only display wording (chip tints, label names) is
          presentation.
        </p>
      </header>

      {/* Pinned section nav — highlights the section you are reading and keeps
          its chip centred. stickyTop comes from the shell (4rem under
          DocShell's header, 0 in the portal's scroll container). */}
      <SectionNav sections={SECTIONS} stickyTop={stickyTop} />

      {/* ── Overview: from photo to alert, in four steps ─────────────────── */}
      <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
        <SectionHeading id="overview-heading">From photo to alert, in four steps</SectionHeading>
        <ol className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 list-none p-0 text-left">
          {[
            {
              title: "Survey",
              body: "A drone flight captures geotagged photos of a drawn area.",
              href: "#dedup",
            },
            {
              title: "De-duplicate",
              body: "Stage A skips repeat frames before inference. Stage B merges repeat boxes inside a frame.",
              href: "#dedup",
            },
            {
              title: "Count",
              body: "Surviving detections are counted per drawn area and per hex cell.",
              href: "#cci",
            },
            {
              title: "Report",
              body: "The area's density drives alerts, badges and the assistant; per-cell density drives the map colors.",
              href: "#rulers",
            },
          ].map((step, i) => (
            <li key={step.title}>
              <a
                href={step.href}
                className="block h-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-[#005D90]/40 hover:shadow-sm transition"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#005D90] text-xs font-bold text-white"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <p className="mt-3 text-sm font-bold text-slate-900 text-left">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 text-left">{step.body}</p>
              </a>
            </li>
          ))}
        </ol>
      </section>

      {/* ── The model, and what it did NOT learn from ────────────────────── */}
      <section
        id="model"
        aria-labelledby="model-heading"
        className="scroll-mt-[var(--info-anchor,7rem)]"
        aria-busy={status === "loading"}
      >
        <SectionHeading id="model-heading">
          The model, and what it did <em>not</em> learn from
        </SectionHeading>

        <div className="mt-5 rounded-2xl border border-zinc-900/10 bg-white shadow-sm text-left">
          <div className="grid md:grid-cols-[1fr_auto] divide-y md:divide-y-0 md:divide-x divide-slate-200">
            <div className="p-6 md:p-8 flex flex-col items-start">
              <div className="flex items-center gap-2.5">
                <ImageIcon size={18} className="text-[#005D90]" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-700">
                  Images the model was trained on
                </p>
              </div>
              {status === "loading" ? (
                <div className="mt-3 space-y-2">
                  <Placeholder className="w-40 h-10" />
                  <Placeholder className="w-full max-w-[40ch] h-4" />
                </div>
              ) : (
                <>
                  <p className="mt-4 text-6xl font-black text-[#005D90] tabular-nums leading-none tracking-tight">
                    {fmt(dataset?.total_images)}
                  </p>
                  <p className="mt-4 text-xs text-slate-500 leading-relaxed max-w-[46ch]">
                    {info
                      ? dataset
                        ? `Roboflow export v${dataset.version}, YOLOv8 format. ${fmt(dataset.splits.train)} train · ${fmt(dataset.splits.valid)} validation · ${fmt(dataset.splits.test)} test — fixed at training time; it does not grow as the platform collects more data.`
                        : "Dataset details unavailable."
                      : "Counts temporarily unavailable."}
                  </p>
                  {dataset?.classes && (
                    <div className="mt-4">
                      <p className="text-xs font-bold text-slate-500">
                        The five classes it recognizes
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2 list-none">
                        {dataset.classes.map((cls) => (
                          <li
                            key={cls}
                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                          >
                            {cls.replace(/_/g, " ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-6 md:p-8 md:w-72 bg-slate-50/60 md:rounded-r-2xl flex flex-col items-start">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Not in training
              </p>
              {status === "loading" ? (
                <Placeholder className="mt-3 w-16 h-8" />
              ) : (
                <p className="mt-3 text-4xl font-black text-slate-700 tabular-nums leading-none">
                  {info ? fmt(info.verified_reports_contributed) : "—"}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                Verified community reports counted from the database. The model has
                not learned from them — no retraining pipeline exists, by design.
              </p>
            </div>
          </div>
        </div>

        {status === "error" && (
          <p className="mt-3 text-xs text-red-700 flex flex-wrap items-center gap-2">
            Couldn&apos;t load model details.
            <button
              type="button"
              onClick={retry}
              className="rounded-md border border-red-200 px-2 py-0.5 font-semibold hover:bg-red-50 transition-colors"
            >
              Retry
            </button>
          </p>
        )}

        {/* Which data feeds which number (from the code: reports are stored
            and counted here only — the map, alerts and assistant all read
            from the detections pipeline). */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 text-left">
          <p className="text-sm font-bold text-slate-900">Which data feeds which number</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th scope="col" className="py-2 pr-4 font-semibold">Source</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Map &amp; CCI</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Alerts &amp; assistant</th>
                  <th scope="col" className="py-2 font-semibold">Used for training</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <th scope="row" className="py-2 pr-4 font-medium text-slate-700">
                    Drone survey detections (de-duplicated)
                  </th>
                  <td className="py-2 pr-4 text-slate-600">Yes</td>
                  <td className="py-2 pr-4 text-slate-600">Yes</td>
                  <td className="py-2 text-slate-600">No (fixed training set)</td>
                </tr>
                <tr>
                  <th scope="row" className="py-2 pr-4 font-medium text-slate-700">
                    Verified community reports
                  </th>
                  <td className="py-2 pr-4 text-slate-600">No — the CCI reads detections only</td>
                  <td className="py-2 pr-4 text-slate-600">No — stored and counted on this page only</td>
                  <td className="py-2 text-slate-600">No</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Training pipeline + model comparison ─────────────────────────── */}
      <TrainingStepper />
      <ModelCompare />
      <ImageCompare />

      {/* ── The two de-duplication stages ────────────────────────────────── */}
      <section id="dedup" aria-labelledby="dedup-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
        <SectionHeading id="dedup-heading">
          Before anything is counted: the two de-duplication stages
        </SectionHeading>
        <p className="mt-3 text-sm text-slate-500 max-w-[68ch] leading-relaxed">
          A hovering drone photographs the same piece of trash many times, and one
          photo can contain the same object twice. Both stages run <em>before</em>{" "}
          counting, so every number downstream — map, alerts, chatbot — is
          de-duplicated.
        </p>
        <div className="mt-6 text-left">
          <div className="grid grid-cols-[auto_1fr] gap-x-5">
            <div className="flex flex-col items-center">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white bg-[#005D90]"
                aria-hidden="true"
              >
                1
              </span>
              <span
                className="w-px flex-1 my-1 bg-[#005D90]/25"
                aria-hidden="true"
              />
            </div>
          <div className="pb-8">
            <p className="text-sm font-bold text-slate-800 pt-1">Stage A — between frames</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 max-w-[66ch]">
              Frames are clustered by their camera GPS positions (haversine
              distance). Only the first frame of each cluster (upload order) runs
              inference — its centroid coordinates travel with it; the rest are
              marked duplicates and skipped. Frames without GPS can&apos;t be placed
              spatially, so they&apos;re always kept.
            </p>
            <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs max-w-[66ch]">
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">Neighborhood radius</dt>
                <dd className="mt-1 font-bold text-slate-700 tabular-nums">
                  {stageA ? `${fmt(stageA.eps_meters)} m` : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">min_samples</dt>
                <dd className="mt-1 font-bold text-slate-700 tabular-nums">
                  {stageA ? stageA.min_samples : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">Keeps</dt>
                <dd className="mt-1 font-bold text-slate-700">one representative frame</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">Exception</dt>
                <dd className="mt-1 font-bold text-slate-700">no-GPS frames always kept</dd>
              </div>
            </dl>
          </div>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-5">
            <div className="flex flex-col items-center">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white bg-[#005D90]"
                aria-hidden="true"
              >
                2
              </span>
            </div>
          <div className="pb-8">
            <p className="text-sm font-bold text-slate-800 pt-1">Stage B — within a frame</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 max-w-[66ch]">
              Every raw box in one frame is stamped with that frame&apos;s single GPS
              fix, so a distance test can&apos;t tell &ldquo;two boxes on one
              bottle&rdquo; from &ldquo;two bottles a frame apart&rdquo;. Overlap can:
              boxes whose intersection-over-union (IoU) reaches the threshold are
              one object. The match is class-agnostic on purpose — two boxes on the
              same cup routinely disagree (&ldquo;styrofoam&rdquo; vs
              &ldquo;plastic&rdquo;), and keeping one per label is exactly the double
              count this stage exists to remove. The highest-confidence box survives
              and donates its own label; a box that overlaps nothing stays a
              singleton, so clustering never discards a detection.
            </p>
            <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs max-w-[66ch]">
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">Overlap threshold</dt>
                <dd className="mt-1 font-bold text-slate-700 tabular-nums">
                  {stageB ? `IoU ≥ ${fmt(stageB.iou_threshold)}` : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">min_samples</dt>
                <dd className="mt-1 font-bold text-slate-700 tabular-nums">
                  {stageB ? stageB.min_samples : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">Keeps</dt>
                <dd className="mt-1 font-bold text-slate-700">highest-confidence box</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <dt className="text-slate-500">Labels</dt>
                <dd className="mt-1 font-bold text-slate-700">merged across classes</dd>
              </div>
            </dl>
            {legacyStageBRadiusM != null && (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500 max-w-[66ch]">
                <strong className="text-slate-700">What changed (2026-11-11).</strong>{" "}
                This stage used to merge boxes nearer than {fmt(stageB?.gsd_factor)} ×
                a fixed GSD of {fmt(stageB?.gsd_meters)} m — {fmt(legacyStageBRadiusM)} m.
                Since every box carries the frame&apos;s one GPS fix, that radius could
                not separate two objects in the same photo: it collapsed each frame
                into a single detection. The API still serves both numbers, flagged{" "}
                <code className="font-mono">legacy</code>, as the history this page
                records.
              </p>
            )}
          </div>
          </div>
        </div>
        <DedupDemos
          epsMeters={stageA?.eps_meters}
          iouThreshold={stageB?.iou_threshold}
        />
      </section>

      {/* ── CCI ──────────────────────────────────────────────────────────── */}
      <section id="cci" aria-labelledby="cci-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
        <SectionHeading id="cci-heading">
          What the map colors mean: the Clean Coast Index
        </SectionHeading>
        <div className="mt-5 rounded-2xl border border-zinc-900/10 bg-white shadow-sm p-6 md:p-8 text-left">
          <div className="space-y-3 text-sm leading-relaxed text-slate-600 max-w-[68ch]">
            <p>
              Each surveyed area is covered by an adaptive hex grid — cell size
              derived from the drawn boundary
              {info?.hex_grid
                ? ` (edges clamped between ${fmt(info.hex_grid.edge_min_m)} m and ${fmt(info.hex_grid.edge_max_m)} m; ${fmt(info.hex_grid.default_edge_m)} m where no boundary is drawn)`
                : ""}
              , cells clipped to the boundary. For every cell:
            </p>
            <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 font-mono text-sm font-semibold text-slate-900">
              CCI = {DRONE_K_FACTOR} × detections ÷ cell area
            </p>
            <p>
              Dividing by the cell&apos;s real geodesic area makes the color
              size-invariant: a big sparse hex and a small packed hex with the
              same litter density get the same color, so adaptive cell sizes
              can&apos;t skew what the map says.
            </p>
            <p>
              Worked example with the real minimum: a full cell at the{" "}
              {minEdge ?? 25}&nbsp;m minimum edge covers about{" "}
              {fmt(fullCellArea)}&nbsp;m² (a regular hexagon is 3√3⁄2·a²), so 2
              detections in it score CCI ≈{" "}
              {fmt(Math.round((2 * DRONE_K_FACTOR * 100) / fullCellArea) / 100)} —
              &ldquo;Very low&rdquo;. The Moderate band (&gt;5) would need more
              than {fmt(moderateNeeds)} detections inside that one cell. Only
              cells clipped down at the boundary edge can be far smaller — a
              ~30&nbsp;m² sliver reaches &ldquo;Very low&rdquo;&apos;s ceiling with
              just 3 detections.
            </p>
            <p>
              Said plainly: at drone-survey cell sizes the CCI scale is almost
              never reached above &ldquo;Very low&rdquo;. That&apos;s              the size-invariance trade-off working as designed (K stays {DRONE_K_FACTOR});
              the raw count still matters for cleanup planning and is always shown
              beside the density.
            </p>
          </div>
          {/* The one labeled CCI legend on the page: same table the web map's
              footer legend renders from, colored by the same function the map
              paints hexes with. */}
          <ul className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-2 list-none">
            {CCI_LEGEND_ITEMS.map((band, i) => (
              <li
                key={band.label}
                className={`rounded-xl border border-slate-200 bg-white p-3 ${i === CCI_LEGEND_ITEMS.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}
              >
                <span
                  className="block h-2 w-10 rounded-full"
                  style={{ backgroundColor: getCciColor(band.category) }}
                  aria-hidden="true"
                />
                <p className="mt-2 text-xs font-bold text-slate-700">{band.label}</p>
                <p className="text-xs text-slate-500 tabular-nums">{band.desc}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Key remounts once /info arrives, so the sliders open at the served
            clamps instead of the offline fallbacks. */}
        <HexDemo
          key={`hex-${info?.hex_grid?.edge_min_m ?? "fallback"}`}
          edgeMinM={info?.hex_grid?.edge_min_m}
          edgeMaxM={info?.hex_grid?.edge_max_m}
          defaultEdgeM={info?.hex_grid?.default_edge_m}
        />
      </section>

      {/* ── One ruler, two zoom levels ───────────────────────────────────── */}
      <section id="rulers" aria-labelledby="rulers-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
        <SectionHeading id="rulers-heading">
          One ruler, two zoom levels: the whole area vs one hex cell
        </SectionHeading>
        <p className="mt-3 text-sm text-slate-500 max-w-[68ch] leading-relaxed">
          Alerts, badges and the assistant rate the <em>whole drawn area</em>; the
          map colors rate <em>one cell at a time</em>. Both use the same Clean
          Coast Index — same K, same band edges — so they cannot tell
          contradictory stories about the same place.
        </p>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="text-slate-500">
                <th scope="col" className="py-2 pr-4 font-semibold">Where</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Measures</th>
                <th scope="col" className="py-2 font-semibold">Bands</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <th scope="row" className="py-2 pr-4 font-medium text-slate-700">
                  Alert banner, Dashboard badges, chatbot
                </th>
                <td className="py-2 pr-4 text-slate-600">
                  Density of the whole drawn area: all-time de-duplicated
                  detections ÷ the area&apos;s geodesic area, × {DRONE_K_FACTOR}
                </td>
                <td className="py-2 text-slate-600">
                  Critical / High / Medium / Low — the five CCI bands collapsed,
                  with the two clean bands both reading Low
                </td>
              </tr>
              <tr>
                <th scope="row" className="py-2 pr-4 font-medium text-slate-700">
                  Web map hexagons and phone map cells
                </th>
                <td className="py-2 pr-4 text-slate-600">
                  Litter density per cell (CCI — size-invariant; one scale on both platforms)
                </td>
                <td className="py-2 text-slate-600">Very low → Very high</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Ruler 1: alerts (thresholds served by the API) */}
          <div className="rounded-2xl border border-zinc-900/10 bg-white shadow-sm">
            <header className="flex items-center gap-2.5 px-5 pt-5 pb-3">
              <AlertTriangle size={16} className="text-[#005D90]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-800">Alerts, badges, chatbot</h3>
            </header>
            <div className="px-5 pb-5">
              <p className="text-xs leading-relaxed text-slate-500">
                Based on the <strong className="text-slate-700">Clean Coast Index of the whole drawn area</strong>{" "}
                — all-time de-duplicated detections ÷ its geodesic area, ×{" "}
                {DRONE_K_FACTOR}. Same edges as the map&apos;s cells, with the two
                clean bands collapsed into Low:
              </p>
              {status === "loading" ? (
                <div className="mt-3 space-y-2" aria-hidden="true">
                  <Placeholder className="w-full h-8" />
                  <Placeholder className="w-full h-8" />
                </div>
              ) : bands.length > 0 ? (
                <ul className="mt-3 space-y-2 list-none" role="list">
                  {bands.map((band, i) => (
                    <li
                      key={band.name}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <span
                        className={`inline-flex min-w-16 justify-center text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${SEVERITY_CHIP[band.name] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {band.name}
                      </span>
                      <span className="text-xs text-slate-600 tabular-nums ml-auto font-semibold">
                        {bandRange(i)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                // Ready (or fetched and failed) but the response carries no
                // severity_bands — an old backend build. Say so instead of
                // rendering unexplained skeleton bars.
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
                  Threshold values unavailable — the deployed backend is an older
                  build that doesn&apos;t serve them yet (needs a restart with the
                  current code).{" "}
                  {status === "error" ? "The API also didn&apos;t respond." : null}
                </p>
              )}
              <p className="text-xs leading-relaxed text-slate-500 pt-2">
                One shared function rates the alert banner, the Trash Logs hotspot
                badges and the assistant, so those can never disagree with each
                other. An area with no drawn boundary has no denominator — no
                density — so it can never rate above Low.
              </p>
            </div>
          </div>

          {/* Ruler 2: the maps — both platforms run the same CCI ruler
              (web: useHexbins classifyCci/getCciColor; phone: theme.dart
              getCciColor/getCciLabel — same thresholds, same colors). */}
          <div className="rounded-2xl border border-zinc-900/10 bg-white shadow-sm">
            <header className="flex items-center gap-2.5 px-5 pt-5 pb-3">
              <MapIcon size={16} className="text-[#005D90]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-800">Web &amp; phone map hexagons</h3>
            </header>
            <div className="px-5 pb-5">
              <p className="text-xs leading-relaxed text-slate-500">
                Based on <strong className="text-slate-700">litter density per hex cell</strong> —
                detections divided by the cell&apos;s real geodesic area, times{" "}
                {DRONE_K_FACTOR}. Both platforms classify cells on the same
                bands: the web map via <strong className="text-slate-900">classifyCci</strong>,
                the phone app via <strong className="text-slate-900">theme.dart getCciColor</strong>
                — same thresholds, same colors, different label wording:
              </p>
              <ul className="mt-3 space-y-2 list-none" role="list">
                {CCI_LEGEND_ITEMS.map((band) => (
                  <li
                    key={band.label}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2"
                    style={{ backgroundColor: `${getCciColor(band.category)}14` }}
                  >
                    <span
                      className="block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getCciColor(band.category) }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-bold text-slate-700">{band.label}</span>
                    <span className="text-xs text-slate-500 ml-auto tabular-nums">
                      CCI {band.desc}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-slate-500 pt-2">
                The phone app shows the same bands under its own names — VERY
                CLEAN, CLEAN, MODERATE, DIRTY, EXTREMELY DIRTY — with the raw
                count beside them in the sector panel. Density, not the total:
                at typical cell sizes the map almost always reads &ldquo;Very low&rdquo; —
                see the worked example above.
              </p>
            </div>
          </div>
        </div>

        {/* Same ruler at two zoom levels — every figure here is runnable
            arithmetic on the served K and band edges. */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
          <h3 className="text-sm font-bold text-slate-800">
            Why the alert and the map always describe the same place
          </h3>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600 max-w-[68ch]">
            <p>
              <strong className="text-slate-700">Alerts answer &ldquo;which area needs a cleanup sweep?&rdquo;</strong>{" "}
              — density over the whole boundary.{" "}
              <strong className="text-slate-700">The map answers &ldquo;inside that area, where exactly is the waste?&rdquo;</strong>{" "}
              — the same density, computed one cell at a time. Same K, same band
              edges: a cell cannot land in a different band than the area it sits
              in at the same density.
            </p>
            <p>
              <strong className="text-slate-700">Raising an alert takes real density.</strong>{" "}
              Critical is CCI &gt; {fmt(bands[0]?.above)} and CCI = {DRONE_K_FACTOR} ×
              detections ÷ area, so crossing it takes more than one de-duplicated
              detection per square metre of the drawn area. Redrawing a larger
              boundary raises the denominator and lowers the CCI with no cleanup at
              all, while the count printed beside it never changes.
            </p>
            <p>
              <strong className="text-slate-700">Why cell colors never fire alerts.</strong>{" "}
              Cell size is a presentational choice — it adapts to the boundary and
              cells at the edge are clipped to it. If alerts keyed off cells,
              redrawing or resizing the grid could create, or silently silence, a
              Critical alert. So the alert ladder reads one number: the area&apos;s
              own CCI — the same figure on the map header chip.
            </p>
          </div>
        </div>
      </section>

      {/* ── Where the numbers come from ──────────────────────────────────── */}
      <section id="sources" aria-labelledby="sources-heading" className="scroll-mt-[var(--info-anchor,7rem)] text-justify">
        <SectionHeading id="sources-heading">Where the numbers come from</SectionHeading>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600 max-w-[68ch]">
          <p>
            <strong className="text-slate-700">Alerts.</strong> Counts and areas are
            computed in SQL over the de-duplicated detections, one shared function
            turns the area&apos;s CCI into a severity (the hotspot badges and the
            chatbot call it too), and alert wording comes from a fixed template —
            a message can&apos;t invent a figure.
          </p>
          <p>
            <strong className="text-slate-700">The assistant.</strong> It is given a
            live data block of the same computed numbers (the worst areas, plus
            any area you name, refreshed at most every 90 seconds) and only
            explains them in plain language — it doesn&apos;t calculate.
          </p>
          <p>
            <strong className="text-slate-700">Cadence.</strong> An area is
            re-evaluated whenever a drone frame finishes processing, and a weekly
            sweep covers every area; once a month a templated digest row
            summarizes all areas, including unchanged ones.
          </p>
          <p>
            <strong className="text-slate-700">The alert rule.</strong> An alert is
            created when an area first reaches High-or-worse, or worsens relative
            to its latest alert. Same severity again → no new row; the
            unacknowledged alert sitting in the table IS the reminder.
          </p>
          <p>
            <strong className="text-slate-700">Counts don&apos;t decay.</strong> The
            numerator is the area&apos;s all-time de-duplicated count, and it never
            decreases on its own — only if the underlying detection rows are
            removed from the database. There is no post-cleanup reset workflow, so a
            swept beach keeps its CCI, and its alert level, until those rows go.
          </p>
        </div>
      </section>

      {/* ── Known limits ─────────────────────────────────────────────────── */}
      <section id="limits" aria-labelledby="limits-heading" className="scroll-mt-[var(--info-anchor,7rem)]">
        <SectionHeading id="limits-heading">Known limits</SectionHeading>
        <ul className="mt-3 space-y-2 list-none max-w-[68ch]">
          {[
            "The training set is fixed. The model does not learn from new reports, and there is no retraining pipeline, by design.",
            "Frames without GPS can't be matched against other frames, so the same object may be counted more than once.",
            "Alert severity is the whole area's CCI over its all-time count: it never resets on its own, and redrawing a larger boundary lowers it without any cleanup.",
            "The CCI scale factor (K = 20) is not yet calibrated against real survey data, so alerts and cell colors are conservative — they under-report rather than over-report.",
            "The model recognizes five classes only.",
            "CCI values are small for drone-scale surveys — the color scale is rarely reached above \u201cVery low\u201d (see the Clean Coast Index section).",
          ].map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Built by ─────────────────────────────────────────────────────── */}
      <TeamSection />
    </div>
  );
}