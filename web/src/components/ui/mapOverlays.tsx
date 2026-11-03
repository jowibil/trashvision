import { Calendar, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WasteClass } from "../../types/types";

export type MapViewMode = "month" | "accumulated";

export const WasteColorMap: Record<WasteClass, string> = {
  plastic: "#EF4444", // Red
  styrofoam: "#F87171", // Light Red / Pink
  glass: "#3B82F6", // Blue
  metal: "#8B5CF6", // Purple
  composite_packaging: "#F59E0B", // Amber
};

export const getMarkerStyle = (wasteType: WasteClass) => ({
  backgroundColor: WasteColorMap[wasteType],
  borderColor: "#FFFFFF",
  borderWidth: "2px",
});

// The four week slots never change, so the array is defined once here
// instead of being rebuilt inside the JSX each render.
const WEEK_SLOTS = [1, 2, 3, 4] as const;

// Mobile-only collapse state for the two floating cards: at max-sm the map
// stage is too small to give both cards permanent room, so each becomes a
// corner chip that expands its card. One open at a time (mutual exclusion);
// sm+ (and up) ignores this entirely and renders the always-open cards.
type ExpandedOverlay = "controls" | "calendar" | null;

interface MapOverlaysProps {
  week: number;
  setWeek: (week: number) => void;
  threshold: number;
  setThreshold: (threshold: number) => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  drawerOpen: boolean;
  viewMode: MapViewMode;
  setViewMode: (mode: MapViewMode) => void;
}

