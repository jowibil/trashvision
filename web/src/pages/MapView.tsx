import { useEffect, useMemo, useState, useRef } from "react";
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
import { useAreaCollection } from "../services/hooks/useAreasCollection";
import { useReports } from "../services/hooks/useReports";
import { generateMockDroneData } from "../types/mockWasteData";
import { useMapControl } from "../services/hooks/useMapControl";
import { Calendar, X, RefreshCw } from "lucide-react";
import { useHexbinData } from "../services/hooks/useHexbins";
import { SectorDrawer } from "../components/ui/aside";
import { MapOverlays } from "../components/ui/mapOverlays";
import L from "leaflet";

const mockData = generateMockDroneData();

function ZoomHandler({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom()),
  });
  return null;
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

const getDensityColor = (count: number) => {
  if (count > 10) return "#b91c1c";
  if (count > 5) return "#ea580c";
  if (count > 2) return "#eab308";
  return "#22c55e";
};
function ZoomTracker({ setZoom }: { setZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
    },
  });
  return null;
}
export default function Maps() {
  const { areas } = useAreas();
  const [week, setWeek] = useState(4);
  const searchRef = useRef<HTMLDivElement>(null);
  const { reportGeoJSON } = useReports("verified");
  const [isOpen, setIsOpen] = useState(false);
  const [currentArea, setCurrentArea] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [targetCoords, setTargetCoords] = useState<[number, number] | null>(
    null,
  );
  const [zoom, setZoom] = useState(15);
  const {
    collection: droneCollection,
    loading,
    refetch,
  } = useAreaCollection(currentArea?.area_id);
  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem("mapThreshold");
    return saved ? parseInt(saved) : 2;
  });
  const hexbins = useHexbinData(
    droneCollection,
    selectedDate,
    week,
    threshold,
    currentArea?.boundary,
  );

  useEffect(() => {
    if (areas.length > 0 && !currentArea) setCurrentArea(areas[0]);
  }, [areas]);

  const onEachHex = (feature: any, layer: any) => {
    layer.on({
      click: (e: any) => {
        setSelectedSector(feature);
        setDrawerOpen(true);
        if (currentArea) setSelectedAreaId(currentArea.area_id);

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

  const areaStatus = useMemo(() => {
    const totalInArea = mockData.length;
    if (totalInArea > 50)
      return { label: "CRITICAL", color: "text-red-600", bg: "bg-red-50" };
    if (totalInArea > 20)
      return { label: "HIGH", color: "text-orange-500", bg: "bg-orange-50" };
    return {
      label: "LOW SEVERITY",
      color: "text-green-500",
      bg: "bg-green-50",
    };
  }, [week]);

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

  return (
    <div className="h-screen w-full max-w-7xl flex flex-col overflow-hidden bg-white">
      <header className="h-16 border-b border-slate-100 flex items-center justify-between z-1001 px-8 sticky top-0 mt-5 bg-white">
        <div className="flex flex-col text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight">
            Waste Detection Map
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <p className="text-xs text-slate-500 font-black tracking-tight uppercase">
              Live Analysis
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
          className={`relative flex-1 m-4 rounded-3xl overflow-hidden border-4 border-[#005D90] transition-all duration-300 shadow-inner ${drawerOpen ? "mr-0 rounded-r-none border-r-0" : ""}`}
        >
          <MapContainer
            center={[7.288, 125.693]}
            zoom={14}
            className="h-full w-full z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ZoomTracker setZoom={setZoom} />
            <MapController targetCoords={targetCoords} />
            <MapResizer isDrawerOpen={drawerOpen} />
            <ZoomHandler onZoomChange={setZoom} />
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
                pathOptions={{
                  pane: "overlayPane",
                  color: "#005D90",
                  weight: 3,
                  fillOpacity: 0.2,
                }}
              />
            )}
            {zoom < 18 && hexbins && (
              <GeoJSON
                key={`drone-hex-${week}-${threshold}-${currentArea?.area_id}-${droneCollection.length}`}
                data={hexbins as any}
                onEachFeature={onEachHex}
                pathOptions={{ pane: "tilePane" }}
                style={(f) => {
                  const count = f?.properties?.pointIds?.length || 0;
                  return {
                    fillColor: getDensityColor(count),
                    weight: 1,
                    color: "#ffffff",
                    fillOpacity: 0.6,
                    dashArray: "0",
                  };
                }}
              />
            )}
            {zoom > 17 &&
              droneCollection.map((img) => (
                <CircleMarker
                  key={img.image_id}
                  center={[img.latitude, img.longitude]}
                  radius={8}
                  pathOptions={{
                    fillColor: img.file_url ? "#ef4444" : "#94a3b8",
                    color: "#fff",
                    weight: 2,
                    fillOpacity: 1,
                  }}
                  eventHandlers={{
                    click: (e) => {
                      setSelectedItem({
                        id: img.image_id,
                        type: "Drone Detection",
                        image: img.file_url,
                        description: `Captured during flight on ${img.flight_date || "N/A"}`,
                        reporter: "Autonomous Drone",
                        detections: [
                          { label: "Plastic Bottle", confidence: 0.94 },
                          { label: "Paper Waste", confidence: 0.82 },
                        ],
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
                pointToLayer={(_feature, latlng) => {
                  return L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: "#3b82f6",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8,
                  });
                }}
              />
            )}
          </MapContainer>
          <div className="absolute top-4 left-20 z-1000">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#005D90] rounded-full shadow-lg hover:bg-slate-50 active:scale-95 transition-all"
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
          </div>
          <MapOverlays
            week={week}
            setWeek={setWeek}
            threshold={threshold}
            setThreshold={setThreshold}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            drawerOpen={drawerOpen}
          />
        </div>

        <SectorDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          selectedSector={selectedSector}
          areaStatus={areaStatus}
          onItemSelect={setSelectedItem}
        />
      </main>

      <footer className="flex flex-row justify-between items-stretch gap-4 p-4 w-full z-1003">
        <div className="bg-[#005D90] p-4 rounded-2xl flex-[1.5] relative">
          <div className="flex items-center justify-between mb-2 border-b border-blue-400/30 pb-2">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-black text-blue-200 uppercase tracking-widest">
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
              value={searchQuery}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-blue-900/40 text-white text-xs p-2.5 rounded-xl border border-blue-400/20 focus:outline-none focus:border-blue-400 placeholder:text-white/80"
            />
            {isOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-48 overflow-y-auto z-2000 text-left">
                {filteredAreas.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400 text-center">
                    No areas found
                  </div>
                ) : (
                  filteredAreas.map((area) => (
                    <button
                      key={area.area_id}
                      onClick={() => {
                        handleAreaSelect(area);
                      }}
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

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex-2 flex items-center justify-evenly">
          {/* Legend logic... kept as per your design */}
          <div className="text-left">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-1">
              Density Legend
            </h3>
            <p className="text-xs font-bold text-slate-500 uppercase">
              Detection Count
            </p>
          </div>
          <div className="flex items-center gap-4">
            {[
              { label: "Low", color: "bg-[#22c55e]", desc: "1-3" },
              { label: "Mid", color: "bg-[#eab308]", desc: "4-8" },
              { label: "High", color: "bg-[#ea580c]", desc: "9-15" },
              { label: "Crit", color: "bg-[#b91c1c]", desc: "16+" },
              { label: "Verified", color: "bg-[#3b82f6]", desc: "Community" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div
                    className={`w-2.5 h-2.5 ${item.color} rounded-sm rotate-45 shadow-sm`}
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

      {/* DETAIL MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 z-3000 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-4xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100">
            {/* Image Section */}
            <div className="relative h-64 bg-slate-100 group">
              {selectedItem?.image ? (
                <a href={selectedItem.image} target="_blank" rel="noreferrer">
                  <img
                    src={selectedItem.image}
                    className="w-full h-full object-cover cursor-zoom-in transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white font-bold text-xs bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md">
                      Click to expand
                    </span>
                  </div>
                </a>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="animate-spin h-6 w-6 border-2 border-[#005D90] border-t-transparent rounded-full mb-2" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Processing Image
                  </span>
                </div>
              )}
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 bg-white p-2 rounded-full shadow-lg text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Info Section */}
            <div className="p-8 text-left">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-black text-[#005D90] uppercase tracking-tight leading-none">
                    {selectedItem.type}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
                    Source: {selectedItem.reporter}
                  </p>
                </div>
                {selectedItem.detections?.length > 0 && (
                  <div className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-black border border-red-100">
                    AI VERIFIED
                  </div>
                )}
              </div>

              {/* AI Detections List */}
              {selectedItem.detections?.length > 0 ? (
                <div className="space-y-2 mb-6">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Detected Objects
                  </p>
                  {selectedItem.detections.map((det: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100"
                    >
                      <span className="text-sm font-bold text-slate-700">
                        {det.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${det.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 w-8">
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  {selectedItem.description ||
                    "No further details provided for this detection point."}
                </p>
              )}

              <button
                onClick={() => setSelectedItem(null)}
                className="w-full py-4 bg-[#005D90] text-white rounded-2xl font-black uppercase text-sm shadow-lg shadow-blue-900/20 hover:bg-[#004a73] transition-all active:scale-[0.98]"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
