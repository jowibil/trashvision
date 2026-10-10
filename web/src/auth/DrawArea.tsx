import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import { Save } from "lucide-react";
import { Target } from "lucide-react";
import { Trash } from "lucide-react";
import { Edit3 } from "lucide-react";
import { MapPin } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Layers } from "lucide-react";
import { X } from "lucide-react";
import { RotateCcw } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "leaflet/dist/leaflet.css";
import toast, { Toaster } from "react-hot-toast";
import api from "../api/axios";
import { useAreas, type Area } from "../services/hooks/useAreas";
import { useMapControl } from "../services/hooks/useMapControl";

function MapController({ targetPos }: { targetPos: [number, number] | null }) {
  const { flyToLocation } = useMapControl();
  useEffect(() => {
    if (targetPos) flyToLocation(targetPos[0], targetPos[1]);
  }, [targetPos, flyToLocation]);
  return null;
}

function GeomanControls({
  setGeoJson,
  clearSignal,
}: {
  setGeoJson: (geoJson: any) => void;
  clearSignal: number;
}) {
  const map = useMap();
  // Last shape the user drew on this map instance; the chip's Remove uses
  // clearSignal to drop it from the map (client-side only).
  let lastDrawnLayer: any = null;

  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawCircle: false,
      drawMarker: false,
      drawPolyline: false,
    });

    const handleCreate = (val: any) => {
      lastDrawnLayer = val.layer;
      setGeoJson(val.layer.toGeoJSON());
    };

    map.on("pm:create", handleCreate);

    return () => {
      map.off("pm:create", handleCreate);
      try {
        // Geoman types don't expose removeLayer; runtime accepts a layer arg
        // and cleans up drawn shapes on unmount so a remount starts clean.
        (map.pm as unknown as { removeLayer?: (l?: unknown) => void }).removeLayer?.();
      } catch {
        /* no drawn layer — nothing to clean up */
      }
    };
  }, [map, setGeoJson]);

  // Chip's Remove: drop the drawn polygon from the map itself, not just state.
  useEffect(() => {
    if (clearSignal === 0 || !lastDrawnLayer) return;
    try {
      map.removeLayer(lastDrawnLayer);
    } catch {
      /* layer already gone */
    }
  }, [clearSignal, map]);

  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 300);
  }, [map]);
  return null;
}