export const MapOverlays = ({
  week,
  setWeek,
  threshold,
  setThreshold,
  selectedDate,
  setSelectedDate,
  drawerOpen,
  viewMode,
  setViewMode,
}: MapOverlaysProps) => {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [expanded, setExpanded] = useState<ExpandedOverlay>(null);
  const overlaysRootRef = useRef<HTMLDivElement | null>(null);
  const localDateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(
    selectedDate.getDate(),
  ).padStart(2, "0")}`;

  // Outside-tap collapse (phones' primary dismiss gesture, Google-Maps
  // style): while a chip's card is open, any mousedown that starts outside
  // this overlay root collapses it. Desktop never opens chips, so this
  // listener is effectively a mobile-only cost.
  useEffect(() => {
    if (!expanded) return;
    const handleOutsideMouseDown = (e: MouseEvent) => {
      if (
        overlaysRootRef.current &&
        !overlaysRootRef.current.contains(e.target as Node)
      ) {
        setExpanded(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideMouseDown);
    return () =>
      document.removeEventListener("mousedown", handleOutsideMouseDown);
  }, [expanded]);

  // Accumulated windows hold many more detections than a single month, so
  // the min/cell floor rises (product spec: slider up to 100 in this mode).
  const thresholdMax = viewMode === "accumulated" ? 100 : 15;
  const effectiveThreshold = Math.min(threshold, thresholdMax);

  // One-line teasers so the collapsed chips still answer "what window is
  // on the map?" without opening anything.
  const calendarChipLabel =
    viewMode === "accumulated"
      ? `Jan – ${selectedDate.toLocaleString("default", { month: "short" })}`
      : `Wk ${week} · ${selectedDate.toLocaleString("default", { month: "short" })}`;

  return (
    <div ref={overlaysRootRef} className="absolute inset-0 pointer-events-none">
      {/* SETTINGS (view mode + threshold): chip when collapsed on mobile,
          always-open card on sm+ — exact same card as before the chips. */}
      {!drawerOpen ? (
        <>
          {expanded !== "controls" ? (
            <button
              type="button"
              onClick={() => setExpanded("controls")}
              aria-label="Show detection filter controls"
              className="pointer-events-auto absolute top-3 right-3 sm:hidden z-[400] flex items-center gap-1.5 py-2 px-3 bg-white/90 backdrop-blur-md rounded-full shadow-xl border border-slate-200 text-[11px] font-bold text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-500 transition-opacity duration-300"
            >
              <SlidersHorizontal size={14} className="text-[#005D90]" aria-hidden="true" />
              ≥ {effectiveThreshold}/cell
            </button>
          ) : null}
          <div
            className={`pointer-events-auto absolute top-3 right-3 sm:top-6 sm:right-6 z-[400] ${
              expanded === "controls" ? "tv-pop-in" : "hidden sm:block"
            }`}
          >
            <div className="relative w-56 sm:w-64 bg-white/90 backdrop-blur-md p-3 sm:p-4 rounded-2xl shadow-xl border border-white">
            {/* View switch: segmented pill control, same visual language as
                the week chips and the mobile MapPanel toggles. */}
            <div className="flex mb-3 p-0.5 bg-slate-100 rounded-xl">
              {(
                [
                  { id: "month", label: "Per Month" },
                  { id: "accumulated", label: "Accumulated" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setViewMode(m.id);
                    // Clamp an out-of-range threshold when switching modes
                    // (accumulated uses a higher slider ceiling).
                    setThreshold(Math.min(threshold, m.id === "accumulated" ? 100 : 15));
                  }}
                  className={`flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-wider transition-all ${
                    viewMode === m.id
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex justify-between mb-2">
              <label className="text-xs font-black uppercase text-slate-500">Min Items/Cell</label>
              <span className="text-xs font-black text-blue-600">{effectiveThreshold}</span>
            </div>
            <input
              type="range"
              min="1"
              max={thresholdMax}
              value={effectiveThreshold}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setThreshold(val);
                localStorage.setItem("mapThreshold", val.toString());
              }}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            {viewMode === "accumulated" && (
              <p className="mt-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Jan 1 – {selectedDate.toLocaleString("default", { month: "short" })} {selectedDate.getFullYear()}, all history this year
              </p>
            )}
            {/* Mobile collapse affordance (dismiss = also outside-tap). */}
            <button
              type="button"
              onClick={() => setExpanded(null)}
              aria-label="Hide detection filter controls"
              className="sm:hidden absolute top-1 right-1 p-1.5 bg-white rounded-full shadow-sm border border-slate-200 text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <X size={12} aria-hidden="true" />
            </button>
            </div>
          </div>
        </>
      ) : null}

      {/* CALENDAR (date + week window): chip when collapsed on mobile,
          always-open card on sm+ — exact same card as before the chips.
          The drawer-open fade wrapper stays as-is (opacity + pointer-events). */}
      <div
        className={`transition-opacity duration-300 ${
          drawerOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {expanded !== "calendar" ? (
          <button
            type="button"
            onClick={() => setExpanded("calendar")}
            aria-label="Show map date and week controls"
            className={`pointer-events-auto absolute bottom-3 left-3 sm:hidden z-[400] flex items-center gap-1.5 py-2 px-3 bg-white/90 backdrop-blur-md rounded-full shadow-xl border border-slate-200 text-[11px] font-bold text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-500 ${
              drawerOpen ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <Calendar size={14} className="text-[#005D90]" aria-hidden="true" />
            {calendarChipLabel}
          </button>
        ) : null}
        <div
          className={`pointer-events-auto absolute bottom-3 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-auto z-[400] ${
            expanded === "calendar" ? "tv-pop-in" : "hidden sm:block"
          }`}
        >
          <div className="relative bg-white/90 text-slate-900 p-4 rounded-2xl shadow-xl backdrop-blur-md border border-slate-200 w-full sm:w-80">
          <div className="flex justify-between items-center mb-4">
            <button
              type="button"
              aria-label="Change map date"
              className="flex items-center gap-2 cursor-pointer group focus-visible:outline-2 focus-visible:outline-blue-400"
              onClick={() => dateInputRef.current?.showPicker()}
            >
              <div className="p-2 bg-blue-500 rounded-lg text-white">
                <Calendar size={16} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black uppercase leading-tight tracking-widest">
                  {viewMode === "accumulated"
                    ? `Jan – ${selectedDate.toLocaleString("default", { month: "short" })}`
                    : `Week ${week} View`}
                </h3>
                <p className="text-[9px] font-bold text-left text-blue-600 uppercase">
                  {viewMode === "accumulated"
                    ? `Accumulated · Jan 1 – end of ${selectedDate.toLocaleString("default", { month: "short" })} ${selectedDate.getFullYear()}`
                    : `Cumulative: Jan 1 – ${selectedDate.toLocaleString("default", { month: "short" })} ${
                        week === 4 ? "end of month" : week * 7
                      }, ${selectedDate.getFullYear()}`}
                </p>
              </div>
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={localDateString}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month, day] = e.target.value.split("-").map(Number);
                  setSelectedDate(new Date(year, month - 1, day));
                }
              }}
              className="absolute opacity-0 pointer-events-none"
            />
          </div>
          {viewMode === "month" && (
            <div className="mt-3">
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={week}
              onChange={(e) => setWeek(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />

            <div className="flex gap-1 mt-3">
              {WEEK_SLOTS.map((w) => {
                // FIX: dropped the unused `start` (always Jan 1 now, not
                // meaningful per-button) and relabeled as a "thru" checkpoint
                // to match the server's cumulative week filter (hexbins
                // endpoint aggregates with the same cutoff).
                const end = w === 4 ? "end" : w * 7;
                return (
                  <button
                    type="button"
                    key={w}
                    onClick={() => setWeek(w)}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                      week === w ? "bg-blue-600" : "bg-slate-100 hover:bg-slate-200"
                    }`}
                  >
                    <div className={`text-[11px] font-bold ${week === w ? "text-white" : "text-slate-700"}`}>Wk {w}</div>
                    <div className={`text-[9px] mt-0.5 ${week === w ? "text-blue-100" : "text-slate-400"}`}>
                      Thru {selectedDate.toLocaleString("default", { month: "short" })} {end}
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
          )}
          {/* Mobile collapse affordance (dismiss = also outside-tap). */}
          <button
            type="button"
            onClick={() => setExpanded(null)}
            aria-label="Hide map date and week controls"
            className="sm:hidden absolute top-1 right-1 p-1.5 bg-white rounded-full shadow-sm border border-slate-200 text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-500"
          >              <X size={12} aria-hidden="true" />
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};
