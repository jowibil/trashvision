import { useState, useEffect, type ChangeEvent, type DragEvent } from "react";
import { Folder } from "lucide-react";
import { Clock } from "lucide-react";
import { Lightbulb } from "lucide-react";
import { MapPin } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { X } from "lucide-react";
import { UploadIcon } from "lucide-react";
import { FileText } from "lucide-react";
import { Plane } from "lucide-react";
import { Inbox } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { useAreas } from "../services/hooks/useAreas";
import api from "../api/axios";

// Hoisted: static content, doesn't depend on component state.
const PRE_FLIGHT_CHECKLIST = [
  { t: "RTK Positioning", d: "Ensure Real-Time Kinematic is active for <2cm accuracy." },
  { t: "Nadir Angle", d: "Camera must be at exactly 90° for waste area calculation." },
  { t: "GSD Targets", d: "Ground Sample Distance should be below 1.5cm/pixel." },
] as const;

// Entrance for the selected-files and progress panels (mount animation;
// transitions don't apply on first paint). Duration/easing follow the animate
// skill's <300ms ease-out budget, with prefers-reduced-motion opting out.
const RISE_IN_CSS = `
@keyframes tv-rise-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.tv-rise-in { animation: tv-rise-in 220ms cubic-bezier(0.23, 1, 0.32, 1) both; }
@media (prefers-reduced-motion: reduce) { .tv-rise-in { animation: none; } }
`;

// Radius rule for this page: cards 2.5rem (matches the admin portal's other
// pages), controls and inputs 0.75rem.
const inputClass =
  "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 " +
  "placeholder:text-slate-500 outline-none focus:border-[#005D90] focus:ring-2 focus:ring-[#005D90]/20 " +
  "transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none";

interface FlightLog {
  flight_id: string;
  notes?: string;
  pilot_name: string;
  flight_date: string;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DroneUploadUI() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const { areas } = useAreas();

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
    // Presentation-only flag so the list shows a skeleton instead of flashing
    // the empty state while the first fetch is in flight. fetchFlights itself
    // is untouched.
    let alive = true;
    fetchFlights().finally(() => {
      if (alive) setLogsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  // Drag & drop is presentation wiring only: dropped files enter the exact
  // same selectedFiles state the file picker uses. No upload/API changes.
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) setSelectedFiles(dropped);
  };