export default function AreaDrawer() {
  const [activeArea, setActiveArea] = useState<Area | null>(null);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [geoJson, setGeoJson] = useState<any>(null);
  const [areaName, setAreaName] = useState("");
  const [targetCoords, setTargetCoords] = useState<[number, number] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  // Increments when the chip's Remove clears the drawn boundary; GeomanControls
  // watches it to drop the layer from the map (client-side only).
  const [clearSignal, setClearSignal] = useState(0);

  // Track areas-load state for the dropdown's skeleton / failed-load states.
  // useAreas is cache-first: a failed refresh keeps the cached list on screen,
  // so a genuine failure row only shows when there is nothing to show at all.
  const { areas, loading: areasLoading, refresh } = useAreas();
  const [areasFailed, setAreasFailed] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowListDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const refreshAreas = useCallback(async () => {
    // Same handler the hook exposes; we wrap it only to distinguish "load
    // failed and nothing cached" for the retry row. Cache-first behavior of
    // useAreas itself is unchanged.
    try {
      setAreasFailed(false);
      await refresh();
    } catch {
      setAreasFailed(true);
    }
  }, [refresh]);

  useEffect(() => {
    refreshAreas();
  }, [refreshAreas]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!geoJson) return;
      // Browser-native unsaved-changes guard (prescription: harden, no
      // decoration). The drawn boundary lives only in map state.
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [geoJson]);

  const saveAreaToDatabase = async () => {
    if (!geoJson || !areaName) return;
    setIsSaving(true);
    try {
      const response = await api.post("/areas/create", {
        area_name: areaName,
        boundary_coordinates: geoJson.geometry,
        description: "Generated via Admin Portal",
      });
      if (response.status === 200 || response.status === 201) {
        toast.success("Area successfully registered!");
        setAreaName("");
        setGeoJson(null);
        await refresh();
      }
    } catch {
      toast.error("Error saving area. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteArea = async (area: Area) => {
    if (!window.confirm(`Delete "${area.area_name}"? This cannot be undone.`)) return;
    setIsDeletingId(area.area_id);
    try {
      await api.delete(`/areas/${area.area_id}`);
      await refresh();
      toast.success(`Deleted "${area.area_name}".`);
    } catch {
      toast.error(`Couldn't delete "${area.area_name}". Try again.`);
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-175 w-full">
      <Toaster position="top-right" />
      <div className="text-left mb-6 mt-6">
        <h3 className="text-3xl font-black text-[#005D90] tracking-tight">Area boundary</h3>
        <p className="text-slate-500 text-sm font-medium">Define jurisdictions and drone flight perimeters.</p>
      </div>

      <div className="relative flex-1 min-h-175 w-full rounded-3xl overflow-hidden border-4 border-slate-200 shadow-inner">
        <MapContainer center={[7.288, 125.693]} zoom={14} className="h-full w-full z-0">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapResizer />
          <MapController targetPos={targetCoords} />
          <GeomanControls setGeoJson={setGeoJson} clearSignal={clearSignal} />

          {activeArea ? (
            <GeoJSON
              key={`active-boundary-${activeArea.area_id}`}
              data={activeArea.boundary as any}
              interactive={false}
              pathOptions={{
                color: "#005D90",
                weight: 3,
                fillColor: "#005D90",
                fillOpacity: 0.2,
                dashArray: "5, 10",
              }}
            />
          ) : null}
        </MapContainer>

        <div className="absolute top-4 right-4 z-1000 flex flex-col items-end" ref={dropdownRef}>
          <button
            type="button"
            ref={dropdownTriggerRef}
            onClick={() => setShowListDropdown((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && showListDropdown) {
                setShowListDropdown(false);
                dropdownTriggerRef.current?.focus();
              }
            }}
            aria-expanded={showListDropdown}
            aria-haspopup="true"
            className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-200 text-[#005D90] font-bold text-xs tracking-tight hover:bg-slate-50 transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
          >
            <Layers size={16} aria-hidden="true" />
            Existing areas ({areas.length})
            <ChevronDown size={14} className={`transition-transform duration-150 motion-reduce:transition-none ${showListDropdown ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>

          {showListDropdown ? (
            <div role="listbox" aria-label="Existing areas" className="mt-2 w-72 bg-[#fcfcfc] rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-100">
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 tracking-wide">Existing areas</span>
                {activeArea ? (
                  <button
                    type="button"
                    onClick={() => setActiveArea(null)}
                    className="text-[10px] text-red-500 font-bold hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 rounded-sm"
                  >
                    Clear map
                  </button>
                ) : null}
              </div>
              <div className="overflow-y-auto p-2 space-y-1">
                {areasLoading && areas.length === 0 ? (
                  // Skeleton mirrors the row layout so nothing jumps when
                  // data arrives; the cache-first hook usually skips this.
                  <div className="space-y-1 py-1" role="status" aria-label="Loading areas">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-2 p-2" aria-hidden="true">
                        <div className="w-3.5 h-3.5 rounded-full bg-slate-100 animate-pulse motion-reduce:animate-none" />
                        <div className="h-3 w-32 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                      </div>
                    ))}
                  </div>
                ) : areasFailed && areas.length === 0 ? (
                  // Genuine failure: nothing cached and the network ask failed.
                  // Names the problem and offers the recovery (retry).
                  <div className="p-4 text-center">
                    <p className="text-xs text-slate-500 font-medium mb-2">Couldn't load areas.</p>
                    <button
                      type="button"
                      onClick={refreshAreas}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-[#005D90] text-xs font-bold hover:bg-blue-100 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                    >
                      <RotateCcw size={12} aria-hidden="true" /> Retry
                    </button>
                  </div>
                ) : areas.length === 0 ? (
                  // Real empty state: first run, fetch succeeded, zero areas.
                  <div className="p-4 text-center">
                    <p className="text-xs font-bold text-slate-600 mb-1">No areas yet</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Draw a boundary below and save it — it will show up here.
                    </p>
                  </div>
                ) : (
                  areas.map((area) => (
                    <div
                      key={area.area_id}
                      className={`group flex items-center justify-between p-2 rounded-lg transition-colors duration-150 motion-reduce:transition-none ${
                        activeArea?.area_id === area.area_id ? "bg-blue-50 border-blue-100 border" : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <MapPin size={14} className={`shrink-0 ${activeArea?.area_id === area.area_id ? "text-[#005D90]" : "text-slate-300"}`} aria-hidden="true" />
                        <span className="text-xs font-bold text-slate-700 truncate">{area.area_name}</span>
                      </div>
                      {/* Hover-revealed actions are still keyboard reachable:
                          they sit in DOM order and the group gets focus-within. */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 motion-reduce:transition-none">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveArea(area);
                            setTargetCoords([area.center_latitude, area.center_longitude]);
                          }}
                          className="p-1.5 hover:bg-blue-100 rounded-md text-blue-600 cursor-pointer focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2"
                          aria-label={`Fly to ${area.area_name}`}
                        >
                          <Target size={12} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteArea(area)}
                          disabled={isDeletingId === area.area_id}
                          className="p-1.5 hover:bg-red-100 rounded-md text-red-500 disabled:opacity-40 cursor-pointer focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-red-600 focus-visible:outline-offset-2"
                          aria-label={`Delete ${area.area_name}`}
                        >
                          <Trash size={12} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* BOTTOM LEFT PANEL (Create Area) */}
        <div className="absolute bottom-6 left-6 z-1000 w-full max-w-70">
          <div className="bg-white/90 backdrop-blur-md p-5 rounded-3xl shadow-2xl border border-white">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-[#005D90] rounded-xl text-white">
                <Edit3 size={18} aria-hidden="true" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 leading-none">Register area</h4>
                <p className="text-[10px] font-medium text-slate-400 mt-1">Define a new boundary</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="area-name" className="block text-[11px] font-bold text-slate-600 mb-1.5">
                  Area name
                </label>
                <input
                  id="area-name"
                  type="text"
                  placeholder="e.g. Shoreline_North"
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#005D90] focus:ring-2 focus:ring-[#005D90]/20 transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none"
                />
              </div>

              {!geoJson ? (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-[11px] text-[#005D90] font-medium leading-snug">
                    Use the polygon tool at the top-left of the map to draw the boundary, then name it here.
                  </p>
                </div>
              ) : (
                // Drawn-boundary chip with client-side Remove (undo feedback).
                <div className="flex items-center justify-between gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#005D90] min-w-0">
                    <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">Boundary drawn</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setGeoJson(null);
                      setClearSignal((n) => n + 1);
                    }}
                    className="p-1 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                    aria-label="Remove drawn boundary"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              )}

              {geoJson && !areaName ? (
                <p className="text-[10px] text-slate-400 text-right">Add a name to enable saving.</p>
              ) : null}

              <button
                type="button"
                disabled={!geoJson || !areaName || isSaving}
                onClick={saveAreaToDatabase}
                className="w-full py-3 bg-[#005D90] hover:bg-[#004a7c] text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#005D90] transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] disabled:active:scale-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 motion-reduce:transition-none"
              >
                {isSaving ? (
                  <span
                    className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}
                {isSaving ? "Saving…" : "Save area"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
