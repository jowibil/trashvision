import { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";
import { useAreas } from "../services/hooks/useAreas";
import { useReports } from "../services/hooks/useReports";
import { generateMockDroneData } from "../types/mockWasteData";
import { useMapControl } from "../services/hooks/useMapControl";
import { Calendar, X } from "lucide-react";
import { useHexbinData } from "../services/hooks/useHexbins";
import { SectorDrawer } from "../components/ui/aside";
import { MapOverlays } from "../components/ui/mapOverlays";
import L from "leaflet";

const mockData = generateMockDroneData();

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

export default function Maps() {
  const [week, setWeek] = useState(4);
  const { reportGeoJSON } = useReports("verified");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [targetCoords, setTargetCoords] = useState<[number, number] | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { areas } = useAreas();
  const [isOpen, setIsOpen] = useState(false);
  const [currentArea, setCurrentArea] = useState<any>(null);
  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem("mapThreshold");
    return saved ? parseInt(saved) : 2;
  });
  const searchRef = useRef<HTMLDivElement>(null);
  const hexbins = useHexbinData(
    mockData,
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
          reporter: feature.properties.reporter
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
            zoom={15}
            className="h-full w-full z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
                pathOptions={{
                  pane: "overlayPane",
                  color: "#005D90",
                  weight: 3,
                  fillOpacity: 0.2,
                }}
              />
            )}
            {hexbins && (
              <GeoJSON
                key={`drone-hex-${week}-${threshold}-${currentArea?.area_id}`}
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
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="h-56 relative bg-slate-200">
              <img
                src={selectedItem.image}
                className="w-full h-full object-cover"
                alt="waste"
              />
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 bg-white/20 p-2 rounded-full backdrop-blur-md text-white hover:bg-white/40"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 text-left">
              <h3 className="text-xl font-black text-slate-800 uppercase pb-2">
                {selectedItem.type}
              </h3>
              <p className="text-xs text-slate-500 font-bold pb-2">
                Reported by: <span className="text-slate-800">{selectedItem.reporter || "Anonymous"}</span>
              </p>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-full py-3 bg-[#005D90] text-white rounded-xl font-black uppercase text-xs"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
