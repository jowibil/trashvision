// Two small interactive proofs of the de-duplication stages described above:
//
//   Stage A — frames clustered by camera position (eps slider). One frame per
//             cluster runs inference; the rest are skipped.
//   Stage B — two boxes in ONE frame. IoU decides whether they are the same
//             object, whatever their labels say.
//
// The clustering here is single-linkage over the eps graph, which is exactly
// what DBSCAN with min_samples=1 computes (dbscan_service.DBSCAN_MIN_SAMPLES);
// the threshold and eps values are passed in from GET /info rather than typed.
import { useMemo, useState } from "react";
import { Crosshair, Layers } from "lucide-react";

interface DedupDemosProps {
  /** services/dbscan_service.STAGE_A_EPS_METERS, served by GET /info. */
  epsMeters?: number;
  /** services/dbscan_service.STAGE_B_IOU_EPS, served by GET /info. */
  iouThreshold?: number;
}

/** Frame GPS points, in plot units. 1 m = 5 units at the default eps. */
const GPS_FRAMES: { x: number; y: number }[] = [
  // transect 1 — a straight flight line, frames shot every ~3 m
  { x: 30, y: 45 },
  { x: 45, y: 47 },
  { x: 60, y: 43 },
  { x: 75, y: 46 },
  { x: 90, y: 44 },
  { x: 105, y: 47 },
  // transect 2 — starts back near transect 1, so a wide eps chains them
  { x: 132, y: 70 },
  { x: 146, y: 73 },
  { x: 160, y: 69 },
  { x: 174, y: 72 },
  // hovering over one pile: several frames on the same spot
  { x: 262, y: 40 },
  { x: 268, y: 46 },
  { x: 257, y: 47 },
  // one lone survey frame
  { x: 210, y: 140 },
];
const NO_GPS = 2;
const UNITS_PER_METER = 5;

