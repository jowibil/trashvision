import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
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
import { BoxIcon } from "lucide-react";
import { X } from "lucide-react";
import { Copy } from "lucide-react";
import { FileDown } from "lucide-react";
import { useAreas } from "../services/hooks/useAreas";
import type { Area } from "../services/hooks/useAreas";
import type { DetectionRow, BoundingBox } from "../types/types";
import api from "../api/axios";
import toast from "react-hot-toast";

const RECORDS_PER_PAGE = 15;
const SEARCH_DEBOUNCE_MS = 300;
// The backend caps limit at 1000 (Query le=1000) — that cap doubles as the
// export's hard ceiling so the unpaginated export can't run away.
const EXPORT_HARD_CAP = 1000;

// The viewer's real timezone — the previous hardcoded "PST" label lied for
// anyone outside Pacific time since dates render in local time.
const LOCAL_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";

/** Null-safe waste type label: underscores → spaces everywhere. */
const formatWasteTypeLabel = (type?: string | null): string =>
  (type ?? "unknown").replace(/_/g, " ");

/**
 * Confidence as a 0–100 integer. `new Date`-style footgun: a missing score
 * previously produced NaN% — guard it, and clamp both ends.
 */
const formatConfidence = (value?: number): number => {
  if (value == null || !Number.isFinite(value)) return 0;
  const pct = value > 1 ? value : value * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
};

/** Abort/cancel detection so superseded requests never touch state. */
const isAbortError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return (
    e?.code === "ERR_CANCELED" ||
    e?.name === "CanceledError" ||
    e?.name === "AbortError"
  );
};

/** One bounding box from either {xmin..} objects or [x1,y1,x2,y2] arrays. */
const asBox = (entry: unknown): BoundingBox | null => {
  if (entry == null) return null;
  if (Array.isArray(entry)) {
    const [x1, y1, x2, y2] = entry as unknown[];
    if ([x1, y1, x2, y2].some((v) => v == null)) return null;
    return {
      xmin: Number(x1),
      ymin: Number(y1),
      xmax: Number(x2),
      ymax: Number(y2),
    };
  }
  if (typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    if (o.xmin == null || o.ymin == null || o.xmax == null || o.ymax == null)
      return null;
    return {
      xmin: Number(o.xmin),
      ymin: Number(o.ymin),
      xmax: Number(o.xmax),
      ymax: Number(o.ymax),
      label: typeof o.label === "string" ? o.label : undefined,
    };
  }
  return null;
};

// Preset periods for the date filter; resolved at fetch time and applied
// server-side via date_from so the query stays bounded (see GET /detections).
const PERIOD_OPTIONS = [
  { value: "All", label: "All time", days: null },
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "365", label: "Last 12 months", days: 365 },
];

/**
 * Inspector image + boxes. The SVG uses the image's native pixel space as
 * its viewBox with `preserveAspectRatio="xMidYMid meet"`, stacked on the
 * `object-contain` image: both elements letterbox identically, so boxes stay
 * glued to the objects across resize/panel-width changes with zero manual
 * scaling (the old clientWidth-based scales broke on resize and were stale
 * across selections).
 */
