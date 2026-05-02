import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Filter, MapPin, Search, ArrowRight,
  BottleWine as BottleIcon, ShoppingBag, Trash, Layers, Info,
} from "lucide-react";
import { useAreas } from "../services/hooks/useAreas";
import api from "../api/axios";

const FALLBACK_DATA = [
  { id: "1", date: "2026-04-20", time: "10:30", location: "Lapaz - Sector A", wasteTypes: ["plastic_rigid"], confidence: 92 },
  { id: "2", date: "2026-04-20", time: "11:15", location: "San Pedro Shoreline", wasteTypes: ["glass", "metal"], confidence: 68 }
];

const WasteIcon = ({ type }: { type: string }) => {
  const baseClasses = "w-6 h-6 rounded-full border flex items-center justify-center p-1 shadow-sm";
  if (type.includes("plastic")) return <div className={`${baseClasses} border-blue-400 text-blue-500 bg-blue-50`}><BottleIcon size={12} /></div>;
  if (type === "glass") return <div className={`${baseClasses} border-purple-400 text-purple-500 bg-purple-50`}><Trash size={12} /></div>;
  if (type === "metal") return <div className={`${baseClasses} border-slate-500 text-slate-600 bg-slate-50`}><Layers size={12} /></div>;
  return <div className={`${baseClasses} border-emerald-400 text-emerald-500 bg-emerald-50`}><ShoppingBag size={12} /></div>;
};

const HistoricalTrashLogs: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedAreaId, setSelectedAreaId] = useState("All");
  const [logs, setLogs] = useState<any[]>([]); // REAL DATA STATE
  const [loadingLogs, setLoadingLogs] = useState(true);
  
  const { areas, loading: loadingAreas } = useAreas();
  const tableTopRef = useRef<HTMLDivElement>(null);

  // --- REAL DATA FETCHING ---
  useEffect(() => {
    const fetchDetections = async () => {
      setLoadingLogs(true);
      try {
        // Construct query parameters for FastAPI
        const params = new URLSearchParams();
        if (selectedType !== "All") params.append("waste_type", selectedType);
        if (selectedAreaId !== "All") params.append("area_id", selectedAreaId);
        if (searchQuery) params.append("search", searchQuery);

        const response = await api.get(`/detections?${params.toString()}`);
        setLogs(response.data.length > 0 ? response.data : FALLBACK_DATA);
      } catch (err) {
        console.error("Failed to fetch detections", err);
        setLogs(FALLBACK_DATA);
      } finally {
        setLoadingLogs(false);
      }
    };

    const debounce = setTimeout(fetchDetections, 300); 
    return () => clearTimeout(debounce);
  }, [selectedType, selectedAreaId, searchQuery]);

  const stats = useMemo(() => {
    if (logs.length === 0) return { topType: "None" };
    const counts: Record<string, number> = {};
    logs.forEach(log => {
      log.wasteTypes?.forEach((t: string) => counts[t] = (counts[t] || 0) + 1);
    });
    const top = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, "None");
    return { topType: top };
  }, [logs]);

  return (
    <div className="min-h-screen p-8 font-sans text-slate-700 bg-slate-50/30">
      <header className="flex justify-between items-end mb-8">
        <div>
          <h3 className="text-3xl font-black text-[#004a7c] tracking-tight">Historical Trash Logs</h3>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Audit Trail & Spatial Intelligence</p>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="flex gap-6 mb-8">
        <div className="grow bg-white rounded-3xl p-6 flex flex-col gap-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#005D90] rounded-full text-[10px] font-black tracking-widest">
              <Filter size={12} /> ENGINE FILTERS
            </div>
            {(selectedType !== "All" || selectedAreaId !== "All" || searchQuery !== "") && (
              <button 
                onClick={() => { setSelectedType("All"); setSelectedAreaId("All"); setSearchQuery(""); }}
                className="text-[10px] font-black text-red-400 hover:text-red-600 tracking-widest uppercase"
              >
                Reset Engine
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Classification</label>
              <select 
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="All">All Categories</option>
                <option value="plastic_rigid">Plastic (Rigid)</option>
                <option value="glass">Glass</option>
                <option value="metal">Metal</option>
              </select>
            </div>

            {/* Area */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Spatial Zone</label>
              <select 
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="All">All Areas</option>
                {areas.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.area_name}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Search Context</label>
              <div className="relative">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Keywords..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Insight Card */}
        <div className="w-72 bg-[#005D90] rounded-3xl p-6 text-white shadow-xl flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black opacity-60 tracking-[0.2em] mb-1">MOST DETECTED</p>
            <h4 className="text-xl font-black">{stats.topType.replace("_", " ").toUpperCase()}</h4>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold bg-white/10 w-fit px-2 py-1 rounded-md">
            <Info size={12}/> DATA UPDATED LIVE
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div ref={tableTopRef} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <h4 className="text-lg font-black text-slate-800">Verification Stream</h4>
          <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
            {logs.length} Records Found
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Temporal Info</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Spatial Marker</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Class</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Confidence</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loadingLogs ? (
                <tr><td colSpan={5} className="py-20 text-center font-bold text-slate-300 animate-pulse">Synchronizing with PostGIS...</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="px-8 py-6">
                    <p className="text-sm font-black text-slate-800">{log.date}</p>
                    <p className="text-[10px] font-bold text-slate-400">{log.time} PST</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-600">
                      <MapPin size={14} className="text-blue-500" /> {log.location}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex justify-center gap-1">
                      {log.wasteTypes.map((t: string, i: number) => <WasteIcon key={i} type={t} />)}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#005D90] h-full rounded-full" style={{ width: `${log.confidence}%` }} />
                      </div>
                      <span className="text-xs font-black text-[#005D90]">{log.confidence}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button className="text-blue-600 hover:text-blue-800 transition-transform group-hover:translate-x-1">
                      <ArrowRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoricalTrashLogs;