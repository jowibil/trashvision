import { useEffect, useState, useMemo, useCallback } from "react";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";
import InsightsBanner from "../components/shared/InsightsBanner";
import ZoneMapPreview from "../components/shared/ZoneMapPreview";
import { useAreas } from "../services/hooks/useAreas";
import type { Area } from "../services/hooks/useAreas";
import type { DashboardStats } from "../types/types";

// Hoisted: pure lookup data/functions that don't depend on component state
// are moved to module scope so they aren't re-allocated on every render.
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SeverityConfig = { bg: string; text: string };

// Tinted chips instead of white-on-color: white text on yellow-500 failed
// WCAG AA contrast (~1.9:1). Tinted bg + dark text matches the page's pill
// language ("Live System Logs" etc.) and passes AA.
const SEVERITY_CONFIG: Record<"high" | "medium" | "low", SeverityConfig> = {
  high: { bg: "bg-red-100 text-red-700", text: "High" },
  medium: { bg: "bg-amber-100 text-amber-800", text: "Medium" },
  low: { bg: "bg-green-100 text-green-700", text: "Low" },
};

function getSeverityConfiguration(level: string): SeverityConfig {
  const normalized = level.toLowerCase();
  if (normalized === "high" || normalized === "critical") return SEVERITY_CONFIG.high;
  if (normalized === "medium") return SEVERITY_CONFIG.medium;
  return SEVERITY_CONFIG.low;
}

type HotspotZone = NonNullable<DashboardStats["activeZones"]>[number];

/**
 * One hotspot zone card: severity chip, real map preview of the zone, name
 * and latest-activity date. Kept as a component so the area lookup stays
 * local and the card stays memo-friendly in the zones grid.
 */