const DetectionPreview = React.memo(({ log }: { log: DetectionRow }) => {
  const normalizedBoxes = useMemo<BoundingBox[]>(() => {
    // Backend sends boxes under several shapes; accept them all, skip
    // malformed/null entries instead of throwing on box.xmin.
    const source = log.detections ?? log.bounding_boxes ?? log.boxes;
    let list: unknown = source;
    if (typeof source === "string") {
      try {
        list = JSON.parse(source);
      } catch (e) {
        console.error("Failed to parse bounding_boxes JSON:", e);
        list = null;
      }
    }
    const boxes = (Array.isArray(list) ? list : [])
      .map(asBox)
      .filter((b): b is BoundingBox => b !== null);

    if (
      boxes.length === 0 &&
      log.bbox_x1 != null &&
      log.bbox_y1 != null &&
      log.bbox_x2 != null &&
      log.bbox_y2 != null
    ) {
      return [
        {
          xmin: log.bbox_x1,
          ymin: log.bbox_y1,
          xmax: log.bbox_x2,
          ymax: log.bbox_y2,
          label: log.waste_type,
        },
      ];
    }
    return boxes;
  }, [log]);

  const nativeWidth = log.image_width || 640;
  const nativeHeight = log.image_height || 640;

  return (
    <div className="space-y-4">
      <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 flex items-center justify-center min-h-60">
        {log.image_url ? (
          <>
            <img
              src={log.image_url}
              alt={`Aerial capture showing detected ${formatWasteTypeLabel(
                log.waste_type,
              )}`}
              className="w-full h-auto max-h-100 object-contain select-none"
              loading="lazy"
            />
            {normalizedBoxes.length > 0 && (
              <svg
                className="absolute inset-0 h-full w-full pointer-events-none"
                viewBox={`0 0 ${nativeWidth} ${nativeHeight}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
              >
                {normalizedBoxes.map((box, idx) => {
                  const left = box.xmin;
                  const top = box.ymin;
                  const width = Math.max(0, box.xmax - box.xmin);
                  const height = Math.max(0, box.ymax - box.ymin);
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
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={left + 4}
                        y={top > 18 ? top - 4 : top + 14}
                        fill="#FFFFFF"
                        fontSize="12"
                        fontWeight="900"
                        className="font-sans tracking-wide select-none"
                        style={{
                          paintOrder: "stroke",
                          stroke: "#000000",
                          strokeWidth: "2.5px",
                        }}
                      >
                        {formatWasteTypeLabel(
                          box.label || log.waste_type,
                        ).toUpperCase()}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </>
        ) : (
          <div className="text-slate-500 font-bold text-xs uppercase tracking-widest">
            No image available for this detection
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl space-y-2 text-left">
        <h5 className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
          Detection details
        </h5>
        <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-600">
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase tracking-widest">
              Latitude
            </span>
            <p className="text-slate-800 tracking-tight font-mono tabular-nums">
              {log.latitude?.toFixed(6) ?? "0.000000"}
            </p>
          </div>
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase tracking-widest">
              Longitude
            </span>
            <p className="text-slate-800 tracking-tight font-mono tabular-nums">
              {log.longitude?.toFixed(6) ?? "0.000000"}
            </p>
          </div>
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase tracking-widest">
              Items
            </span>
            <p className="text-slate-800 font-mono tabular-nums text-xs bg-blue-50 w-fit px-1.5 py-0.5 rounded border border-blue-100">
              {log.cluster_count ?? 1}
            </p>
          </div>
          <div>
            <span className="block text-[9px] text-slate-400 font-black uppercase tracking-widest">
              Boxes shown
            </span>
            <p className="text-slate-800 tabular-nums">
              {normalizedBoxes.length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
DetectionPreview.displayName = "DetectionPreview";

const WasteIcon = React.memo(({ type }: { type?: string | null }) => {
  const baseClasses =
    "w-7 h-7 rounded-full border flex items-center justify-center p-1.5 shrink-0";
  const normalized = (type ?? "").toLowerCase();

  if (normalized.includes("plastic")) {
    return (
      <div
        className={`${baseClasses} border-slate-300 text-slate-600 bg-slate-100`}
        title="Plastic"
      >
        <BottleWine size={14} aria-hidden="true" />
      </div>
    );
  }
  if (normalized.includes("glass")) {
    return (
      <div
        className={`${baseClasses} border-slate-300 text-slate-600 bg-slate-100`}
        title="Glass"
      >
        <Milk size={14} aria-hidden="true" />
      </div>
    );
  }
  if (normalized.includes("metal")) {
    return (
      <div
        className={`${baseClasses} border-slate-300 text-slate-600 bg-slate-100`}
        title="Metal"
      >
        <Layers size={14} aria-hidden="true" />
      </div>
    );
  }
  if (normalized.includes("composite")) {
    return (
      <div
        className={`${baseClasses} border-slate-300 text-slate-600 bg-slate-100`}
        title="Composite packaging"
      >
        <BoxIcon size={14} aria-hidden="true" />
      </div>
    );
  }
  if (normalized.includes("styrofoam")) {
    return (
      <div
        className={`${baseClasses} border-slate-300 text-slate-600 bg-slate-100`}
        title="Styrofoam"
      >
        <Layers size={14} className="rotate-90" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div
      className={`${baseClasses} border-slate-300 text-slate-600 bg-slate-100`}
      title="Other / organic"
    >
      <ShoppingBag size={14} aria-hidden="true" />
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
    areaName: string;
  }) => {
    const parsedDate = useMemo(() => {
      // `new Date` never throws on bad input — it returns Invalid Date, so
      // the old try/catch never fired. Check the timestamp instead.
      const d = new Date(log.timestamp);
      if (isNaN(d.getTime())) return null;
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
    }, [log.timestamp]);

    const confidencePercentage = formatConfidence(log.confidence_score);

    return (
      <tr
        onClick={() => onSelect(log)}
        className={`group transition-colors cursor-pointer select-none hover:bg-slate-50/70 ${
          isSelected ? "bg-blue-50/70 hover:bg-blue-50" : ""
        }`}
      >
        <td className="px-6 py-4 align-middle">
          <p className="text-sm font-bold text-slate-800 tabular-nums whitespace-nowrap">
            {parsedDate?.date ?? "Unknown date"}
          </p>
          <p
            className="text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap"
            title={`Rendered in your timezone (${LOCAL_TIME_ZONE})`}
          >
            {parsedDate?.time ?? "--:--"}
          </p>
        </td>
        <td className="px-6 py-4 align-middle">
          <div className="flex items-center gap-2 font-medium text-xs text-slate-600">
            <MapPin
              size={13}
              className="text-[#005D90] shrink-0"
              aria-hidden="true"
            />
            <span className="truncate max-w-40">{areaName}</span>
          </div>
        </td>
        <td className="px-6 py-4 align-middle">
          <div className="flex items-center justify-center gap-2">
            <WasteIcon type={log.waste_type} />
            {(log.cluster_count ?? 0) > 1 && (
              <span
                className="bg-blue-50 text-[#005D90] font-bold text-[9px] px-1.5 py-0.5 rounded-full border border-blue-100 tabular-nums flex items-center gap-0.5"
                title={`${log.cluster_count} detections collapsed at this coordinate`}
              >
                <Copy size={8} aria-hidden="true" />×{log.cluster_count}
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4 align-middle">
          <div className="flex items-center gap-3">
            <div
              className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden shrink-0"
              role="meter"
              aria-valuenow={confidencePercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Model confidence ${confidencePercentage}%`}
            >
              <div
                className="bg-[#005D90] h-full rounded-full"
                style={{ width: `${confidencePercentage}%` }}
              />
            </div>
            <span className="text-xs font-bold text-[#005D90] tabular-nums">
              {confidencePercentage}%
            </span>
          </div>
        </td>
        <td className="px-6 py-4 align-middle text-right">
          {/* The single tab stop per row (the row itself is not focusable —
              aria-expanded isn't valid on a <tr> and nested tab stops made
              keyboard order confusing). aria-pressed mirrors the toggle. */}
          <button
            type="button"
            aria-label={`Inspect log from ${
              parsedDate?.date ?? "unknown date"
            } (${formatWasteTypeLabel(log.waste_type)})`}
            aria-pressed={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(log);
            }}
            className={`p-1.5 w-fit ml-auto rounded-lg transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none ${
              isSelected
                ? "bg-[#005D90] text-white"
                : "text-[#005D90] group-hover:bg-blue-50"
            }`}
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </td>
      </tr>
    );
  },
);
LogRow.displayName = "LogRow";

const HistoricalTrashLogs: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedAreaId, setSelectedAreaId] = useState("All");
  const [selectedPeriod, setSelectedPeriod] = useState("All");

  const [logs, setLogs] = useState<DetectionRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  // Derived from the server's `total` so the pager can never disagree with it.
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // True while the Excel export refetches the filtered result set.
  const [isExporting, setIsExporting] = useState(false);
  // Bumped by the retry button; re-runs the fetch without changing filters.
  const [retryTick, setRetryTick] = useState(0);

  const [activeSelectedLog, setActiveSelectedLog] =
    useState<DetectionRow | null>(null);

  const { areas } = useAreas();

  // Debounced search: typed value updates instantly (input feels live),
  // the query fires 300ms after typing stops. Page reset + selection clear
  // ride along in the same batched update so a search change costs exactly
  // one fetch, not two.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
      setActiveSelectedLog(null);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchDetections = async () => {
      setLoadingLogs(true);
      setLoadFailed(false);
      try {
        // Server-side offset/limit pagination is the single source of truth;
        // "All" filters are omitted rather than sent as literal strings.
        const params = new URLSearchParams({
          limit: String(RECORDS_PER_PAGE),
          offset: String((currentPage - 1) * RECORDS_PER_PAGE),
        });
        if (selectedType !== "All") params.set("waste_type", selectedType);
        if (selectedAreaId !== "All") params.set("area_id", selectedAreaId);
        if (debouncedSearch) params.set("q", debouncedSearch);

        const days = PERIOD_OPTIONS.find(
          (p) => p.value === selectedPeriod,
        )?.days;
        if (days) {
          params.set(
            "date_from",
            new Date(Date.now() - days * 86_400_000).toISOString(),
          );
        }

        const response = await api.get("/detections", {
          params,
          signal: controller.signal,
        });

        // Validate once at the boundary; a malformed payload becomes empty
        // data instead of setLogs(undefined) crashing the render.
        const payload = response.data as { items?: unknown; total?: unknown };
        const items = Array.isArray(payload.items)
          ? (payload.items as DetectionRow[])
          : [];
        const total = Number.isFinite(Number(payload.total))
          ? Number(payload.total)
          : items.length;

        setLogs(items);
        setTotalRecords(total);
        setTotalPages(Math.max(1, Math.ceil(total / RECORDS_PER_PAGE)));
        setLoadingLogs(false);
      } catch (err) {
        // A superseded request was aborted by the cleanup — never touch
        // state from a stale closure.
        if (isAbortError(err)) return;
        // Clear previous rows so a failed later page/filter can't leave the
        // old result set silently on screen under the new filters.
        setLogs([]);
        setTotalRecords(0);
        setLoadFailed(true);
        setLoadingLogs(false);
        console.error("Failed to load detections:", err);
      }
    };

    fetchDetections();
    return () => controller.abort();
  }, [currentPage, debouncedSearch, selectedType, selectedAreaId, selectedPeriod, retryTick]);

  // Rows can vanish between page views (deletes, tighter filters elsewhere);
  // an out-of-range page clamps back instead of rendering an empty table.
  // Guarded on totalRecords so an error state (total 0) can't trigger a
  // refetch loop.
  useEffect(() => {
    if (totalRecords > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, totalRecords]);

  // "Most detected" is tallied from the rows currently on screen (one page).
  // Labelled as such — the all-pages number lives server-side.
  const topTypeOnPage = useMemo(() => {
    const frequencies: Record<string, number> = {};
    let highestCount = 0;
    let topType: string | null = null;
    for (const log of logs) {
      const type = log.waste_type || "unknown";
      const weight = log.cluster_count ?? 1;
      frequencies[type] = (frequencies[type] || 0) + weight;
      if (frequencies[type] > highestCount) {
        highestCount = frequencies[type];
        topType = type;
      }
    }
    return topType;
  }, [logs]);

  // Shared filter params for the table query and the export so the xlsx
  // always matches what the screen shows.
  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedType !== "All") params.set("waste_type", selectedType);
    if (selectedAreaId !== "All") params.set("area_id", selectedAreaId);
    if (debouncedSearch) params.set("q", debouncedSearch);
    const days = PERIOD_OPTIONS.find((p) => p.value === selectedPeriod)?.days;
    if (days) {
      params.set(
        "date_from",
        new Date(Date.now() - days * 86_400_000).toISOString(),
      );
    }
    return params;
  }, [selectedType, selectedAreaId, selectedPeriod, debouncedSearch]);

  const handleSelectRow = useCallback((selectedRecord: DetectionRow) => {
    setActiveSelectedLog(selectedRecord);
  }, []);

  const handleTypeChange = useCallback((value: string) => {
    setSelectedType(value);
    setCurrentPage(1);
    setActiveSelectedLog(null);
  }, []);

  const handleAreaChange = useCallback((value: string) => {
    setSelectedAreaId(value);
    setCurrentPage(1);
    setActiveSelectedLog(null);
  }, []);

  const handlePeriodChange = useCallback((value: string) => {
    setSelectedPeriod(value);
    setCurrentPage(1);
    setActiveSelectedLog(null);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSelectedType("All");
    setSelectedAreaId("All");
    setSelectedPeriod("All");
    // Flush the debounce immediately — no 300ms wait after "Clear filters",
    // and no retry-tick hack that could orphan an in-flight request.
    setSearchInput("");
    setDebouncedSearch("");
    setCurrentPage(1);
    setActiveSelectedLog(null);
    setLoadFailed(false);
  }, []);

  const changePage = useCallback(
    (targetPage: number) => {
      if (targetPage >= 1 && targetPage <= totalPages) {
        setCurrentPage(targetPage);
        // The inspector shouldn't keep showing a row that isn't in the table.
        setActiveSelectedLog(null);
      }
    },
    [totalPages],
  );

  // Exports every row matching the active filters, all pages: same params as
  // the table (including q), capped at the backend's page-size maximum.
  const handleExportExcel = useCallback(async () => {
    setIsExporting(true);
    try {
      // Lazy chunk stays inside the try: a failed import is a handled error
      // with a toast, not an unhandled rejection.
      const { exportTrashLogsExcel } = await import(
        "../services/exportTrashLogsExcel"
      );

      const params = buildFilterParams();
      params.set("limit", String(EXPORT_HARD_CAP));
      const response = await api.get("/detections", { params });

      const rows = Array.isArray(response.data?.items)
        ? (response.data.items as DetectionRow[])
        : [];

      await exportTrashLogsExcel(rows, {
        filters: {
          type: selectedType,
          area: selectedAreaId,
          search: debouncedSearch,
        },
        areaNameResolver: (areaId?: string) =>
          areas?.find((a: Area) => String(a.area_id) === String(areaId))
            ?.area_name || "Unassigned sector",
      });
    } catch (err) {
      console.error("Excel export failed:", err);
      toast.error("Couldn't generate the Excel file. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [buildFilterParams, selectedType, selectedAreaId, debouncedSearch, areas]);

  const paginationRange = useMemo(() => {
    const maxVisiblePages = 3;
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(currentPage - 1, 1);
    const end = Math.min(start + maxVisiblePages - 1, totalPages);

    if (end === totalPages) {
      start = Math.max(end - maxVisiblePages + 1, 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  const hasActiveFilters =
    selectedType !== "All" ||
    selectedAreaId !== "All" ||
    selectedPeriod !== "All" ||
    searchInput !== "";

  const resolveAreaName = useCallback(
    (log: DetectionRow): string =>
      log.area?.area_name ||
      areas?.find((a: Area) => String(a.area_id) === String(log.area_id))
        ?.area_name ||
      "Unassigned sector",
    [areas],
  );

  return (
    <div className="min-h-dvh p-6 font-sans text-slate-700 bg-slate-50/30 max-w-400 mx-auto space-y-6">
      <header className="flex justify-between items-end border-b border-slate-100 pb-4">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight">
            Historical flight logs
          </h3>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Detections from automated drone flights, with model confidence.
          </p>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="grow bg-[#fcfcfc] rounded-2xl p-5 flex flex-col gap-4 shadow-xs border border-slate-200/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-50 text-[#005D90] rounded-md text-[10px] font-black tracking-widest uppercase">
              <Filter size={11} aria-hidden="true" /> Filters
            </div>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="text-[10px] font-black text-slate-500 hover:text-slate-800 tracking-wider uppercase transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5 text-left">
              <label
                htmlFor="filter-period"
                className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5"
              >
                Period
              </label>
              <select
                id="filter-period"
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100/70 focus-visible:ring-2 focus-visible:ring-[#005D90]/30 transition-all duration-150 ease-out cursor-pointer"
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 text-left">
              <label
                htmlFor="filter-type"
                className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5"
              >
                Classification
              </label>
              <select
                id="filter-type"
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100/70 focus-visible:ring-2 focus-visible:ring-[#005D90]/30 transition-all duration-150 ease-out cursor-pointer"
              >
                <option value="All">All categories</option>
                <option value="composite_packaging">Composite packaging</option>
                <option value="glass">Glass</option>
                <option value="metal">Metal</option>
                <option value="plastic">Plastic</option>
                <option value="styrofoam">Styrofoam</option>
              </select>
            </div>

            <div className="space-y-1.5 text-left">
              <label
                htmlFor="filter-area"
                className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5"
              >
                Area
              </label>
              <select
                id="filter-area"
                value={selectedAreaId}
                onChange={(e) => handleAreaChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100/70 focus-visible:ring-2 focus-visible:ring-[#005D90]/30 transition-all duration-150 ease-out cursor-pointer"
              >
                <option value="All">All areas</option>
                {areas?.map((a: Area) => (
                  <option key={a.area_id} value={a.area_id}>
                    {a.area_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 text-left">
              <label
                htmlFor="filter-search"
                className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5"
              >
                Search
              </label>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="filter-search"
                  type="text"
                  placeholder="Search type or area"
                  aria-label="Search detections by type or area"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100/70 focus-visible:ring-2 focus-visible:ring-[#005D90]/30"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-72 bg-[#005D90] rounded-2xl p-5 text-white shadow-md flex flex-col justify-between shrink-0">
          <div className="text-left">
            <p className="text-[9px] font-black opacity-60 tracking-widest mb-0.5 uppercase">
              Most detected on this page
            </p>
            <h4 className="text-xl font-black capitalize tracking-tight truncate">
              {topTypeOnPage
                ? formatWasteTypeLabel(topTypeOnPage)
                : "No detections"}
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black bg-white/10 w-fit px-2 py-1 rounded-md mt-4 tracking-wider uppercase z-10">
            <Info size={11} aria-hidden="true" /> {totalRecords} detections
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className={`bg-[#fcfcfc] rounded-2xl shadow-xs border border-slate-200 overflow-hidden ${
            activeSelectedLog ? "lg:col-span-7" : "lg:col-span-12"
          }`}
          aria-busy={loadingLogs || isExporting}
        >
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-[#fcfcfc] gap-3">
            <h4 className="text-md font-black text-slate-800 uppercase tracking-tight">
              Detections
            </h4>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportExcel}
                disabled={loadingLogs || isExporting || totalRecords === 0}
                aria-busy={isExporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-black text-[#005D90] uppercase tracking-wider hover:bg-blue-50 hover:border-blue-100 transition-colors duration-150 ease-out cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                title="Export filtered logs to Excel (.xlsx)"
              >
                <FileDown size={13} aria-hidden="true" /> Export Excel
              </button>
              <span
                className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-[10px] font-black tabular-nums border border-slate-200/60"
                aria-live="polite"
              >
                {totalRecords} records
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/70 border-b border-slate-100">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                  >
                    Area
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                  >
                    Confidence
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right"
                  >
                    <span className="sr-only">Inspect</span>
                  </th>
                </tr>
              </thead>
              <tbody
                className={`divide-y divide-slate-100/70 ${
                  loadingLogs && logs.length > 0 ? "opacity-50" : "opacity-100"
                }`}
              >
                {loadFailed ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <p className="font-bold text-slate-500">
                        Couldn't load detections
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Check your connection and try again.
                      </p>
                      <button
                        type="button"
                        onClick={() => setRetryTick((t) => t + 1)}
                        className="mt-5 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-widest bg-[#005D90] text-white transition-transform duration-150 ease-out active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                      >
                        Try again
                      </button>
                    </td>
                  </tr>
                ) : loadingLogs && logs.length === 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} aria-hidden="true">
                      <td className="px-6 py-4" colSpan={5}>
                        <div className="flex items-center gap-6">
                          <div className="h-3.5 w-24 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                          <div className="h-3.5 w-32 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                          <div className="h-7 w-7 rounded-full bg-slate-100 animate-pulse motion-reduce:animate-none" />
                          <div className="h-1.5 w-20 rounded-full bg-slate-100 animate-pulse motion-reduce:animate-none" />
                          <div className="h-6 w-6 rounded-lg bg-slate-100 animate-pulse ml-auto motion-reduce:animate-none" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : totalRecords === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <p className="font-bold text-slate-500">
                        No detections match the current filters.
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Try a longer period or clear the filters.
                      </p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <LogRow
                      key={log.detection_id}
                      log={log}
                      areaName={resolveAreaName(log)}
                      isSelected={
                        activeSelectedLog?.detection_id === log.detection_id
                      }
                      onSelect={handleSelectRow}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row gap-4 justify-between items-center font-bold text-xs text-slate-500">
            <div className="tabular-nums">
              {totalRecords > 0 ? (
                <>
                  Page{" "}
                  <span className="text-slate-800 font-black tabular-nums">
                    {currentPage}
                  </span>{" "}
                  of{" "}
                  <span className="text-slate-800 font-black tabular-nums">
                    {totalPages}
                  </span>
                </>
              ) : (
                "No records"
              )}
            </div>

            {/* Pager renders only once there is something to page through. */}
            {totalRecords > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => changePage(currentPage - 1)}
                  disabled={currentPage === 1 || loadingLogs}
                  aria-label="Previous page"
                  className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white transition-colors duration-150 ease-out cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                </button>

                {paginationRange.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    onClick={() => changePage(pageNumber)}
                    disabled={loadingLogs}
                    aria-current={
                      currentPage === pageNumber ? "page" : undefined
                    }
                    aria-label={`Page ${pageNumber}`}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none ${
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
                  aria-label="Next page"
                  className="p-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white transition-colors duration-150 ease-out cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                >
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        {activeSelectedLog && (
          <div className="col-span-1 lg:col-span-5 lg:sticky lg:top-6 bg-[#fcfcfc] rounded-2xl border border-slate-200 shadow-sm overflow-hidden opacity-100 translate-x-0 transition-[opacity,translate] duration-200 ease-out starting:opacity-0 starting:translate-x-2 motion-reduce:transition-none">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="text-left">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                  Detection inspector
                </h4>
                <p className="text-[9px] font-bold text-slate-400 tracking-wider uppercase mt-0.5 tabular-nums">
                  ID: {activeSelectedLog.detection_id?.toString().slice(0, 8)}
                  …
                </p>
              </div>
              <button
                onClick={() => setActiveSelectedLog(null)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                aria-label="Close detection inspector"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5">
              {/* key: a fresh mount per selection — no state can leak across
                  different detections. */}
              <DetectionPreview
                key={activeSelectedLog.detection_id}
                log={activeSelectedLog}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoricalTrashLogs;
