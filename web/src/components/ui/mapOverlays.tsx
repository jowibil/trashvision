import { Calendar } from "lucide-react";
import { useRef } from "react";
import type { WasteClass } from "../../types/types";

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

// Hoisted: the 4 week slots never change, so this doesn't need to be a
// fresh array literal inside the render's JSX every time.
const WEEK_SLOTS = [1, 2, 3, 4] as const;

interface MapOverlaysProps {
  week: number;
  setWeek: (week: number) => void;
  threshold: number;
  setThreshold: (threshold: number) => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  drawerOpen: boolean;
}

export const MapOverlays = ({
  week,
  setWeek,
  threshold,
  setThreshold,
  selectedDate,
  setSelectedDate,
  drawerOpen,
}: MapOverlaysProps) => {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const localDateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(
    selectedDate.getDate(),
  ).padStart(2, "0")}`;

  return (
    <>
      {!drawerOpen ? (
        <div className="absolute top-6 right-6 z-[400] w-64 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white">
          <div className="flex justify-between mb-2">
            <label className="text-xs font-black uppercase text-slate-500">Min Items/Cell</label>
            <span className="text-xs font-black text-blue-600">{threshold}</span>
          </div>
          <input
            type="range"
            min="1"
            max="15"
            value={threshold}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setThreshold(val);
              localStorage.setItem("mapThreshold", val.toString());
            }}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      ) : null}

      <div
        className={`absolute bottom-6 left-6 z-[400] transition-opacity duration-300 ${
          drawerOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <div className="bg-slate-900/95 text-white p-4 rounded-3xl shadow-2xl backdrop-blur-lg border border-white/10 w-80">
          <div className="flex justify-between items-center mb-4">
            <button
              type="button"
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => dateInputRef.current?.showPicker()}
            >
              <div className="p-2 bg-blue-500 rounded-lg text-white">
                <Calendar size={16} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black uppercase leading-tight tracking-widest">Week {week} View</h3>
                <p className="text-[9px] font-bold text-left text-blue-400 uppercase">
                  Cumulative: Jan 1 – {selectedDate.toLocaleString("default", { month: "short" })}{" "}
                  {week === 4 ? "end of month" : week * 7}, {selectedDate.getFullYear()}
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
          <div className="mt-3">
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={week}
              onChange={(e) => setWeek(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
            />

            <div className="flex gap-1 mt-3">
              {WEEK_SLOTS.map((w) => {
                // FIX: dropped the unused `start` (always Jan 1 now, not
                // meaningful per-button) and relabeled as a "thru" checkpoint
                // to match the cumulative filter in useHexbins.ts.
                const end = w === 4 ? "end" : w * 7;
                return (
                  <button
                    type="button"
                    key={w}
                    onClick={() => setWeek(w)}
                    className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                      week === w ? "bg-blue-500" : "bg-slate-700 hover:bg-slate-600"
                    }`}
                  >
                    <div className="text-[11px] font-bold text-white">Wk {w}</div>
                    <div className={`text-[9px] mt-0.5 ${week === w ? "text-blue-200" : "text-slate-400"}`}>
                      Thru {selectedDate.toLocaleString("default", { month: "short" })} {end}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};