// web/src/components/ui/aside.tsx
import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";

// Direct path imports instead of the lucide-react barrel export.
import { X } from "lucide-react";
import { Shield } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { CheckCircle } from "lucide-react";
import { Search } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Layers } from "lucide-react";

import { getCciColor } from "../../services/hooks/useHexbins";
import type { HexbinProperties } from "../../types/types";
import type { SectorDetection } from "../../services/hooks/useAreaHexbins";

interface SectorFeature {
  properties: HexbinProperties;
}

interface StatusBadge {
  label: string;
  /** Survey-wide detections + polygon size, shown above the CCI verdict (MapView footer chip). */
  primary?: string;
  /** One-line CCI verdict, e.g. "● CCI 0.35 · VERY LOW". */
  secondary?: string;
  style: CSSProperties;
}

interface SelectedDetection {
  id: string;
  type: string;
  image: string;
  reporter: string;
  description: string;
  detections: {
    label: string;
    /** Optional: real confidences only. No fake fallback — genuinely missing
     * values render "–", not a made-up score (design §6.3). */
    confidence?: number;
    bbox: [number, number, number, number];
  }[];
}

interface SectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSector: SectorFeature | null;
  areaStatus?: StatusBadge;
  /** On-demand details for the selected sector's detection ids (server hexbins carry ids only). */
  sectorDetections?: SectorDetection[];
  onItemSelect: (detection: SelectedDetection) => void;
}

const FALLBACK_STATUS_STYLE: CSSProperties = {
  backgroundColor: "#f8fafc",
  color: "#334155",
  borderColor: "#f1f5f9",
};

// Cards visible in an expanded waste-type group before "Show more".
const GROUP_PAGE_SIZE = 4;

// Skeleton cap: with grouped accordion sections a handful of pulsing
// placeholders is plenty.
const SKELETON_CARD_COUNT = 4;

/** Loading placeholder shaped exactly like a DetectionCard (Tailwind pulse). */
const SkeletonCard = memo(function SkeletonCard() {
  return (
    <div className="w-full bg-slate-100 rounded-2xl overflow-hidden animate-pulse">
      <div className="h-32 w-full bg-slate-200" />
      <div className="p-3 flex justify-between items-center">
        <div className="h-2.5 w-28 rounded bg-slate-200" />
        <div className="h-3.5 w-3.5 rounded-full bg-slate-200" />
      </div>
    </div>
  );
});

interface DetectionCardProps {
  id: string;
  imgUrl?: string;
  wasteType: string;
  /** Genuinely missing scores render "–" — never a fake fallback number
   * (design §6.3; the old `?? 0.85` invented 85% confidences). */
  confidence?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  onItemSelect: (detection: SelectedDetection) => void;
}

/** One detection row in the drawer: shimmer-while-loading thumbnail, then a
 * fade-in; a local slate fallback on error (the old via.placeholder.com
 * onError pointed at a dead service and rendered a broken-image icon). */
const DetectionCard = memo(function DetectionCard({
  id,
  imgUrl,
  wasteType,
  confidence,
  x1,
  y1,
  x2,
  y2,
  onItemSelect,
}: DetectionCardProps) {
  const [imgState, setImgState] = useState<"loading" | "ok" | "error">(
    imgUrl ? "loading" : "error",
  );

  // Reset when the drawer is reused for a different sector/image.
  useEffect(() => {
    setImgState(imgUrl ? "loading" : "error");
  }, [imgUrl]);

  return (
    <button
      type="button"
      onClick={() =>
        onItemSelect({
          id,
          type: wasteType,
          image: imgUrl ?? "",
          reporter: "YOLOv8",
          description:
            "Automated aerial tracking identification finalized with coordinate markers.",
          detections: [
            {
              label: wasteType,
              confidence,
              bbox: [x1, y1, x2, y2],
            },
          ],
        })
      }
      className="group w-full cursor-pointer bg-slate-100 rounded-2xl overflow-hidden hover:border-blue-400 border border-transparent transition-all text-left"
    >
      <div className="h-32 w-full overflow-hidden relative bg-slate-200">
        {imgUrl && imgState !== "error" ? (
          <>
            <img
              src={imgUrl}
              alt="Detection preview"
              onLoad={() => setImgState("ok")}
              onError={() => setImgState("error")}
              className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-300 ${
                imgState === "ok" ? "opacity-100" : "opacity-0"
              }`}
            />
            {imgState === "loading" && (
              <div className="absolute inset-0 animate-pulse bg-slate-200" />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-[10px] text-slate-400 font-bold">
            Image Unavailable
          </div>
        )}
        <div className="absolute top-2 right-2 bg-[#005D90]/80 px-2 py-1 rounded text-[10px] font-black text-white uppercase">
          {confidence != null && Number.isFinite(confidence
          )
            ? `${Math.round(confidence * 100)}% Conf.`
            : "–"}
        </div>
      </div>

      <div className="p-3 flex justify-between items-center">
        <span className="text-[11px] font-black text-slate-800 uppercase">{wasteType}</span>
        <CheckCircle size={14} className="text-slate-300 group-hover:text-green-500" />
      </div>
    </button>
  );
});

interface ResolvedDetection {
  id: string;
  wasteType: string;
  detail?: SectorDetection;
  fallbackIndex: number;
}

interface WasteGroup {
  wasteType: string;
  items: ResolvedDetection[];
}

/** Number of initially-visible cards per group, keyed by group name. */
type VisibleCounts = Record<string, number>;

// Ordering contract for the summary chip strip AND the accordion groups, so
// counts, chips and groups always tell the same story: worst (most frequent)
// type first, alphabetical tiebreak. Using the SAME comparator for the
// server counts dict and the grouped details keeps them aligned even when a
// cached payload or a detail entry is missing.
function compareGroups(a: { name: string; count: number }, b: { name: string; count: number }) {
  if (b.count !== a.count) return b.count - a.count;
  return a.name.localeCompare(b.name);
}

export const SectorDrawer = memo(function SectorDrawer({
  isOpen,
  onClose,
  selectedSector,
  areaStatus,
  sectorDetections,
  onItemSelect,
}: SectorDrawerProps) {
  const sectorCategory = selectedSector?.properties?.pollution_category;
  const sectorColor = getCciColor(sectorCategory);

  const activeStatus: StatusBadge | undefined = sectorCategory
    ? {
        label: sectorCategory.toUpperCase(),
        style: {
          color: sectorColor,
          backgroundColor: `${sectorColor}1A`,
          borderColor: `${sectorColor}40`,
        },
      }
    : areaStatus;

  // Summary strip source: the server tile's per-type counts (available the
  // instant the hex is clicked — no batch round-trip). Sorted worst-first;
  // ties alphabetical, the same order the groups render in.
  const typeCounts = useMemo(() => {
    const raw = selectedSector?.properties?.type_counts;
    if (!raw) return null;
    return (Object.entries(raw) as [string, number][])
      .map(([name, count]) => ({ name, count: Number(count) }))
      .sort(compareGroups);
  }, [selectedSector?.properties?.type_counts]);

  // Group the sector's detections per waste type. Every pointId becomes
  // exactly one item (type from its batch detail, falling back to the
  // legacy per-index property arrays the old flat list used), so group item
  // totals can never disagree with the chip strip about how many detections
  // live in this hex.
  const groups = useMemo<WasteGroup[]>(() => {
    if (sectorDetections === undefined) return [];
    const pointIds = selectedSector?.properties?.pointIds ?? [];
    const byId = new Map(
      (sectorDetections ?? []).map((d) => [d.detection_id, d] as const),
    );
    const props = selectedSector?.properties;
    const grouped = new Map<string, ResolvedDetection[]>();
    pointIds.forEach((id, index) => {
      const detail = byId.get(id);
      const wasteType =
        detail?.type ?? props?.types?.[index] ?? "Unclassified Waste";
      const list = grouped.get(wasteType) ?? [];
      list.push({ id, wasteType, detail, fallbackIndex: index });
      grouped.set(wasteType, list);
    });
    return Array.from(grouped.entries())
      .map(([name, items]) => ({ wasteType: name, items }))
      .sort(
        (a, b) =>
          compareGroups(
            { name: a.wasteType, count: a.items.length },
            { name: b.wasteType, count: b.items.length },
          ),
      );
  }, [sectorDetections, selectedSector]);

  // Accordion state: every group starts COLLAPSED (brief decision — the old
  // flat list was an unbounded scroll) and an expanded group reveals
  // GROUP_PAGE_SIZE cards with a "Show more" pill for the rest. State is
  // keyed by group name and reset whenever the drawer's sector changes.
  const pointIdsKey = (selectedSector?.properties?.pointIds ?? []).join(",");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [visibleCounts, setVisibleCounts] = useState<VisibleCounts>({});
  useEffect(() => {
    setOpenGroups({});
    setVisibleCounts({});
  }, [pointIdsKey]);

  return (
    <aside
      className={`bg-[#fcfcfc] border-l border-zinc-900/10 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[1002] flex flex-col transition-transform duration-300 transform w-full sm:w-96 ${
        // Mobile: always an off-canvas full-width overlay (a static 384px
        // flex child would overflow a 320px viewport). sm+: docks beside
        // the map, shrinking it via MapView's mr-0 handling.
        isOpen
          ? "translate-x-0 absolute inset-y-0 right-0 sm:relative"
          : "translate-x-full absolute right-0 h-full"
      }`}
    >
      {selectedSector ? (
        <>
          {/* Header Section */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex justify-between items-start mb-4">
              <div className="text-left">
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                  Sector Analysis
                </h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {selectedSector.properties.pointIds.length} Detections
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
                aria-label="Close sector drawer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Status Badges */}
            <div className="flex gap-2">
              <div className="flex-1 bg-blue-50 p-3 rounded-xl border border-blue-100 text-left">
                <p className="text-xs font-black text-blue-400 uppercase pb-2">Validation</p>
                <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                  <Shield size={12} /> AI VERIFIED
                </div>
              </div>

              {/* Dynamic Severity Box */}
              <div
                className="flex-1 p-3 rounded-xl border text-left font-bold"
                style={activeStatus?.style ?? FALLBACK_STATUS_STYLE}
              >
                <p className="text-xs font-black uppercase pb-2 opacity-70">Severity</p>
                <div className="flex items-center gap-1.5 text-xs">
                  <AlertTriangle size={12} /> {activeStatus?.label ?? "VERY LOW"}
                </div>
              </div>
            </div>

            {/* Algorithm note (brief Task 2 #1): the hexagon counts come from
                the pipeline's 2-stage DBSCAN dedup, not raw YOLO output. */}
            <p className="pt-3 text-[10px] font-medium text-slate-400 leading-relaxed">
              Counts are DBSCAN-deduplicated detections — overlapping YOLO boxes of the same
              object are merged before they reach this sector.
            </p>
          </div>

          {/* SUMMARY STRIP — per-type counts render instantly from the server
              tile's type_counts, before any thumbnail/batch fetch resolves. */}
          {typeCounts && typeCounts.length > 0 && (
            <div className="px-6 pt-4">
              <div className="flex flex-wrap gap-1.5">
                {typeCounts.map(({ name, count }) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1 text-[10px] font-black text-slate-600 uppercase tracking-wide"
                  >
                    {name.replace(/_/g, " ")}
                    <span className="text-[#005D90] tabular-nums">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {sectorDetections === undefined ? (
              // Details request still in flight: skeletons shaped like the
              // real cards (never fallback junk that pops into thumbnails).
              // MapView resolves failed batches to [] so this can't stick.
              Array.from(
                { length: Math.min(SKELETON_CARD_COUNT, selectedSector.properties.pointIds.length || 1) },
                (_, i) => <SkeletonCard key={`skeleton-${i}`} />,
              )
            ) : (
              <>
                {groups.map((group) => {
                  const visible = visibleCounts[group.wasteType] ?? GROUP_PAGE_SIZE;
                  const isOpenGroup = openGroups[group.wasteType] ?? false;
                  return (
                    <section
                      key={group.wasteType}
                      className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((prev) => ({
                            ...prev,
                            [group.wasteType]: !isOpenGroup,
                          }))
                        }
                        aria-expanded={isOpenGroup}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="flex items-center gap-2 text-[11px] font-black text-slate-800 uppercase tracking-wide">
                          <Layers size={13} className="text-[#005D90]" />
                          {group.wasteType.replace(/_/g, " ")}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="bg-blue-50 text-[#005D90] rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums">
                            {group.items.length}
                          </span>
                          <ChevronDown
                            size={14}
                            className={`text-slate-400 transition-transform duration-200 ${
                              isOpenGroup ? "" : "-rotate-90"
                            }`}
                          />
                        </span>
                      </button>

                      {isOpenGroup && (
                        <div className="px-3 pb-3 space-y-2">
                          {/* Collapsed-by-default groups reveal their first
                              GROUP_PAGE_SIZE cards on expand ("Show more"
                              loads the rest — no unbounded listing). */}
                          {group.items.slice(0, visible).map((item) => {
                            const detail = item.detail;
                            const props = selectedSector.properties;
                            const idx = item.fallbackIndex;
                            return (
                              <DetectionCard
                                key={item.id}
                                id={item.id}
                                imgUrl={detail?.file_url ?? props.images?.[idx]}
                                wasteType={item.wasteType}
                                confidence={
                                  detail?.confidence ??
                                  props.confidence_scores?.[idx]
                                }
                                x1={detail?.bbox[0] ?? props.x1s?.[idx] ?? 0}
                                y1={detail?.bbox[1] ?? props.y1s?.[idx] ?? 0}
                                x2={detail?.bbox[2] ?? props.x2s?.[idx] ?? 0}
                                y2={detail?.bbox[3] ?? props.y2s?.[idx] ?? 0}
                                onItemSelect={onItemSelect}
                              />
                            );
                          })}

                          {group.items.length > visible && (
                            <button
                              type="button"
                              onClick={() =>
                                setVisibleCounts((prev) => ({
                                  ...prev,
                                  [group.wasteType]: visible + GROUP_PAGE_SIZE,
                                }))
                              }
                              className="w-full text-center text-[11px] font-black text-[#005D90] uppercase tracking-widest py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              Show more ({group.items.length - visible})
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}

                {groups.length === 0 && (
                  <p className="text-center text-xs text-slate-400 font-bold uppercase tracking-widest py-6">
                    No detections in this sector.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-50">
          <Search size={32} className="text-slate-300 mb-4" />
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Select a grid sector</p>
        </div>
      )}
    </aside>
  );
});