/** Single-linkage clusters (== DBSCAN with min_samples=1) over a distance eps. */
function clusterFrames(points: { x: number; y: number }[], epsPx: number): number[][] {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let node = i;
    while (parent[node] !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (Math.hypot(dx, dy) <= epsPx) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  points.forEach((_, i) => {
    const root = find(i);
    const bucket = groups.get(root);
    if (bucket) bucket.push(i);
    else groups.set(root, [i]);
  });
  return [...groups.values()];
}

function StageADemo({ epsMeters }: { epsMeters: number }) {
  const [eps, setEps] = useState(epsMeters);

  const clusters = useMemo(
    () => clusterFrames(GPS_FRAMES, eps * UNITS_PER_METER),
    [eps],
  );
  const processed = clusters.length + NO_GPS;
  const total = GPS_FRAMES.length + NO_GPS;

  return (
    <div className="rounded-2xl border border-zinc-900/10 bg-white shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Crosshair size={15} className="text-[#005D90]" aria-hidden="true" />
        <p className="text-sm font-bold text-slate-900">Stage A — drag the neighborhood</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Frames within the radius share a cluster. One frame per cluster runs the
        model; the rest are skipped as duplicates.
      </p>

      <svg
        viewBox="0 0 320 180"
        className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50"
        role="img"
        aria-label={`${total} frames, ${processed} processed after clustering`}
      >
        {clusters.map((members) => {
          const rep = GPS_FRAMES[members[0]];
          return (
            <g key={members[0]}>
              <circle
                cx={rep.x}
                cy={rep.y}
                r={eps * UNITS_PER_METER}
                fill="#005D90"
                fillOpacity={0.07}
                stroke="#005D90"
                strokeOpacity={0.45}
                strokeDasharray="4 3"
                strokeWidth={1}
              />
              {members.slice(1).map((idx) => (
                <line
                  key={idx}
                  x1={rep.x}
                  y1={rep.y}
                  x2={GPS_FRAMES[idx].x}
                  y2={GPS_FRAMES[idx].y}
                  stroke="#005D90"
                  strokeOpacity={0.4}
                  strokeWidth={1}
                />
              ))}
            </g>
          );
        })}

        {clusters.map((members) => (
          <g key={`pts-${members[0]}`}>
            {members.slice(1).map((idx) => (
              <circle
                key={idx}
                cx={GPS_FRAMES[idx].x}
                cy={GPS_FRAMES[idx].y}
                r={4}
                fill="#FFFFFF"
                stroke="#64748B"
                strokeWidth={1.5}
              />
            ))}
            <circle
              cx={GPS_FRAMES[members[0]].x}
              cy={GPS_FRAMES[members[0]].y}
              r={5.5}
              fill="#005D90"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          </g>
        ))}
      </svg>

      <div className="mt-3 flex flex-col gap-1">
        <label
          htmlFor="stage-a-eps"
          className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold text-slate-600"
        >
          Neighborhood radius
          <span className="tabular-nums text-slate-900">{eps.toFixed(1)} m</span>
        </label>
        <input
          id="stage-a-eps"
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={eps}
          onChange={(e) => setEps(Number(e.target.value))}
          className="w-full accent-[#005D90]"
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        <strong className="font-bold text-slate-700 tabular-nums">{clusters.length}</strong>{" "}
        GPS clusters from {GPS_FRAMES.length} frames
        {NO_GPS > 0 && <> + {NO_GPS} without a GPS fix (always processed)</>} →{" "}
        <strong className="font-bold text-slate-700 tabular-nums">{processed}</strong> of{" "}
        {total} frames run inference. Filled dot = the frame that runs, hollow = duplicate.
      </p>
    </div>
  );
}

function StageBDemo({ iouThreshold }: { iouThreshold: number }) {
  const [offset, setOffset] = useState(30);
  const [threshold, setThreshold] = useState(iouThreshold);

  // Two boxes in one frame's pixel space. B drifts right and slightly down.
  const a = { x: 20, y: 35, w: 150, h: 75 };
  const b = { x: 20 + offset, y: 35 + offset * 0.4, w: 150, h: 75 };

  const interW = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const interH = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const intersection = interW * interH;
  const union = a.w * a.h + b.w * b.h - intersection;
  const iou = union > 0 ? intersection / union : 0;
  const merged = iou >= threshold;

  return (
    <div className="rounded-2xl border border-zinc-900/10 bg-white shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Layers size={15} className="text-[#005D90]" aria-hidden="true" />
        <p className="text-sm font-bold text-slate-900">Stage B — drag one box away</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Two boxes from the same frame. Overlap decides whether they are one object;
        the labels do not.
      </p>

      <svg
        viewBox="0 0 320 180"
        className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50"
        role="img"
        aria-label={`Two boxes, IoU ${iou.toFixed(2)}, ${merged ? "merged" : "kept apart"}`}
      >
        {intersection > 0 && (
          <rect
            x={Math.max(a.x, b.x)}
            y={Math.max(a.y, b.y)}
            width={interW}
            height={interH}
            fill="#005D90"
            fillOpacity={0.16}
          />
        )}
        <rect
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          fill="#2882FF"
          fillOpacity={0.1}
          stroke="#2882FF"
          strokeWidth={2}
        />
        {/* Merged: B is the discarded raw box, so it reads like every other
            discarded box in this project — dashed red. Not merged: B is a real
            detection of its own. */}
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          fill="none"
          stroke={merged ? "#DC2626" : "#2882FF"}
          strokeWidth={merged ? 1.75 : 2}
          strokeDasharray={merged ? "6 4" : undefined}
        />
        <text x={a.x + 4} y={a.y - 6} fontSize={10} fontWeight={700} fill="#1D4ED8">
          plastic 0.83
        </text>
        <text
          x={Math.min(b.x + 4, 250)}
          y={Math.min(b.y + b.h + 13, 174)}
          fontSize={10}
          fontWeight={700}
          fill={merged ? "#64748B" : "#B91C1C"}
        >
          {merged ? "discarded · plastic 0.41" : "plastic 0.41"}
        </text>
      </svg>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="stage-b-offset"
            className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-600"
          >
            Box separation
            <span className="tabular-nums text-slate-900">{offset}px</span>
          </label>
          <input
            id="stage-b-offset"
            type="range"
            min={0}
            max={140}
            step={1}
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
            className="w-full accent-[#005D90]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="stage-b-threshold"
            className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-600"
          >
            Merge threshold
            <span className="tabular-nums text-slate-900">{threshold.toFixed(2)}</span>
          </label>
          <input
            id="stage-b-threshold"
            type="range"
            min={0.3}
            max={0.9}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-[#005D90]"
          />
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        IoU{" "}
        <strong className="font-bold text-slate-700 tabular-nums">{iou.toFixed(2)}</strong>{" "}
        {merged ? "≥" : "<"}{" "}
        <span className="tabular-nums">{threshold.toFixed(2)}</span> →{" "}
        {merged ? (
          <>
            one object: two raw boxes become{" "}
            <strong className="font-bold text-slate-700">one detection</strong>, keeping
            the higher confidence (0.83).
          </>
        ) : (
          <>
            two objects: both survive as their own detections — this stage never
            discards a box that overlaps nothing.
          </>
        )}
      </p>
    </div>
  );
}

export default function DedupDemos({ epsMeters = 3, iouThreshold = 0.5 }: DedupDemosProps) {
  return (
    // Keys remount the demos once the served values arrive, so the sliders
    // start at the backend's real eps/IoU instead of the offline fallback.
    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <StageADemo key={`a-${epsMeters}`} epsMeters={epsMeters} />
      <StageBDemo key={`b-${iouThreshold}`} iouThreshold={iouThreshold} />
    </div>
  );
}
