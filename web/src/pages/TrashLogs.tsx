import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Filter } from "lucide-react";
import { MapPin } from "lucide-react";
import { Search } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { BottleWine } from "lucide-react";
import { ShoppingBag } from "lucide-react";
import { Milk } from "lucide-react";
import { Layers } from "lucide-react";
import { Info } from "lucide-react";
import { RotateCw } from "lucide-react";
import { BoxIcon } from "lucide-react";
import { X } from "lucide-react";
import { Copy } from "lucide-react";
import { useAreas } from "../services/hooks/useAreas";
import type { DetectionRow } from "../types/types";
import api from "../api/axios";

const AssetTelemetryPreview = React.memo(({ log }: { log: DetectionRow }) => {
  const [scales, setScales] = useState({ scaleX: 1, scaleY: 1 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleImageLoad = () => {
    if (imgRef.current) {
      const renderedWidth = imgRef.current.clientWidth;
      const renderedHeight = imgRef.current.clientHeight;

      const nativeWidth = log.image_width || 640;
      const nativeHeight = log.image_height || 640;

      setScales({
        scaleX: renderedWidth / nativeWidth,
        scaleY: renderedHeight / nativeHeight,
      });
    }
  };

  // Maps the backend payload array directly to the flat object layout
  const normalizedBoxes = useMemo(() => {
    // 1. Check for nested arrays or JSON strings
    const sourceData =
      (log as any).detections || log.bounding_boxes || (log as any).boxes;

    if (sourceData) {
      if (typeof sourceData === "string") {
        try {
          const parsed = JSON.parse(sourceData);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {
          console.error("Error.");
        }
      } else if (Array.isArray(sourceData)) {
        return sourceData;
      }
    }

    const logObj = log as any;
    if (logObj.bbox_x1 != null && logObj.bbox_y1 != null) {
      return [
        {
          xmin: logObj.bbox_x1,
          ymin: logObj.bbox_y1,
          xmax: logObj.bbox_x2,
          ymax: logObj.bbox_y2,
          label: log.waste_type,
        },
      ];
    }

    return [];
  }, [log]);

  return (
    <div className="space-y-4">
      <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950 flex items-center justify-center min-h-[240px]">
        {log.image_url ? (
          <>
            <img
              ref={imgRef}
              src={log.image_url}
              alt="Spatial Telemetry Capture Frame"
              className="w-full h-auto max-h-[400px] object-contain select-none z-10"
              onLoad={handleImageLoad}
            />
            <svg
              className="absolute top-0 left-0 w-full h-full pointer-events-none z-20"
              style={{
                width: imgRef.current?.clientWidth || "100%",
                height: imgRef.current?.clientHeight || "100%",
                left: imgRef.current?.offsetLeft || 0,
                top: imgRef.current?.offsetTop || 0,
              }}
            >
              {normalizedBoxes.map((box: any, idx: number) => {
                const xmin = box.xmin !== undefined ? box.xmin : box[0];
                const ymin = box.ymin !== undefined ? box.ymin : box[1];
                const xmax = box.xmax !== undefined ? box.xmax : box[2];
                const ymax = box.ymax !== undefined ? box.ymax : box[3];

                if (
                  xmin == null ||
                  ymin == null ||
                  xmax == null ||
                  ymax == null
                )
                  return null;

                const left = xmin * scales.scaleX;
                const top = ymin * scales.scaleY;
                const width = (xmax - xmin) * scales.scaleX;
                const height = (ymax - ymin) * scales.scaleY;

                return (
                  <g key={idx}>
                    <rect
                      x={left}
                      y={top}
                      width={width}
                      height={height}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="2"
                      className="animate-pulse"
                    />
                    <text
                      x={left + 4}
                      y={top > 18 ? top - 4 : top + 14}
                      fill="#FFFFFF"
                      fontSize="10"
                      fontWeight="900"
                      className="bg-red-500 font-sans tracking-wide select-none"
                      style={{
                        paintOrder: "stroke",
                        stroke: "#000000",
                        strokeWidth: "2.5px",
                      }}
                    >
                      {(
                        box.label ||
                        log.waste_type ||
                        "SPECIMEN"
                      ).toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </>
        ) : (
          <div className="text-slate-500 font-bold text-xs uppercase tracking-widest">
            No Asset Image Available
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2 text-left">
        <h5 className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
          Telemetry Stream Context
        </h5>
        <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-600">
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase">
              Latitude Coordinate
            </span>
            <p className="text-slate-800 tracking-tight font-mono">
              {log.latitude?.toFixed(6) || "0.000000"}
            </p>
          </div>
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase">
              Longitude Coordinate
            </span>
            <p className="text-slate-800 tracking-tight font-mono">
              {log.longitude?.toFixed(6) || "0.000000"}
            </p>
          </div>
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase">
              Cluster Extent
            </span>
            <p className="text-slate-800 font-mono text-xs bg-blue-50 text-[#005D90] w-fit px-1.5 py-0.5 rounded border border-blue-100">
              {log.cluster_count || 1} Combined Items
            </p>
          </div>
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase">
              Inference Frame Bounds
            </span>
            <p className="text-slate-800">
              {normalizedBoxes.length} Objects Highlighted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
AssetTelemetryPreview.displayName = "AssetTelemetryPreview";

const WasteIcon = React.memo(({ type }: { type: string }) => {
  const baseClasses =
    "w-7 h-7 rounded-full border flex items-center justify-center p-1.5 shadow-xs transition-transform hover:scale-105";
  const normalized = type.toLowerCase();

  if (normalized.includes("plastic")) {
    return (
      <div
        className={`${baseClasses} border-blue-300 text-blue-600 bg-blue-50/60`}
        title="Plastic material"
      >
        <BottleWine size={14} />
      </div>
    );
  }
  if (normalized.includes("glass")) {
    return (
      <div
        className={`${baseClasses} border-purple-300 text-purple-600 bg-purple-50/60`}
        title="Glass item"
      >
        <Milk size={14} />
      </div>
    );
  }
  if (normalized.includes("metal")) {
    return (
      <div
        className={`${baseClasses} border-slate-400 text-slate-600 bg-slate-50/60`}
        title="Metal debris"
      >
        <Layers size={14} />
      </div>
    );
  }
  if (normalized.includes("composite_packaging")) {
    return (
      <div
        className={`${baseClasses} border-slate-400 text-slate-600 bg-slate-50/60`}
        title="Composite Packaging"
      >
        <BoxIcon size={14} />
      </div>
    );
  }
  // FIXED: Explicit handling mapping layout style for Styrofoam type structures
  if (normalized.includes("styrofoam")) {
    return (
      <div
        className={`${baseClasses} border-orange-300 text-orange-600 bg-orange-50/60`}
        title="Styrofoam material"
      >
        <Layers size={14} className="rotate-90 text-orange-500" />
      </div>
    );
  }
  return (
    <div
      className={`${baseClasses} border-emerald-300 text-emerald-600 bg-emerald-50/60`}
      title="Other / Bio material"
    >
      <ShoppingBag size={14} />
    </div>
  );
});
WasteIcon.displayName = "WasteIcon";

const LogRow = React.memo(
  ({
    log,
    isSelected,
    onSelect,
    areaName,
  }: {
    log: DetectionRow;
    isSelected: boolean;
    onSelect: (log: DetectionRow) => void;
    areaName: String;
  }) => {
    const parsedDate = useMemo(() => {
      try {
        const d = new Date(log.timestamp);
        return {
          date: d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          time: d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      } catch {
        return { date: "Unknown Date", time: "--:--" };
      }
    }, [log.timestamp]);

    const confidencePercentage = Math.round(
      log.confidence_score > 1
        ? log.confidence_score
        : log.confidence_score * 100,
    );

    return (
      <tr
        onClick={() => onSelect(log)}
        className={`group transition-colors cursor-pointer select-none ${
          isSelected ? "bg-blue-50/70 hover:bg-blue-50" : "hover:bg-slate-50/70"
        }`}
      >
        <td className="px-6 py-4">
          <p className="text-sm font-black text-slate-800">{parsedDate.date}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
            {parsedDate.time} PST
          </p>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-600">
            <MapPin size={13} className="text-[#005D90] shrink-0" />
            <span className="truncate max-w-[160px] uppercase">{areaName}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center justify-center gap-2">
            <WasteIcon type={log.waste_type} />
            {log.cluster_count && log.cluster_count > 1 && (
              <span
                className="bg-blue-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full shadow-xs tracking-wide flex items-center gap-0.5"
                title={`${log.cluster_count} detections collapsed at this coordinate`}
              >
                <Copy size={8} />x{log.cluster_count}
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden shrink-0">
              <div
                className="bg-[#005D90] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, confidencePercentage)}%` }}
              />
            </div>
            <span className="text-xs font-black text-[#005D90]">
              {confidencePercentage}%
            </span>
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <div
            className={`p-1.5 w-fit ml-auto rounded-lg transition-all group-hover:translate-x-0.5 ${
              isSelected
                ? "bg-[#005D90] text-white"
                : "text-blue-600 group-hover:bg-blue-50"
            }`}
          >
            <ArrowRight size={16} />
          </div>
        </td>
      </tr>
    );
  },
);
LogRow.displayName = "LogRow";

const HistoricalTrashLogs: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedAreaId, setSelectedAreaId] = useState("All");

  const [logs, setLogs] = useState<DetectionRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [activeSelectedLog, setActiveSelectedLog] =
    useState<DetectionRow | null>(null);

  const { areas } = useAreas();
  const RECORDS_PER_PAGE = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedType, selectedAreaId]);

  useEffect(() => {
    let active = true;
    const fetchDetections = async () => {
      setLoadingLogs(true);
      try {
        const params = new URLSearchParams({
          waste_type: selectedType,
          area_id: selectedAreaId,
        });

        const response = await api.get("/detections", { params });

        if (active && Array.isArray(response.data)) {
          const rawList: DetectionRow[] = response.data;
          setLogs(rawList);

          const total = rawList.length;
          setTotalRecords(total);
          setTotalPages(Math.max(1, Math.ceil(total / RECORDS_PER_PAGE)));

          if (rawList.length > 0) {
            setActiveSelectedLog(rawList[0]);
          } else {
            setActiveSelectedLog(null);
          }
        }
      } catch (err) {
        console.error("Telemetry link network handshake failure:", err);
      } finally {
        if (active) setLoadingLogs(false);
      }
    };

    fetchDetections();
    return () => {
      active = false;
    };
  }, [selectedType, selectedAreaId]);

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const cleanQuery = searchQuery.toLowerCase().trim();

    return logs.filter(
      (log) =>
        log.waste_type.toLowerCase().includes(cleanQuery) ||
        log.area?.area_name?.toLowerCase().includes(cleanQuery),
    );
  }, [logs, searchQuery]);

  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredLogs.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredLogs, currentPage, RECORDS_PER_PAGE]);

  const dynamicStats = useMemo(() => {
    if (filteredLogs.length === 0) return { topType: "CLEAR MATRIX" };

    const frequencies: Record<string, number> = {};
    let highestCount = 0;
    let topType = "NONE REGISTERED";

    for (let i = 0; i < filteredLogs.length; i++) {
      const type = filteredLogs[i].waste_type;
      frequencies[type] =
        (frequencies[type] || 0) + (filteredLogs[i].cluster_count || 1);

      if (frequencies[type] > highestCount) {
        highestCount = frequencies[type];
        topType = type;
      }
    }

    return { topType };
  }, [filteredLogs]);

  const handleSelectLedgerRow = useCallback((selectedRecord: DetectionRow) => {
    setActiveSelectedLog(selectedRecord);
  }, []);

  const handleResetWorkspace = useCallback(() => {
    setSelectedType("All");
    setSelectedAreaId("All");
    setSearchQuery("");
    setCurrentPage(1);
  }, []);

  const changePage = useCallback(
    (targetPage: number) => {
      if (targetPage >= 1 && targetPage <= totalPages) {
        setCurrentPage(targetPage);
      }
    },
    [totalPages],
  );

  const paginationRange = useMemo(() => {
    const maxVisiblePages = 3;
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(currentPage - 1, 1);
    let end = Math.min(start + maxVisiblePages - 1, totalPages);

    if (end === totalPages) {
      start = Math.max(end - maxVisiblePages + 1, 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  return (
    <div className="min-h-[100dvh] p-6 font-sans text-slate-700 bg-slate-50/30 max-w-[1600px] mx-auto space-y-6">
      <header className="flex justify-between items-end border-b border-slate-100 pb-4">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#004a7c] tracking-tight uppercase">
            Historical Flight Logs
          </h3>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
            Spatial Intelligence Storage Registry
          </p>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="grow bg-[#fcfcfc] rounded-2xl p-5 flex flex-col gap-4 shadow-xs border border-slate-200/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-50 text-[#005D90] rounded-md text-[10px] font-black tracking-widest uppercase">
              <Filter size={11} /> FILTER SEARCH MATRIX
            </div>
            {(selectedType !== "All" ||
              selectedAreaId !== "All" ||
              searchQuery !== "") && (
              <button
                onClick={handleResetWorkspace}
                className="text-[10px] font-black text-red-500 hover:text-red-700 tracking-wider uppercase transition-colors cursor-pointer"
              >
                Clear Variables
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5">
                Classification
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100/70 transition-all cursor-pointer"
              >
                <option value="All">All Categories</option>
                <option value="composite_packaging">Composite Packaging</option>
                <option value="glass">Glass</option>
                <option value="metal">Metal</option>
                <option value="plastic">Plastic</option>
                <option value="styrofoam">Styrofoam</option>
              </select>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5">
                Spatial Zone
              </label>
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100/70 transition-all cursor-pointer"
              >
                <option value="All">All Regions</option>
                {areas?.map((a: any) => (
                  <option key={a.area_id || a.id} value={a.area_id || a.id}>
                    {a.area_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5">
                Instant Page Search
              </label>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Search items on this page..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100/70"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-72 bg-[#005D90] rounded-2xl p-5 text-white shadow-md flex flex-col justify-between relative overflow-hidden group shrink-0">
          <div className="absolute right-[-10px] top-[-10px] text-white/5 pointer-events-none transition-transform group-hover:scale-110 duration-700">
            <Layers size={130} />
          </div>
          <div className="text-left z-10">
            <p className="text-[9px] font-black opacity-60 tracking-widest mb-0.5">
              PAGE TOP SPECIMEN
            </p>
            <h4 className="text-xl font-black uppercase tracking-tight truncate max-w-[220px]">
              {dynamicStats.topType.replace("_", " ")}
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black bg-white/10 w-fit px-2 py-1 rounded-md mt-4 tracking-wider uppercase z-10">
            <Info size={11} /> Page Offset Active
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className={`bg-[#fcfcfc] rounded-2xl shadow-xs border border-slate-200 overflow-hidden transition-all duration-300 ${
            activeSelectedLog ? "lg:col-span-7" : "lg:col-span-12"
          }`}
        >
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-[#fcfcfc]">
            <h4 className="text-md font-black text-slate-800 uppercase tracking-tight">
              Active Audit Ledger
            </h4>
            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border border-emerald-100/60">
              {totalRecords} Active Cluster Nodes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/70 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Temporal Info
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Spatial Sector
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                    Class
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Confidence
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                    Inspect
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                        <RotateCw
                          size={20}
                          className="animate-spin text-[#005D90]"
                        />
                        <span className="text-xs font-black uppercase tracking-widest">
                          Querying Paginated Blocks...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-20 text-center font-bold text-slate-400 italic"
                    >
                      No logged occurrences found matching current pagination
                      profile.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => {
                    const match = areas?.find(
                      (a: any) => (a.area_id || a.id) === log.area_id,
                    );
                    const resolvedAreaName =
                      log.area?.area_name ||
                      match?.area_name ||
                      "Unassigned Sector Coordinates";

                    return (
                      <LogRow
                        key={log.detection_id}
                        log={log}
                        areaName={resolvedAreaName}
                        isSelected={
                          activeSelectedLog?.detection_id === log.detection_id
                        }
                        onSelect={handleSelectLedgerRow}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row gap-4 justify-between items-center font-bold text-xs text-slate-500">
            <div>
              Page{" "}
              <span className="text-slate-800 font-black">{currentPage}</span>{" "}
              of <span className="text-slate-800 font-black">{totalPages}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage === 1 || loadingLogs}
                className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer flex items-center justify-center"
              >
                <ChevronLeft size={14} />
              </button>

              {paginationRange.map((pageNumber) => (
                <button
                  key={pageNumber}
                  onClick={() => changePage(pageNumber)}
                  disabled={loadingLogs}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] transition-all cursor-pointer ${
                    currentPage === pageNumber
                      ? "bg-[#005D90] border-[#005D90] text-white font-black"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                onClick={() => changePage(currentPage + 1)}
                disabled={currentPage === totalPages || loadingLogs}
                className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer flex items-center justify-center"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {activeSelectedLog && (
          <div className="col-span-1 lg:col-span-5 lg:sticky lg:top-6 bg-[#fcfcfc] rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="text-left">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                  Telemetry Frame Inspector
                </h4>
                <p className="text-[9px] font-bold text-slate-400 tracking-wider uppercase mt-0.5">
                  ID: {activeSelectedLog.detection_id?.toString().slice(0, 8)}
                  ...
                </p>
              </div>
              <button
                onClick={() => setActiveSelectedLog(null)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="Dismiss Panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <AssetTelemetryPreview log={activeSelectedLog} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoricalTrashLogs;