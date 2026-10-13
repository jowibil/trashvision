import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  CircleMarker,
  useMapEvents,
} from "react-leaflet";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";
import { useAreas } from "../services/hooks/useAreas";
import { useLazyAreaCollection, type CollectionWindow } from "../services/hooks/useAreasCollection";
import { useAreaHexbins, type SectorDetection } from "../services/hooks/useAreaHexbins";
import { useReports } from "../services/hooks/useReports";
import { useMapControl } from "../services/hooks/useMapControl";
import { Calendar } from "lucide-react";
import { X } from "lucide-react";
import { RefreshCcw as RefreshCw} from "lucide-react";
import { Maximize2 } from "lucide-react";
import { classifyCci, hexbinTilesToFeatureCollection, DRONE_K_FACTOR } from "../services/hooks/useHexbins";
import api from "../api/axios";
import { SectorDrawer } from "../components/ui/aside";
import { MapOverlays } from "../components/ui/mapOverlays";
import L from "leaflet";
import type { PollutionCategory } from "../types/types";

// Hoisted: static legend data, previously rebuilt as a fresh array literal
// on every render inside the footer JSX.
const CCI_LEGEND_ITEMS = [
  { label: "Very low", category: "Very low", desc: "≤ 2" },
  { label: "Low", category: "Low", desc: "2 - 5" },
  { label: "Moderate", category: "Moderate", desc: "5 - 10" },
  { label: "High", category: "High", desc: "10 - 20" },
  { label: "Very high", category: "Very high", desc: "> 20" },
] as const;

export const getCciColor = (category?: PollutionCategory | string): string => {
  switch (category) {
    case "Very low":
      return "#10b981"; // Em Green
    case "Low":
      return "#3b82f6"; // Blue
    case "Moderate":
      return "#f59e0b"; // Yellow
    case "High":
      return "#f97316"; // Orange
    case "Very high":
      return "#ef4444"; // Red
    default:
      return "#94a3b8"; // Slate Gray
  }
};
/**
 * Detection preview: the raw drone frame with every YOLO bounding box drawn
 * on top. Boxes live in one SVG whose viewBox is the image's native pixel
 * space with `preserveAspectRatio="xMidYMid meet"` — the same letterboxing
 * the `object-contain` img applies — so they stay glued to the objects at
 * any rendered size, with no clientWidth scaling state to keep fresh (the
 * old approach drifted on resize). Click still exports the annotated frame
 * via canvas (unchanged).
 */
function ImageWithBoundingBoxes({
  imageUrl,
  detections,
}: {
  imageUrl: string;
  detections: any[];
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Native pixel size, read once on load: the SVG viewBox needs it. Purely
  // view state — no scaling math survives.
  const [nativeSize, setNativeSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const openInferenceInNewTab = () => {
    const baseImg = imgRef.current;
    if (!baseImg || !baseImg.naturalWidth) return;

    // 1. Initialize a dynamic workspace canvas matched to the raw source dimensions
    const canvas = document.createElement("canvas");
    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 2. Lay down the base clean drone flight photograph
    ctx.drawImage(baseImg, 0, 0);

    // 3. Draw every bounding box matching its exact database absolute coordinate vectors
    detections.forEach((det) => {
      if (!det.bbox || det.bbox[0] === undefined) return;
      const [x1, y1, x2, y2] = det.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      // Draw the Bounding Box Outline
      ctx.strokeStyle = "#EF4444"; // Production Red
      ctx.lineWidth = Math.max(4, baseImg.naturalWidth * 0.003);
      ctx.strokeRect(x1, y1, width, height);

      ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
      ctx.fillRect(x1, y1, width, height);

      // Draw the Label Badge
      const text = `${det.label.toUpperCase().replace("_", " ")} ${Math.round((det.confidence > 1 ? det.confidence / 100 : det.confidence) * 100)}%`;
      const fontSize = 24;
      ctx.font = `bold ${fontSize}px sans-serif`;

      const textWidth = ctx.measureText(text).width;
      const padding = fontSize * 0.4;

      ctx.fillStyle = "#EF4444";
      ctx.fillRect(
        x1 - 2,
        y1 - fontSize - padding,
        textWidth + padding * 2,
        fontSize + padding,
      );

      ctx.fillStyle = "#FFFFFF";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x1 + padding - 2, y1 - fontSize / 2 - padding / 2);
    });

    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`
          <html>
            <head>
              <title>TrashVision Specimen Export</title>
              <style>
                body { margin: 0; background: #0b0f19; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
                img { max-width: 100%; max-height: 100vh; object-contain: contain; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
              </style>
            </head>
            <body>
              <img src="${dataUrl}" alt="YOLOv8 Complete Frame Output" />
            </body>
          </html>
        `);
        newTab.document.close();
      }
    } catch (err) {
      console.error(
        "Canvas export blocked by cross-origin security configurations:",
        err,
      );
      // Fallback in case of CORS security protection blocks canvas context extraction
      window.open(imageUrl, "_blank");
    }
  };

  return (
    <div
      onClick={openInferenceInNewTab}
      className="relative w-full max-h-95 overflow-hidden rounded-2xl bg-slate-950 flex items-center justify-center border border-slate-200 cursor-zoom-in group select-none"
    >
      <img
        ref={(el) => {
          imgRef.current = el;
          // Cached images can finish loading before React attaches onLoad;
          // recover the native size here so boxes never stay hidden.
          if (el?.complete && el.naturalWidth) {
            setNativeSize(
              (prev) => prev ?? { w: el.naturalWidth, h: el.naturalHeight },
            );
          }
        }}
        src={imageUrl}
        crossOrigin="anonymous"
        onLoad={(e) =>
          setNativeSize({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          })
        }
        className="w-full h-auto object-contain max-h-95 group-hover:opacity-90 transition-opacity"
        alt="Inference Canvas"
      />

      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 bg-slate-900/90 backdrop-blur-xs text-white px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-opacity flex items-center gap-1.5 pointer-events-none shadow-md">
        <Maximize2 size={11} /> Open image in new tab
      </div>

      {/* Same-letterbox overlay: viewBox = native pixels, so x/y map 1:1 to
          the model's coordinate space at any rendered size, and
          non-scaling-stroke keeps borders 2px on screen. */}
      {nativeSize && detections.length > 0 && (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox={`0 0 ${nativeSize.w} ${nativeSize.h}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {detections.map((det, idx) => {
            if (!det.bbox || det.bbox[0] === undefined) return null;
            const [x1, y1, x2, y2] = det.bbox;
            const width = Math.max(0, x2 - x1);
            const height = Math.max(0, y2 - y1);

            return (
              <g key={idx}>
                <rect
                  x={x1}
                  y={y1}
                  width={width}
                  height={height}
                  fill="rgba(239, 68, 68, 0.1)"
                  stroke="#EF4444"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={x1 + 5}
                  y={y1 > 14 ? y1 - 4 : y1 + 12}
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="900"
                  className="font-sans uppercase tracking-tight select-none"
                  style={{
                    paintOrder: "stroke",
                    stroke: "#000000",
                    strokeWidth: "2.5px",
                  }}
                >
                  {(det.label || "waste").replace(/_/g, " ")}{" "}
                  {Math.round(
                    ((det.confidence ?? 0) > 1
                      ? det.confidence / 100
                      : det.confidence ?? 0) * 100,
                  )}
                  %
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function MapResizer({ isDrawerOpen }: { isDrawerOpen: boolean }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 300);
  }, [isDrawerOpen, map]);
  return null;
}

function MapController({
  targetCoords,
}: {
  targetCoords: [number, number] | null;
}) {
  const { flyToLocation } = useMapControl();
  useEffect(() => {
    if (targetCoords) {
      flyToLocation(targetCoords[0], targetCoords[1]);
    }
  }, [targetCoords, flyToLocation]);
  return null;
}

function ZoomTracker({ setZoom }: { setZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });
  return null;
}

export default function Maps() {
  const { areas } = useAreas();
  const [map, setMap] = useState<L.Map | null>(null);
  const [week, setWeek] = useState(4);
  const searchRef = useRef<HTMLDivElement>(null);
  const { reportGeoJSON } = useReports("verified");
  const [isOpen, setIsOpen] = useState(false);
  const [currentArea, setCurrentArea] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  // Window mode for the hexbin + pin queries. "month" = the reporting view
  // (per-month, week chips apply); "accumulated" = Jan 1 → end of the
  // selected month (carry-over view, week chips hidden). Product decision
  // 2026-10: per-month is the default on load.
  const [viewMode, setViewMode] = useState<"month" | "accumulated">("month");
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [activePin, setActivePin] = useState<string[] | null>(null);
  const [targetCoords, setTargetCoords] = useState<[number, number] | null>(
    null,
  );
  const [zoom, setZoom] = useState(15);

  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem("mapThreshold");
    return saved ? parseInt(saved) : 2;
  });

  // Perf (Heavy Lifter migration): hexbins are aggregated server-side by
  // PostGIS; the web client no longer downloads every raw detection just to
  // turf-hexbin it in the browser. One small payload per settled filter.
  const {
    tiles: hexTiles,
    totalDetections,
    latestDetectionAt,
    loading,
    isStale,
    refetch,
  } = useAreaHexbins(currentArea?.area_id, selectedDate, week, threshold, viewMode);

  // Bootstrap the date filter to the most recent flight data for the area.
  useEffect(() => {
    if (!latestDetectionAt) return;
    const flightDate = new Date(latestDetectionAt);
    if (!isNaN(flightDate.getTime())) {
      setSelectedDate(flightDate);
    }
  }, [latestDetectionAt]);

  // Modal a11y: Escape closes, focus moves to the close button on open and
  // returns to the previously focused element on close. No focus trap —
  // the map must stay reachable (Operate mode, not a blocking wizard).
  const modalPanelRef = useRef<HTMLDivElement | null>(null);
  const modalCloseRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedItem) return;
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    modalCloseRef.current?.focus();
    return () => {
      lastFocusedElementRef.current?.focus?.();
    };
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedItem(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItem]);

  const closeDetectionModal = useCallback(() => setSelectedItem(null), []);

  // PostGIS tiles → Leaflet FeatureCollection (CCI math stays client-side).
  const hexbins = useMemo(
    () => hexbinTilesToFeatureCollection(hexTiles, currentArea?.boundary),
    [hexTiles, currentArea?.boundary],
  );

  // Raw points are only needed for the zoom>=18 pin layer — fetch lazily on
  // first close zoom, cached per area for the session.
  const rawCollection = useLazyAreaCollection(currentArea?.area_id, zoom >= 18, {
    month: selectedDate.getMonth() + 1,
    year: selectedDate.getFullYear(),
    week,
    mode: viewMode,
  } as CollectionWindow);

  // Per-sector drawer details, resolved on demand when a hex is clicked.
  const [selectedHexId, setSelectedHexId] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, SectorDetection[]>>({});
  const batchDetailsRef = useRef<Record<string, SectorDetection[]>>({});
  const batchInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (areas.length > 0 && !currentArea) setCurrentArea(areas[0]);
  }, [areas]);

  const onEachHex = (feature: any, layer: any) => {
    layer.on({
      click: (e: any) => {
        setSelectedSector(feature);
        setDrawerOpen(true);

        const pinsInHex = feature.properties.pointIds || [];
        setActivePin(pinsInHex.length > 0 ? pinsInHex : null);

        // Resolve the sector's detections on demand (thumbnail, type,
        // confidence, bbox) instead of embedding them in every hexbin.
        const hexKey = [...pinsInHex].sort().join(",");
        setSelectedHexId(pinsInHex.length > 0 ? hexKey : null);
        if (
          pinsInHex.length > 0 &&
          currentArea &&
          !batchDetailsRef.current[hexKey] &&
          !batchInFlight.current.has(hexKey)
        ) {
          batchInFlight.current.add(hexKey);
          api
            .post(`/flights/areas/${currentArea.area_id}/images/batch`, {
              detection_ids: pinsInHex,
            })
            .then((res) => {
              const details: SectorDetection[] = ((res.data || []) as any[]).map(
                (r) => ({
                  detection_id: r.detection_id,
                  file_url: r.file_url ?? null,
                  type: r.type ?? null,
                  confidence: Number(r.detections?.[0]?.confidence ?? 0),
                  bbox: (r.detections?.[0]?.box_2d ?? [0, 0, 0, 0]) as [
                    number,
                    number,
                    number,
                    number,
                  ],
                }),
              );
              batchDetailsRef.current = {
                ...batchDetailsRef.current,
                [hexKey]: details,
              };
              setBatchDetails(batchDetailsRef.current);
            })
            .catch((err) => {
              console.error("Sector details fetch error", err);
              // Resolve to empty so the drawer renders its fallback cards
              // instead of skeletons that would never clear (a network
              // error must not read as eternal loading).
              batchDetailsRef.current = {
                ...batchDetailsRef.current,
                [hexKey]: [],
              };
              setBatchDetails(batchDetailsRef.current);
            })
            .finally(() => batchInFlight.current.delete(hexKey));
        }

        const center = turf.center(feature);
        const [lng, lat] = center.geometry.coordinates;
        e.target._map.setView([lat, lng], 18);
      },
    });
  };

  const filteredAreas = useMemo(() => {
    return areas.filter((area) =>
      area.area_name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [areas, searchQuery]);

  const areaMetrics = useMemo(() => {
    if (!currentArea?.boundary) {
      return { totalAreaM2: 0, overallDensity: 0, overallCci: 0, category: "Very Clean" as PollutionCategory };
    }

    // Total comes from the server aggregate over the SAME cumulative week
    // filter as the hexbins (the old code summed the unfiltered collection).
    const totalAreaM2 = turf.area(currentArea.boundary);
    const overallDensity = totalAreaM2 > 0 ? totalDetections / totalAreaM2 : 0;
    const overallCci = overallDensity * DRONE_K_FACTOR;

    return {
      totalAreaM2,
      totalAreaKm2: (totalAreaM2 / 1_000_000).toFixed(2),
      overallDensity,
      overallCci,
      category: classifyCci(overallCci),
    };
  }, [currentArea, totalDetections]);

  const areaStatus = useMemo(() => {
  const category = areaMetrics.category; // Returns PollutionCategory
  const hexColor = getCciColor(category);

  return {
    label: category.toUpperCase(),
    color: hexColor,
    style: {
      color: hexColor,
      backgroundColor: `${hexColor}1A`, // 10% tint
      borderColor: `${hexColor}40`,     // 25% tint
    },
  };
}, [areaMetrics]);


  const handleAreaSelect = (area: any) => {
    setCurrentArea(area);
    setTargetCoords([area.center_latitude, area.center_longitude]);
    setIsOpen(false);
    setSearchQuery("");
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const onEachReport = (feature: any, layer: any) => {
    layer.on({
      click: (e: any) => {
        setSelectedItem({
          id: feature.properties.id,
          type: feature.properties.type,
          image: feature.properties.image,
          description: feature.properties.description,
          reporter: feature.properties.reporter,
          detections: [],
        });
        const { lat, lng } = e.latlng;
        e.target._map.setView([lat, lng], 19);
      },
    });
  };

  const visiblePins = useMemo(() => {
    const points = rawCollection ?? [];
    if (activePin) {
      return points.filter((img) =>
        activePin.includes(img.detection_id || img.image_id || ""),
      );
    }
    return points;
  }, [rawCollection, activePin]);

  return (
    <div className="h-dvh w-full max-w-7xl flex flex-col overflow-hidden bg-[#fcfcfc]">
      <header className="h-16 border-b border-slate-100 flex items-center justify-between z-1001 px-8 sticky top-0 mt-5 bg-[#fcfcfc]">
        <div className="flex flex-col text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight">
            Waste Detection Map
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <p className="text-xs text-slate-500 font-black tracking-tight uppercase">
              {" "}
              Live Analysis{" "}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-black">
            <Calendar size={14} strokeWidth={2.5} />
            <p className="text-sm font-bold uppercase tabular-nums">
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        <div
          className={`relative h-137.5 flex-1 m-4 rounded-3xl overflow-hidden border-4 border-[#005D90] transition-all duration-300 shadow-inner ${drawerOpen ? "mr-0 rounded-r-none border-r-0" : ""}`}
        >
          <MapContainer
            ref={setMap}
            center={[7.288, 125.693]}
            zoom={14}
            className="h-full w-full z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ZoomTracker setZoom={setZoom} />
            <MapController targetCoords={targetCoords} />
            <MapResizer isDrawerOpen={drawerOpen} />

            {currentArea && (
              <GeoJSON
                key={`boundary-${currentArea.area_id}`}
                data={currentArea.boundary}
                interactive={false}
                style={{
                  color: "#005D90",
                  weight: 2,
                  fillOpacity: 0.05,
                  dashArray: "5, 10",
                }}
              />
            )}

            {zoom < 18 && hexbins && (
              <GeoJSON
                key={`drone-hex-${week}-${threshold}-${currentArea?.area_id}-${selectedDate.getTime()}-${hexbins.features.length}`}
                data={hexbins as any}
                onEachFeature={onEachHex}
                style={(f) => {
                  const category = f?.properties?.pollution_category;
                  return {
                    fillColor: getCciColor(category),
                    weight: 1,
                    color: "#ffffff",
                    fillOpacity: 0.6,
                  };
                }}
              />
            )}

            {zoom > 17 &&
              visiblePins.map((img) => (
                <CircleMarker
                  key={img.detection_id || img.image_id}
                  center={[Number(img.latitude), Number(img.longitude)]}
                  radius={8}
                  pathOptions={{
                    fillColor: img.image_url ? "#ef4444" : "#94a3b8",
                    color: "#fff",
                    weight: 2,
                    fillOpacity: 1,
                  }}
                  eventHandlers={{
                    click: (e) => {
                      const targetUrl = img.image_url || img.file_url;
                      const siblingDetections = (rawCollection ?? [])
                        .filter(
                          (item) =>
                            item.image_url === targetUrl ||
                            item.file_url === targetUrl,
                        )
                        .map((item) => ({
                          label: String(item.waste_type || item.type || "waste"),
                          confidence:
                            item.confidence_score || item.confidence || 0.85,
                          bbox: [
                            item.bbox_x1,
                            item.bbox_y1,
                            item.bbox_x2,
                            item.bbox_y2,
                          ],
                        }));
                      const typeSummaryCounts: Record<string, number> = {};
                      siblingDetections.forEach((det) => {
                        typeSummaryCounts[det.label] =
                          (typeSummaryCounts[det.label] || 0) + 1;
                      });

                      const descriptionLedger = Object.entries(
                        typeSummaryCounts,
                      )
                        .map(
                          ([type, count]) =>
                            `${type.toUpperCase()}: ${count} item(s)`,
                        )
                        .join(", ");
                      setSelectedItem({
                        id: img.detection_id || img.image_id,
                        type: "Image Detection",
                        image: targetUrl,
                        description: `Image Details — [ ${descriptionLedger} ]. Coordinates: Lat ${Number(img.latitude).toFixed(5)}, Lng ${Number(img.longitude).toFixed(5)}.`,
                        reporter: "YOLOV8 Model",
                        detections: siblingDetections, // Passes all bounded items down to render concurrently
                      });

                      L.DomEvent.stopPropagation(e);
                    },
                  }}
                />
              ))}

            {reportGeoJSON && (
              <GeoJSON
                key={`reports-${reportGeoJSON.features.length}`}
                data={reportGeoJSON as any}
                onEachFeature={onEachReport}
                pointToLayer={(_f, latlng) =>
                  L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: "#3b82f6",
                    color: "#fff",
                    weight: 2,
                    fillOpacity: 0.8,
                  })
                }
              />
            )}
          </MapContainer>

          <div className="absolute top-4 left-20 z-1000 flex items-center gap-2">              <button
                type="button"
                onClick={() => refetch()}
                aria-label="Refresh detections for this area"
                className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#005D90] rounded-full shadow-lg hover:bg-slate-50 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90]"
              >
              {loading ? (
                <div className="animate-spin h-3 w-3 border-2 border-[#005D90] border-t-transparent rounded-full" />
              ) : (
                <RefreshCw size={14} className="text-[#005D90]" />
              )}
              <span className="text-[10px] font-black text-[#005D90] uppercase tracking-widest">
                Refresh Area
              </span>
            </button>
            {/* Offline-first: what's on screen came from the IndexedDB map
                cache and the background revalidation hasn't replaced it yet
                (or failed) — mirror of mobile's "showing cached data". */}
            {isStale && (
              <span className="px-3 py-2 bg-white/90 border-2 border-slate-200 rounded-full shadow text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Cached
              </span>
            )}
          </div>

          <MapOverlays
            week={week}
            setWeek={setWeek}
            threshold={threshold}
            setThreshold={setThreshold}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            drawerOpen={drawerOpen}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </div>

        <SectorDrawer
          isOpen={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setActivePin(null);
            if (map && currentArea) {
              map.setView(
                [currentArea.center_latitude, currentArea.center_longitude],
                16,
                { animate: true },
              );
            }
          }}
          selectedSector={selectedSector}
          areaStatus={areaStatus}
          sectorDetections={selectedHexId ? batchDetails[selectedHexId] : undefined}
          onItemSelect={setSelectedItem}
        />
      </main>

      {/* FOOTER LEGEND MATRIX */}
      <footer className="flex flex-row justify-between items-stretch gap-4 p-4 w-full z-1003">
        <div className="bg-[#005D90] p-4 rounded-2xl flex-[1.5] relative">
          <div className="flex items-center justify-between mb-2 border-b border-blue-400/30 pb-2">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-black text-blue-200 uppercase tracking-widest">
                {" "}
                Location
              </h3>
              <p className="text-xs font-bold text-white uppercase truncate max-w-50">
                {currentArea?.area_name || "Select Area"}
              </p>
            </div>
            <div
              className={`text-xs font-bold ${areaStatus.color} bg-white px-2 py-0.5 rounded-full`}
            >
              ● {areaStatus.label}
            </div>
          </div>
          <div className="relative" ref={searchRef}>
            <input
              type="text"
              placeholder="Search area..."
              aria-label="Search areas"
              value={searchQuery}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-blue-900/40 text-white text-xs p-2.5 rounded-xl border border-blue-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 placeholder:text-white/80"
            />
            {isOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#fcfcfc] rounded-xl shadow-2xl border border-slate-200 max-h-48 overflow-y-auto z-2000 text-left">
                {filteredAreas.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400 text-center">
                    No areas found
                  </div>
                ) : (
                  filteredAreas.map((area) => (
                    <button
                      key={area.area_id}
                      onClick={() => handleAreaSelect(area)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b last:border-0"
                    >
                      <p className="text-xs font-bold text-slate-800">
                        {area.area_name}
                      </p>
                      <p className="text-[8px] text-slate-400 uppercase">
                        {area.category}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#fcfcfc] border border-slate-200 p-4 rounded-2xl shadow-sm flex-2 flex items-center justify-evenly">
          <div className="text-left">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-1">
              Clean Coast Index
            </h3>
            <p className="text-xs font-bold text-slate-500 uppercase">
              Density-weighted severity scale
            </p>
          </div>
          <div className="flex items-center gap-4">
            {CCI_LEGEND_ITEMS.map((item) => (
              <div key={item.category} className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm rotate-45 shadow-sm"
                    style={{ backgroundColor: getCciColor(item.category) }}
                  />
                  <span className="text-xs font-black text-slate-700 uppercase">
                    {item.label}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </footer>

      {/* Detection details modal */}
      {selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detection details"
          onClick={closeDetectionModal}
          className="fixed inset-0 z-3000 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 opacity-100 transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none"
        >
          <div
            ref={modalPanelRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#fcfcfc] rounded-4xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 outline-none scale-100 transition-transform duration-200 ease-out starting:scale-[0.97] motion-reduce:transition-none"
          >
            <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
              <div className="text-left">
                <h3 className="text-xl font-black text-[#005D90] uppercase tracking-tight leading-none">
                  Detection details
                </h3>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">
                  ID: #{selectedItem.id?.substring(0, 8) || "N/A"}
                </p>
              </div>
              <button
                type="button"
                ref={modalCloseRef}
                onClick={closeDetectionModal}
                aria-label="Close detection details"
                className="bg-white p-2 rounded-full shadow border border-slate-200 text-slate-400 hover:bg-slate-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {selectedItem?.image ? (
                <ImageWithBoundingBoxes
                  key={selectedItem.image}
                  imageUrl={selectedItem.image}
                  detections={selectedItem.detections || []}
                />
              ) : (
                <div className="h-48 bg-slate-100 flex flex-col items-center justify-center rounded-2xl text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    No image available
                  </span>
                </div>
              )}

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Detection summary
                  </span>
                  <div className="bg-blue-50 text-[#005D90] px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                    {selectedItem.reporter}
                  </div>
                </div>
                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                  {selectedItem.type}
                </h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                  {selectedItem.description}
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setSelectedItem(null)}
                className="w-full py-4 bg-[#005D90] text-white rounded-2xl font-black uppercase text-sm shadow-md hover:bg-[#004a73] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}