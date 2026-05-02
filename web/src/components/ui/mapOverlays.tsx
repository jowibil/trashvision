import { Calendar } from "lucide-react";
import { useRef } from "react";

export const MapOverlays = ({
  week,
  setWeek,
  threshold,
  setThreshold,
  selectedDate,
  setSelectedDate,
  drawerOpen,
}: any) => {
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      {!drawerOpen && (
        <div className="absolute top-6 right-6 z-[400] w-64 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white">
          <div className="flex justify-between mb-2">
            <label className="text-xs font-black uppercase text-slate-500">
              Min Items/Cell
            </label>
            <span className="text-xs font-black text-blue-600">
              {threshold}
            </span>
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
      )}

      <div
        className={`absolute bottom-6 left-6 z-[400] transition-opacity duration-300 ${drawerOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <div className="bg-slate-900/95 text-white p-4 rounded-3xl shadow-2xl backdrop-blur-lg border border-white/10 w-80">
          <div className="flex justify-between items-center mb-4">
            <div
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => dateInputRef.current?.showPicker()}
            >
              <div className="p-2 bg-blue-500 rounded-lg text-white">
                <Calendar size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase leading-tight tracking-widest">
                  Week {week} View
                </h3>
                <p className="text-[9px] font-bold text-left text-blue-400 uppercase">
                  Cumulative Data
                </p>
              </div>
            </div>
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDate.toISOString().split("T")[0]}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
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

            {/* LABELS SECTION */}
            <div className="flex justify-between mt-2 px-1">
              {[1, 2, 3, 4].map((w) => (
                <div key={w} className="flex flex-col items-center">
                  <div
                    className={`w-1 h-1 rounded-full mb-1 ${week === w ? "bg-blue-400" : "bg-slate-600"}`}
                  />
                  <p
                    className={`text-[10px] font-black tracking-tighter transition-colors ${week === w ? "text-blue-400" : "text-slate-500"}`}
                  >
                    WK {w}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