  // Per-file remove filters the same client-side selection array that the
  // existing "clear all" button empties — no request is involved.
  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
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
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(percent);
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
      await new Promise((resolve) => setTimeout(resolve, 500));
      fetchFlights();
    } catch (err) {
      toast.error("Upload failed. Check connection.");
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 min-h-[100dvh] max-w-7xl mx-auto p-4 lg:p-8">
      <style>{RISE_IN_CSS}</style>
      <Toaster position="top-right" />

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight">Drone uploads</h3>
          <p className="text-slate-500 font-medium text-sm mt-1">Upload flight imagery for YOLOv8 waste analysis</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* UPLOAD ZONE */}
          <section className="bg-[#fcfcfc] rounded-[2.5rem] border border-slate-200 shadow-sm p-2" aria-label="Flight image upload">
            {!selectedFiles.length ? (
              <div
                className={`py-14 px-8 border-4 border-dashed rounded-[2rem] transition-[background-color,border-color] duration-150 ease-out motion-reduce:transition-none ${
                  isDragging
                    ? "border-[#005D90] bg-blue-50/70"
                    : "border-slate-200 hover:bg-blue-50/40 hover:border-[#005D90]/40"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Visually-hidden input + real <label>: keyboard/screen-reader
                    accessible file picking with zero JS (the old onClick div +
                    hidden input pattern wasn't reachable by keyboard). */}
                <input
                  type="file"
                  multiple
                  id="flight-files"
                  className="peer sr-only"
                  onChange={handleFileChange}
                />
                <label
                  htmlFor="flight-files"
                  className="group flex flex-col items-center text-center cursor-pointer rounded-3xl w-full"
                >
                  <div className="bg-blue-50 text-[#005D90] p-5 rounded-3xl mb-4 group-hover:scale-[1.04] transition-transform duration-200 ease-out motion-reduce:transition-none">
                    <Folder size={40} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <span className="block text-lg font-bold text-slate-800">Drop flight images here</span>
                  <span className="text-sm text-slate-500 mt-1">
                    or{" "}
                    <span className="text-[#005D90] font-semibold underline underline-offset-2 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-[#005D90] peer-focus-visible:outline-offset-2">
                      browse your files
                    </span>
                  </span>
                </label>
                <p className="text-xs text-slate-400 mt-4 max-w-xs mx-auto text-center">
                  One batch per flight — photos keep their GPS metadata for automatic area detection.
                </p>
              </div>
            ) : (
              <div className="p-6 sm:p-8 tv-rise-in">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="p-4 bg-[#005D90] text-white rounded-2xl shrink-0">
                      <FileText size={22} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-lg font-bold text-slate-800 tabular-nums">
                        {selectedFiles.length} {selectedFiles.length === 1 ? "image" : "images"} selected
                      </h4>
                      <p className="text-sm text-slate-500">Ready to analyze</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFiles([])}
                    className="p-2 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                    aria-label="Clear selected files"
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>

                <ul className="max-h-56 overflow-y-auto bg-slate-50 border border-slate-100 rounded-2xl divide-y divide-slate-100">
                  {selectedFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-4 py-3">
                      <FileText size={16} className="text-[#005D90] shrink-0" aria-hidden="true" />
                      <span className="text-sm font-medium text-slate-700 truncate flex-1 min-w-0" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums shrink-0">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="flight-name" className="block text-xs font-bold text-slate-600 mb-2">
                        Survey name
                      </label>
                      <input
                        id="flight-name"
                        type="text"
                        placeholder="e.g. Shoreline_North_01"
                        className={inputClass}
                        value={uploadMetadata.name}
                        onChange={(e) => setUploadMetadata({ ...uploadMetadata, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="flight-area" className="block text-xs font-bold text-slate-600 mb-2">
                        Assignment area
                      </label>
                      <div className="relative">
                        <select
                          id="flight-area"
                          className={`${inputClass} appearance-none pl-10 pr-9 cursor-pointer`}
                          value={uploadMetadata.location}
                          onChange={(e) => setUploadMetadata({ ...uploadMetadata, location: e.target.value })}
                        >
                          <option value="auto">Auto-detect from GPS (recommended)</option>
                          {areas.map((area) => (
                            <option key={area.area_id} value={area.area_id}>
                              {area.area_name}
                            </option>
                          ))}
                        </select>
                        <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#005D90] pointer-events-none" aria-hidden="true" />
                        <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="flight-date" className="block text-xs font-bold text-slate-600 mb-2">
                        Flight date
                      </label>
                      <input
                        id="flight-date"
                        type="date"
                        className={inputClass}
                        value={uploadMetadata.date}
                        onChange={(e) => setUploadMetadata({ ...uploadMetadata, date: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleUploadSubmit}
                      disabled={isUploading || !uploadMetadata.name}
                      aria-describedby={uploadMetadata.name ? undefined : "upload-btn-hint"}
                      className="w-full h-12 bg-[#005D90] text-white font-bold rounded-xl shadow-sm hover:bg-[#004a7c] transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:bg-[#005D90] flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                    >
                      {isUploading ? <Clock size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <UploadIcon size={18} aria-hidden="true" />}
                      {isUploading ? "Uploading…" : "Upload & analyze"}
                    </button>
                    {!uploadMetadata.name ? (
                      <p id="upload-btn-hint" className="text-xs text-slate-400 text-center">
                        Add a survey name to enable upload.
                      </p>
                    ) : null}
                  </div>
                </div>

                {isUploading ? (
                  <div className="mt-6 tv-rise-in">
                    <div className="flex items-center justify-between mb-2" aria-hidden="true">
                      <span className="text-xs font-bold text-slate-600">Uploading flight images</span>
                      <span className="text-xs font-bold text-[#005D90] tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Upload progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadProgress}
                      className="w-full h-2 bg-blue-50 rounded-full overflow-hidden border border-blue-100"
                    >
                      <div
                        className="h-full bg-[#005D90] rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* RECENT FLIGHTS */}
          <section className="bg-[#fcfcfc] rounded-[2.5rem] p-6 sm:p-8 border border-slate-200 shadow-sm" aria-label="Recent flights">
            <div className="mb-6">
              <h3 className="text-base font-bold text-slate-800">Recent flights</h3>
              <p className="text-xs text-slate-400 mt-0.5">The five most recent uploads</p>
            </div>

            {logsLoading ? (
              <div className="space-y-3" role="status" aria-label="Loading recent flights">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-4" aria-hidden="true">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 animate-pulse motion-reduce:animate-none" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3.5 w-40 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                      <div className="h-3 w-24 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            ) : flightLogs.length === 0 ? (
              <div className="flex flex-col items-center text-center py-10">
                <div className="p-4 bg-blue-50 text-[#005D90] rounded-2xl mb-3">
                  <Inbox size={24} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <p className="text-sm font-bold text-slate-700">No flights yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Uploads you submit will show up here with their pilot and flight date.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {flightLogs.map((item) => (
                  <div
                    key={item.flight_id}
                    className="flex items-center gap-4 p-3 sm:p-4 rounded-2xl border border-transparent hover:bg-slate-50 hover:border-slate-100 transition-colors duration-150 ease-out motion-reduce:transition-none"
                  >
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#005D90] shrink-0">
                      <Plane size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{item.notes || "Unnamed flight"}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        Pilot {item.pilot_name} · {new Date(item.flight_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* GUIDELINES (Right Sidebar) */}
        <aside className="space-y-6 lg:sticky lg:top-4 self-start">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-lg relative overflow-hidden">
            <div className="flex items-center gap-3 mb-7">
              <div className="p-2.5 bg-[#005D90] rounded-xl">
                <Lightbulb size={18} aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold">Pre-flight checklist</h3>
            </div>

            <ol className="space-y-6">
              {PRE_FLIGHT_CHECKLIST.map((tip, i) => (
                <li key={tip.t} className="flex gap-4">
                  <span className="text-sm font-black text-blue-300 tabular-nums shrink-0 w-6" aria-hidden="true">
                    0{i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold mb-1">{tip.t}</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{tip.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
