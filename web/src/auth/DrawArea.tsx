import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import {
  Save,
  Target,
  Trash,
  Edit3,
  MapPin,
  ChevronDown,
  Layers,
} from "lucide-react";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import api from "../api/axios";
import { useMap } from "react-leaflet";
import { useAreas } from "../services/hooks/useAreas";
import { useMapControl } from "../services/hooks/useMapControl";

function MapController({ targetPos }: { targetPos: [number, number] | null }) {
  const { flyToLocation } = useMapControl();
  useEffect(() => {
    if (targetPos) flyToLocation(targetPos[0], targetPos[1]);
  }, [targetPos, flyToLocation]);
  return null;
}

export default function AreaDrawer() {
  const [activeArea, setActiveArea] = useState<any>(null);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [geoJson, setGeoJson] = useState<any>(null);
  const [areaName, setAreaName] = useState("");
  const [targetCoords, setTargetCoords] = useState<[number, number] | null>(
    null,
  );

  const dropdownRef = useRef<HTMLDivElement>(null);
  const { areas, refresh } = useAreas();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowListDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function GeomanControls({ setGeoJson }: any) {
    const map = useMap();

    useEffect(() => {
      map.pm.addControls({
        position: "topleft",
        drawCircle: false,
        drawMarker: false,
        drawPolyline: false,
      });

      const handleCreate = (val: any) => {
        setGeoJson(val.layer.toGeoJSON());
        
      };

      map.on("pm:create", handleCreate);
      

      return () => {
        map.off("pm:create", handleCreate);
      };
    }, [map, setGeoJson]);

    return null;
  }

  const saveAreaToDatabase = async () => {
    if (!geoJson || !areaName)
      return alert("Please provide a name and draw a shape!");
    try {
      const response = await api.post("/areas/create", {
        area_name: areaName,
        boundary_coordinates: geoJson.geometry,
        description: "Generated via Admin Portal",
      });
      if (response.status === 200 || response.status === 201) {
        alert("Area successfully registered!");
        setAreaName("");
        setGeoJson(null);
        await refresh();
      }
    } catch (error) {
      alert("Error saving area.");
    }
  };
  function MapResizer() {
    const map = useMap();
    useEffect(() => {
      setTimeout(() => {
        map.invalidateSize();
      }, 300);
    }, [map]);
    return null;
  }

  return (
    <div className="flex flex-col h-175 w-full">
      <div className="text-left mb-6 mt-6">
        <h3 className="text-3xl font-black text-[#005D90]">Area Boundary</h3>
        <p className="text-slate-500 text-sm font-medium">
          Define jurisdictions and drone flight perimeters.
        </p>
      </div>

      <div className="relative flex-1 min-h-175 w-full rounded-3xl overflow-hidden border-4 border-slate-200 shadow-inner">
        <MapContainer
          center={[7.288, 125.693]}
          zoom={14}
          className="h-full w-full z-0"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapResizer />
          <MapController targetPos={targetCoords} />
          < GeomanControls setGeoJson={setGeoJson} />

          {activeArea && (
            <GeoJSON
              key={`active-boundary-${activeArea.area_id}`}
              data={activeArea.boundary}
              interactive={false}
              pathOptions={{
                color: "#005D90",
                weight: 3,
                fillColor: "#005D90",
                fillOpacity: 0.2,
                dashArray: "5, 10",
              }}
            />
          )}
        </MapContainer>

        <div
          className="absolute top-4 right-4 z-1000 flex flex-col items-end"
          ref={dropdownRef}
        >
          <button
            onClick={() => setShowListDropdown(!showListDropdown)}
            className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-200 text-[#005D90] font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-colors"
          >
            <Layers size={16} />
            Existing Jurisdictions ({areas.length})
            <ChevronDown
              size={14}
              className={`transition-transform ${showListDropdown ? "rotate-180" : ""}`}
            />
          </button>

          {showListDropdown && (
            <div className="mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-100">
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Active List
                </span>
                {activeArea && (
                  <button
                    onClick={() => setActiveArea(null)}
                    className="text-[10px] text-red-500 font-bold hover:underline"
                  >
                    Clear Map
                  </button>
                )}
              </div>
              <div className="overflow-y-auto p-2 space-y-1">
                {areas.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 italic text-center">
                    No areas defined yet.
                  </p>
                ) : (
                  areas.map((area) => (
                    <div
                      key={area.area_id}
                      className={`group flex items-center justify-between p-2 rounded-lg transition-colors ${activeArea?.area_id === area.area_id ? "bg-blue-50 border-blue-100 border" : "hover:bg-slate-50 border border-transparent"}`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <MapPin
                          size={14}
                          className={
                            activeArea?.area_id === area.area_id
                              ? "text-[#005D90]"
                              : "text-slate-300"
                          }
                        />
                        <span className="text-xs font-bold text-slate-700 truncate">
                          {area.area_name}
                        </span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setActiveArea(area);
                            setTargetCoords([
                              area.center_latitude,
                              area.center_longitude,
                            ]);
                          }}
                          className="p-1 hover:bg-blue-100 rounded text-blue-600"
                        >
                          <Target size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete?"))
                              api
                                .delete(`/areas/${area.area_id}`)
                                .then(refresh);
                          }}
                          className="p-1 hover:bg-red-100 rounded text-red-500"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM LEFT PANEL (Create Area) */}
        <div className="absolute bottom-6 left-6 z-1000 w-full max-w-70">
          <div className="bg-white/90 backdrop-blur-md p-5 rounded-3xl shadow-2xl border border-white">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-[#005D90] rounded-xl text-white">
                <Edit3 size={18} />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 uppercase leading-none">
                  Register Area
                </h4>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
                  Define New Boundary
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter area name..."
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-[#005D90] transition-colors"
              />

              {!geoJson && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-[10px] text-[#005D90] font-bold leading-tight">
                    Please use the polygon tool on the top-left of the map to
                    draw the boundary.
                  </p>
                </div>
              )}

              <button
                disabled={!geoJson || !areaName}
                onClick={saveAreaToDatabase}
                className="w-full py-3 bg-[#005D90] hover:bg-[#004a7c] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale transition-all"
              >
                <Save size={16} />
                Save Jurisdiction
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
