import React, { useState, useRef, useEffect } from "react";
import {
  Folder,
  Clock,
  Lightbulb,
  MapPin,
  X,
  Upload,
  FileText,
  Activity,
  ChevronRight,
} from "lucide-react";
import { activities } from "../types/mockWasteData";
import { useAreas } from "../services/hooks/useAreas";
import api from "../api/axios";

export default function DroneUploadUI() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // const [isNewArea, setIsNewArea] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [availableAreas, setAvailableAreas] = useState<{ area_id: string; area_name: string }[]>([]);
  const { areas, loading } = useAreas();

  useEffect(() => {
    const loadAreas = async () => {
      try {
        const response = await api.get("/areas");
        setAvailableAreas(response.data);
      } catch (err) {
        console.error("Failed to load areas", err);
      }
    };
    loadAreas();
  }, []);

  const [uploadMetadata, setUploadMetadata] = useState({
    name: "",
    location: "",
    date: new Date().toISOString().split("T")[0],
    pilot: "",
    customName: "",
  });

  // Handle multiple files (drone images are usually batches)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUploadSubmit = async () => {
    setIsUploading(true);
    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 400);

    setTimeout(() => {
      setIsUploading(false);
      setSelectedFiles([]);
      setUploadProgress(0);
      alert("Batch sent to YOLOv8 Processing Queue.");
    }, 5000);
  };

  return (
    <div className="space-y-6 min-h-screen max-w-7xl mx-auto p-4 lg:p-8 font-sans bg-slate-50/50">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight">
            Drone Pictures Upload
          </h3>
          <p className="text-slate-500 font-medium text-sm">
            Upload flight logs for YOLOv8 waste analysis
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* UPLOAD ZONE */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden p-2">
            {!selectedFiles.length ? (
              <div
                className="p-16 flex flex-col items-center text-center border-4 border-dashed border-slate-100 rounded-4xl hover:bg-blue-50/30 hover:border-[#005D90]/20 transition-all cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="bg-blue-50 p-6 rounded-3xl mb-4 text-[#005D90] group-hover:scale-110 transition-transform">
                  <Folder size={48} />
                </div>
                <h3 className="text-xl font-bold text-slate-700">
                  Drop Flight Folder Here
                </h3>
                <p className="text-sm text-slate-400 mt-2 max-w-xs">
                  Upload the entire survey batch. We will automatically extract
                  GPS coordinates from EXIF data.
                </p>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-[#005D90] text-white rounded-2xl shadow-lg">
                      <FileText size={28} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-800 text-left">
                        {selectedFiles.length} Images Selected
                      </h4>
                      <p className="text-sm font-bold text-blue-500 uppercase tracking-tighter">
                        Ready for Geo-Spatial Alignment
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="p-2 hover:bg-red-50 text-red-400 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">
                        Flight Survey Identifier
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Panabo_Shoreline_North_01"
                        className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-[#005D90] text-slate-800"
                        value={uploadMetadata.name}
                        onChange={(e) =>
                          setUploadMetadata({
                            ...uploadMetadata,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      {/* Improved Location Section */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                            Spatial Assignment
                          </label>
                          <span className="text-[9px] bg-blue-100 text-[#005D90] px-2 py-0.5 rounded font-black tracking-widest">
                            POSTGIS ENABLED
                          </span>
                        </div>

                        <div className="relative">
                          <select
                            className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-10 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#005D90]/20 transition-all"
                            value={uploadMetadata.location}
                            onChange={(e) =>
                              setUploadMetadata({
                                ...uploadMetadata,
                                location: e.target.value,
                              })
                            }
                          >
                            <optgroup label="Select an Area" className="text-slate-400"
                            ></optgroup>

                            {loading ? (
                              <option disabled>Loading areas...</option>
                            ) : (
                              areas.map((area) => (
                                <option key={area.area_id} value={area.area_id}>
                                  {area.area_name}
                                </option>
                              ))
                            )}
                            <option value="auto" className="border border-t-black">
                              Auto-Detect via GPS (Recommended)
                            </option>
                            <option value="new">Define New Area Name</option>
                          </select>
                          <MapPin
                            size={16}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#005D90]"
                          />
                        </div>

                        {uploadMetadata.location === "new" && (
                          <input
                            type="text"
                            placeholder="Enter new Area Name (e.g. San Pedro Waterfront)"
                            className="w-full mt-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 font-bold animate-in slide-in-from-top-2"
                            onChange={(e) =>
                              setUploadMetadata({
                                ...uploadMetadata,
                                customName: e.target.value,
                              })
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">
                        Flight Date
                      </label>
                      <input
                        type="date"
                        className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm text-slate-800 font-bold outline-none"
                        value={uploadMetadata.date}
                        onChange={(e) =>
                          setUploadMetadata({
                            ...uploadMetadata,
                            date: e.target.value,
                          })
                        }
                      />
                    </div>
                    <button
                      onClick={handleUploadSubmit}
                      disabled={isUploading || !uploadMetadata.name}
                      className="w-full h-13 mt-6 bg-[#005D90] text-white font-black rounded-2xl shadow-xl shadow-blue-200 hover:bg-[#004a7c] transition-all flex items-center justify-center gap-3"
                    >
                      {isUploading ? (
                        <Clock className="animate-spin" />
                      ) : (
                        <Upload size={20} />
                      )}
                      {isUploading ? "UPLOADING..." : "EXECUTE ANALYSIS"}
                    </button>
                  </div>
                </div>

                {isUploading && (
                  <div className="mt-8 space-y-2">
                    <div className="flex justify-between text-xs font-black text-[#005D90]">
                      <span>STRIPING METADATA & UPLOADING</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-3 bg-blue-50 rounded-full overflow-hidden border border-blue-100">
                      <div
                        className="h-full bg-[#005D90] transition-all duration-500"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STATUS LOGS */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-[#005D90]" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  Processing Pipeline
                </h3>
              </div>
              <div className="px-3 py-1 bg-blue-50 text-[#005D90] rounded-full text-[10px] font-black">
                3 ACTIVE TASKS
              </div>
            </div>

            <div className="space-y-4">
              {activities.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-[#005D90] transition-all shadow-sm">
                      <Folder size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 leading-none mb-1 text-left">
                        {item.title}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden md:block">
                      <p className="text-[10px] font-black text-slate-500 leading-none">
                        AI ACCURACY
                      </p>
                      <p className="text-xs font-black text-[#005D90]">94.2%</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GUIDELINES SIDEBAR */}
        <div className="space-y-6">
          <div className="bg-gray-900/20 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-blue-500 rounded-2xl">
                  <Lightbulb size={24} />
                </div>
                <h3 className="text-xl font-black text-black">Pre-Flight Checklist</h3>
              </div>

              <div className="space-y-8 text-left text-black">
                {[
                  {
                    t: "RTK Positioning",
                    d: "Ensure Real-Time Kinematic is active for <2cm accuracy.",
                  },
                  {
                    t: "Nadir Angle",
                    d: "Camera must be at exactly 90° for waste area calculation.",
                  },
                  {
                    t: "GSD Targets",
                    d: "Ground Sample Distance should be below 1.5cm/pixel.",
                  },
                ].map((tip, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="text-blue-500 font-black text-xl">
                      0{i + 1}
                    </div>
                    <div>
                      <p className="font-bold text-sm mb-1">{tip.t}</p>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {tip.d}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
