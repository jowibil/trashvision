// Interactive CCI cell: move the litter count and the cell edge, watch the
// band (and therefore the map color) move with them.
//
// Every number here is imported or passed in — K, the bands, the colors and the
// edge clamps all come from the same modules the map computes with, so the demo
// cannot drift from the real scale. The honest finding it lets a reader reach
// on their own: at drone cell sizes the color barely leaves the bottom band.
import { useState } from "react";
import {
  CCI_LEGEND_ITEMS,
  DRONE_K_FACTOR,
  classifyCci,
  getCciColor,
} from "../../services/hooks/useHexbins";

interface HexDemoProps {
  /** Clamps served by GET /info (mobile_service.HEX_EDGE_*), in meters. */
  edgeMinM?: number;
  edgeMaxM?: number;
  defaultEdgeM?: number;
}

const hexAreaM2 = (edge: number) => (3 * Math.sqrt(3) / 2) * edge * edge;
const DOT_CAP = 120;

/** Flat-top hexagon points for circumradius r, centered at (cx, cy). */
const hexPoints = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");

/** Deterministic sunflower packing so dots never rely on Math.random. */
const dotPosition = (i: number, n: number, radius: number) => {
  const golden = 2.399963229728653;
  const r = radius * Math.sqrt((i + 0.5) / Math.max(n, 1)) * 0.86;
  const theta = i * golden;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
};

export default function HexDemo({ edgeMinM, edgeMaxM, defaultEdgeM }: HexDemoProps) {
  const edgeMin = edgeMinM ?? 25;
  const edgeMax = edgeMaxM ?? 1000;
  const start = Math.min(Math.max(defaultEdgeM ?? edgeMin, edgeMin), edgeMax);

  const [edge, setEdge] = useState(start);
  const [count, setCount] = useState(20);

  const area = hexAreaM2(edge);
  const cci = (DRONE_K_FACTOR * count) / area;
  const band = classifyCci(cci);
  const color = getCciColor(band);
  // CCI > 5 (the Moderate edge) needs count > 5 × area / K — same expression
  // the static worked example above uses, so the two numbers cannot disagree.
  const moderateNeeds = Math.ceil((5 * area) / DRONE_K_FACTOR);

  const norm = Math.min(Math.max((edge - edgeMin) / (edgeMax - edgeMin), 0), 1);
  const radius = 30 + 54 * norm;
  const shown = Math.min(count, DOT_CAP);
  const dots = Array.from({ length: shown }, (_, i) => dotPosition(i, shown, radius));

  return (
    <div className="mt-5 rounded-2xl border border-zinc-900/10 bg-white shadow-sm p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Try it: one cell, real arithmetic
      </p>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 items-center">
        <svg viewBox="0 0 200 200" className="mx-auto h-44 w-44 lg:h-52 lg:w-52" role="img"
          aria-label={`One hexagon cell containing ${count} detections, rated ${band}`}>
          <polygon
            points={hexPoints(100, 100, radius)}
            fill={`${color}22`}
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {dots.map((dot, i) => (
            <circle key={i} cx={100 + dot.x} cy={100 + dot.y} r={2.6} fill={color} />
          ))}
        </svg>

        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: color }}>
              {band}
            </span>
            <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
              CCI = {DRONE_K_FACTOR} × {count.toLocaleString("en-US")} ÷{" "}
              {Math.round(area).toLocaleString("en-US")} m² ={" "}
              {cci < 1 ? cci.toFixed(3) : cci.toFixed(2)}
            </span>
          </div>

          <div>
            <label htmlFor="hex-count" className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-600">
              Detections in this cell
              <span className="tabular-nums text-slate-900">{count}</span>
            </label>
            <input
              id="hex-count"
              type="range"
              min={0}
              max={800}
              step={10}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="mt-1 w-full accent-[#005D90]"
            />
          </div>

          <div>
            <label htmlFor="hex-edge" className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-600">
              Cell edge
              <span className="tabular-nums text-slate-900">{edge.toLocaleString("en-US")} m</span>
            </label>
            <input
              id="hex-edge"
              type="range"
              min={edgeMin}
              max={edgeMax}
              step={5}
              value={edge}
              onChange={(e) => setEdge(Number(e.target.value))}
              className="mt-1 w-full accent-[#005D90]"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Real cells run {edgeMin.toLocaleString("en-US")}–{edgeMax.toLocaleString("en-US")} m,
              sized from the drawn boundary — this is the served clamp, not a demo range.
            </p>
          </div>

          <p className="text-xs leading-relaxed text-slate-600">
            At this cell size, reaching Moderate takes more than{" "}
            <strong className="font-bold text-slate-700 tabular-nums">
              {moderateNeeds.toLocaleString("en-US")}
            </strong>{" "}
            de-duplicated detections in one cell. That is the size-invariance
            trade-off, not a bug — the count beside the color still tells you how
            much waste is actually there.
          </p>

          {count > DOT_CAP && (
            <p className="text-[11px] text-slate-500">
              Dots are capped at {DOT_CAP} for legibility; the arithmetic uses all{" "}
              {count.toLocaleString("en-US")}.
            </p>
          )}
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2 list-none p-0">
        {CCI_LEGEND_ITEMS.map((item) => {
          const active = item.label === band;
          return (
            <li
              key={item.label}
              className={`rounded-xl border p-2.5 ${
                active ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white"
              }`}
              aria-current={active ? "true" : undefined}
            >
              <span
                className="block h-1.5 w-8 rounded-full"
                style={{ backgroundColor: getCciColor(item.category) }}
                aria-hidden="true"
              />
              <p className={`mt-1.5 text-xs ${active ? "font-bold text-slate-900" : "font-semibold text-slate-600"}`}>
                {item.label}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">CCI {item.desc}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
