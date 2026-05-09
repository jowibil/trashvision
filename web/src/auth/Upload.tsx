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
  CheckCircle2,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast"; 
import { useAreas } from "../services/hooks/useAreas";
import api from "../api/axios";

export default function DroneUploadUI() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Flight Logs State
  const [flightLogs, setFlightLogs] = useState<any[]>([]);
  const { areas, loading: areasLoading } = useAreas();

  const [uploadMetadata, setUploadMetadata] = useState({
    name: "",
    location: "",
    date: new Date().toISOString().split("T")[0],
    pilot: "Admin",
  });

  const fetchFlights = async () => {
    try {
      const response = await api.get("/flights/");
      // Show only the 5 most recent
      setFlightLogs(response.data.slice(0, 5));
    } catch (err) {
      console.error("Failed to load flight logs", err);
    }
  };

  useEffect(() => {
    fetchFlights();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("flight_date", uploadMetadata.date);
    formData.append("pilot_name", uploadMetadata.pilot);
    formData.append("notes", uploadMetadata.name);

    if (uploadMetadata.location && uploadMetadata.location !== "auto") {
      formData.append("area_id", uploadMetadata.location);
    }

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      await api.post("/flights/upload-batch", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1),
          );
          setUploadProgress(percent);
          console.log("notes being sent:", uploadMetadata.name); 
        },
      });

      toast.success("Flight analysis queued successfully!");

      setSelectedFiles([]);
      setUploadMetadata({
        name: "",
        location: "",
        date: new Date().toISOString().split("T")[0],
        pilot: "Admin",
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      fetchFlights();
    } catch (err) {
      toast.error("Upload failed. Check connection.");
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 min-h-screen max-w-7xl mx-auto p-4 lg:p-8 font-sans">
      <Toaster position="top-right" /> {/* Toast Container */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight uppercase">
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
                  Upload survey batch to extract GPS and begin AI analysis.
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
                {/* File Preview Header */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-[#005D90] text-white rounded-2xl shadow-lg">
                      <FileText size={28} />
                    </div>
                    <div className="text-left">
                      <h4 className="text-xl font-black text-slate-800">
                        {selectedFiles.length} Images Selected
                      </h4>
                      <p className="text-sm font-bold text-blue-500 uppercase tracking-tighter">
                        Ready for Batch Processing
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="p-2 hover:bg-red-50 text-red-400 rounded-full"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <div className="space-y-4">
                    <div className="text-left">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">
                        Flight Survey Identifier
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Shoreline_North_01"
                        className="w-full bg-white border text-slate-900 border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:border-[#005D90] outline-none"
                        value={uploadMetadata.name}
                        onChange={(e) =>
                          setUploadMetadata({
                            ...uploadMetadata,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="text-left">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">
                        Spatial Assignment
                      </label>
                      <div className="relative">
                        <select
                          className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-10 py-3 text-sm font-bold text-slate-800 outline-none"
                          value={uploadMetadata.location}
                          onChange={(e) =>
                            setUploadMetadata({
                              ...uploadMetadata,
                              location: e.target.value,
                            })
                          }
                        >
                          <option value="auto">
                            Auto-Detect via GPS (Recommended)
                          </option>
                          {areas.map((area) => (
                            <option key={area.area_id} value={area.area_id}>
                              {area.area_name}
                            </option>
                          ))}
                        </select>
                        <MapPin
                          size={16}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#005D90]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-left">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">
                        Flight Date
                      </label>
                      <input
                        type="date"
                        className="w-full bg-white border text-slate-900 border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none"
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
                      className="w-full h-13 mt-6 bg-[#005D90] text-white font-black rounded-2xl shadow-xl hover:bg-[#004a7c] transition-all flex items-center justify-center gap-3"
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

                {/* Progress Bar */}
                {isUploading && (
                  <div className="mt-8 space-y-2">
                    <div className="flex justify-between text-xs font-black text-[#005D90]">
                      <span>STRIPING METADATA & UPLOADING</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-3 bg-blue-50 rounded-full overflow-hidden border border-blue-100">
                      <div
                        className="h-full bg-[#005D90] transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DYNAMIC STATUS LOGS */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-[#005D90]" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  Processing Pipeline
                </h3>
              </div>
              <div className="px-3 py-1 bg-blue-50 text-[#005D90] rounded-full text-[10px] font-black uppercase">
                {flightLogs.length} RECENT LOGS
              </div>
            </div>

            <div className="space-y-4">
              {flightLogs.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold py-4">
                  No recent flights found.
                </p>
              ) : (
                flightLogs.map((item) => (
                  <div
                    key={item.flight_id}
                    className="group flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-[#005D90] shadow-sm">
                        <CheckCircle2 size={20} />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-slate-800 leading-none mb-1">
                          {item.notes || "Unnamed Flight"}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          PILOT: {item.pilot_name} •{" "}
                          {new Date(item.flight_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right hidden md:block">
                        <p className="text-[10px] font-black text-slate-500 leading-none">
                          STATUS
                        </p>
                        <p className="text-xs font-black text-green-500">
                          COMPLETED
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* GUIDELINES (Right Sidebar) remains the same as your code */}
        <div className="space-y-6">
          <div className="bg-gray-900/20 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-blue-500 rounded-2xl">
                  <Lightbulb size={24} />
                </div>

                <h3 className="text-xl font-black text-black">
                  Pre-Flight Checklist
                </h3>
              </div>

              <div className="space-y-8 text-left text-black">
                {[
                  {t: "RTK Positioning", d: "Ensure Real-Time Kinematic is active for <2cm accuracy."},
                  {t: "Nadir Angle", d: "Camera must be at exactly 90° for waste area calculation."},
                  {t: "GSD Targets", d: "Ground Sample Distance should be below 1.5cm/pixel."},
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