function ZoneCard({ zone, area }: { zone: HotspotZone; area?: Area }) {
  const config = getSeverityConfiguration(zone.severity);
  return (
    <div className="relative bg-[#fcfcfc] border border-zinc-900/10 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <span
        className={`absolute top-3 left-3 ${config.bg} text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shadow-sm z-10`}
      >
        {config.text} Severity
      </span>

      <div className="h-40 w-full bg-slate-100 overflow-hidden relative" aria-hidden="true">
        {/* P1 fix (critique 2026-11-01): every zone used to render the same
            static herobg.png placeholder. This is now the zone's real OSM
            tile + boundary via ZoneMapPreview. Revert options (placeholder
            plate or a text-only card) are documented at the top of
            ZoneMapPreview.tsx. */}
        <ZoneMapPreview area={area} />
      </div>

      <div className="p-4 text-left flex-1 flex flex-col justify-between">
        <div>
          {/* text-md doesn't exist in Tailwind's scale — was silently doing nothing. */}
          <h4 className="text-base font-bold text-slate-800 tracking-tight line-clamp-1">
            {zone.name}
          </h4>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">{zone.date}</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const userName = localStorage.getItem("user_name") || "Guest";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  // When the current numbers were fetched — surfaces on the metric chips so
  // "what produced this number" (pipeline jargon) is replaced by "how fresh
  // it is" (operator-relevant).
  const [updatedAt, setUpdatedAt] = useState<string>("");

  // Area centroids/boundaries feed the hotspot cards' real map previews.
  // Cache-first + revalidate (useAreas) — offline still shows last-known
  // zones instead of blank plates.
  const { areas } = useAreas();

  const areaById = useMemo(
    () => new Map(areas.map((area) => [String(area.area_id), area])),
    [areas],
  );

  // Fetch is hoisted out of the effect so the failure state's Retry button
  // can re-run exactly this request — a full window.location.reload() used
  // to drop the whole SPA session just to refetch one endpoint.
  const fetchDashboardPayload = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);

      const response = await api.get("/logs/summary");

      setStats({
        totalDetections: response.data?.total_detections ?? 0,
        mostFrequentType: response.data?.most_frequent_type ?? "None Registered",
        mostAffectedArea: response.data?.most_affected_area ?? "Clear Grid",
        trends: response.data?.weekly_trends ?? [0, 0, 0, 0, 0, 0, 0],
        composition: response.data?.waste_composition ?? [],
        activeZones: response.data?.hotspot_zones ?? [],
      });
      setUpdatedAt(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      );
    } catch (err) {
      console.error("Dashboard engine data hydration failure:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardPayload();
  }, [fetchDashboardPayload]);

  const maxTrendValue = useMemo(() => {
    if (!stats || stats.trends.length === 0) return 1;
    const max = Math.max(...stats.trends);
    return max === 0 ? 1 : max;
  }, [stats]);

  const primaryMaterialMetric = useMemo(() => {
    if (!stats || !stats.composition.length) return { type: "N/A", percentage: 0 };
    return stats.composition[0];
  }, [stats]);

  const openMap = useCallback(() => navigate("/portal/map"), [navigate]);

  // Metric-chip data (fix #9b): the chips used to be decorative dev-jargon
  // ("System Logs", "YOLO V8", "Requires Sweep"); each now carries real,
  // per-card information from the same fetch.
  const chipTexts = useMemo(() => {
    const latestZoneDate = stats?.activeZones[0]?.date;
    return {
      total: updatedAt ? `Updated ${updatedAt}` : "Updated just now",
      material:
        primaryMaterialMetric.type !== "N/A"
          ? `${Math.round(primaryMaterialMetric.percentage)}% of all detections`
          : "No sample yet",
      hotspot: latestZoneDate ? `Last activity ${latestZoneDate}` : "No flight data yet",
    };
  }, [updatedAt, primaryMaterialMetric, stats?.activeZones]);

  if (loading) {
    // Skeletons mirror the loaded layout so the page doesn't jump when data
    // arrives (replaces the generic spinner).
    return (
      <div className="space-y-6 min-h-[100dvh] max-w-7xl">
        <div className="h-20 border-b border-slate-200 bg-[#fcfcfc] rounded-lg px-8 flex items-center">
          <div className="space-y-2">
            <div className="h-7 w-64 rounded bg-slate-200 animate-pulse" />
            <div className="h-4 w-40 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-5 h-36 rounded-2xl bg-[#fcfcfc] border border-zinc-900/10 animate-pulse" />
          <div className="md:col-span-4 h-36 rounded-2xl bg-[#fcfcfc] border border-zinc-900/10 animate-pulse" />
          <div className="md:col-span-3 h-36 rounded-2xl bg-[#fcfcfc] border border-zinc-900/10 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 rounded-2xl bg-[#fcfcfc] border border-zinc-900/10 animate-pulse" />
          <div className="h-96 rounded-2xl bg-[#fcfcfc] border border-zinc-900/10 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-[100dvh] w-full max-w-7xl flex items-center justify-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-sm">
          <p className="text-sm font-bold text-red-700 mb-1">Couldn't load the dashboard</p>
          <p className="text-xs text-red-600/80 mb-4">
            We couldn't reach the server. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={fetchDashboardPayload}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-h-[100dvh] max-w-7xl px-4 sm:px-6">
      <header className="h-16 sm:h-20 border-b shadow-sm rounded-lg border-slate-200 bg-[#fcfcfc] px-4 sm:px-8 shrink-0 flex items-center">
        <div className="min-w-0">
          <h3 className="text-2xl sm:text-3xl font-bold text-[#005D90] tracking-tight truncate">Dashboard Overview</h3>
          <p className="text-slate-500 font-medium text-sm truncate">Welcome back, {userName}.</p>
        </div>
      </header>

      {/* Critical-area alerts (brief Task 3d): unacknowledged insights
          from GET /insights/, with inline acknowledge. Renders nothing
          when there's nothing to act on. */}
      <InsightsBanner />

      {/* METRIC CARDS — asymmetric 12-col split instead of 3 equal columns */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-5 bg-[#fcfcfc] p-4 sm:p-6 rounded-2xl border border-zinc-900/10 shadow-sm">
          <p className="text-[11px] text-left font-semibold text-[#00677D] uppercase tracking-wider">
            Total Detections
          </p>
          <p className="text-4xl font-black text-slate-900 mt-2 tabular-nums">{stats.totalDetections}</p>
          <div className="mt-4 text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full w-fit font-semibold">
            {chipTexts.total}
          </div>
        </div>

        <div className="md:col-span-4 bg-[#fcfcfc] p-4 sm:p-6 rounded-2xl border border-zinc-900/10 shadow-sm">
          <p className="text-[11px] text-left font-semibold text-[#00677D] uppercase tracking-wider">
            Most Frequent Material
          </p>
          {/* Was text-3xl + text-xl (conflicting); settled on text-2xl. */}
          <p className="text-2xl font-black text-slate-900 mt-2 truncate h-9 flex items-center capitalize">
            {stats.mostFrequentType}
          </p>
          <div className="mt-4 text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full w-fit font-semibold">
            {chipTexts.material}
          </div>
        </div>

        <div className="md:col-span-3 bg-[#fcfcfc] p-4 sm:p-6 rounded-2xl border border-zinc-900/10 shadow-sm">
          <p className="text-[11px] text-left font-semibold text-[#00677D] uppercase tracking-wider">
            Primary Hotspot Area
          </p>
          <p className="text-2xl font-black text-slate-900 mt-2 truncate h-9 flex items-center">
            {stats.mostAffectedArea}
          </p>
          <div className="mt-4 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full w-fit font-semibold truncate max-w-full">
            {chipTexts.hotspot}
          </div>
        </div>
      </div>

      {/* CHARTS GRAPH SECTION LAYER (already asymmetric: 2/3 chart + 1/3 donut) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#fcfcfc] border border-zinc-900/10 rounded-2xl p-6 shadow-sm">
          <div className="mb-6 flex justify-between items-start">
            <div className="text-left">
              <h3 className="text-lg font-bold text-slate-800 tracking-tight">Detection Activity Trends</h3>
              <p className="text-xs text-slate-400">Detections across the last 7 days</p>
            </div>
          </div>

          {/* Values are visible above every bar (previously a hover-only
              chip keyboard users could never see); the sr-only paragraph
              gives screen readers the same per-day data as text. */}
          <div className="h-64 flex items-stretch gap-3 px-2">
            {stats.trends.map((value, index) => {
              const percentageHeight = (value / maxTrendValue) * 100;
              return (
                <div key={index} className="flex-1 flex flex-col items-center group relative">
                  {/* Show every count, including zeros — an empty axis label
                      would make a zero day indistinguishable from missing
                      data. */}
                  <span
                    className={`text-[9px] font-semibold tabular-nums ${
                      index === (new Date().getDay() + 6) % 7
                        ? "text-[#005D90]"
                        : "text-slate-500"
                    }`}
                  >
                    {value}
                  </span>
                  <div className="w-full flex-1 flex items-end mt-1">
                    <div
                      className={`w-full rounded-t-lg transition-colors duration-200 ease-out ${
                        // getDay() is 0 on Sunday; map it to the last label slot.
                        index === (new Date().getDay() + 6) % 7
                          ? "bg-[#005D90]"
                          : "bg-slate-200 group-hover:bg-slate-300"
                      }`}
                      style={{ height: `${Math.max(4, percentageHeight)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 mt-2 uppercase">{DAY_LABELS[index]}</span>
                </div>
              );
            })}
          </div>
          <p className="sr-only">
            Detections per day: {stats.trends.map((v, i) => `${DAY_LABELS[i]} ${v}`).join(", ")}.
          </p>
        </div>

        <div className="bg-[#fcfcfc] border border-zinc-900/10 rounded-2xl p-6 shadow-sm flex flex-col items-center">
          <div className="w-full mb-6 text-left">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Waste Breakdown</h3>
            <p className="text-xs text-slate-400">Share of detections by material</p>
          </div>

          <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
            {/* SVG donut: the arc now matches the actual primary share. The
                old fixed border-arc showed the same 45° sweep regardless of
                the percentage in the center. */}
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="14" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#005D90"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${(primaryMaterialMetric.percentage / 100) * 2 * Math.PI * 52} ${
                  2 * Math.PI * 52
                }`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-black text-slate-800 tabular-nums">{Math.round(primaryMaterialMetric.percentage)}%</p>
              <p className="text-[11px] font-medium text-slate-500 truncate max-w-[90px]">
                {primaryMaterialMetric.type}
              </p>
            </div>
          </div>

          <div className="w-full space-y-2 text-xs">
            {stats.composition.map((item, index) => (
              <div key={index} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 capitalize">
                  <span className={`h-2 w-2 rounded-full ${index === 0 ? "bg-[#005D90]" : "bg-slate-300"}`} />
                  <span className="font-semibold text-slate-600 text-[11px]">{item.type.replace("_", " ")}</span>
                </div>
                <span className="font-bold text-[#005D90] tabular-nums">{Math.round(item.percentage)}%</span>
              </div>
            ))}
            {stats.composition.length === 0 ? (
              <p className="text-xs text-slate-400 italic font-medium">No material telemetry logging recorded.</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* DETECTED GEOGRAPHY WORKSPACE GRID HOTSPOTS */}
      <div className="p-6 rounded-2xl bg-[#005D90]/5 border border-[#005D90]/10 mb-6">
        <div className="flex justify-between items-center mb-6">
          <div className="text-left">
            <h3 className="text-xl font-bold text-slate-800 tracking-tight">Critical Hotspot Zones</h3>
            <p className="text-xs text-slate-400">Zones with the highest recent detections</p>
          </div>
          <button
            type="button"
            onClick={openMap}
            className="text-xs font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 transition-colors bg-[#fcfcfc] border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm cursor-pointer active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Open Map
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.activeZones.map((zone) => (
            <ZoneCard key={zone.id} zone={zone} area={areaById.get(zone.id)} />
          ))}
        </div>

        {stats.activeZones.length === 0 ? (
          <div className="bg-[#fcfcfc] p-12 rounded-xl text-center border border-dashed border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">No hotspot zones right now</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}