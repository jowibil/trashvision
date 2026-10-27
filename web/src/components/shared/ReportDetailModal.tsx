import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import { Calendar, MapPin, Sparkles, User, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { Report } from "../../services/hooks/useReports";
import { AnnotatedImage } from "./AnnotatedImage";
import api from "../../api/axios";
import type { AxiosError } from "axios";

interface ReportDetailModalProps {
  report: Report | null;
  onClose: () => void;
}

/** One raw YOLO box from GET /reports/{id} (backend wire shape). */
interface ReportDetection {
  waste_type: string;
  confidence_score: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
}

/**
 * Detail-on-demand payload: the backend detail shape (ReportPublic +
 * detections + analysis_status). Declared standalone rather than extending
 * the list-row `Report` so the two contract shapes can't merge by accident:
 * the wire field is `waste_type`-named boxes, NOT the map's Detection tuple.
 */
interface ReportDetail {
  report_id: string;
  waste_type: string;
  photo_url: string | null;
  description: string | null;
  status: string;
  analysis_status: string;
  detections: ReportDetection[];
}

// Per-report_id cache: reopening a modal is instant, navigating back and
// forth never re-fetches (list responses don't carry detections — the detail
// fetch is required per design §6.2).
const detailCache = new Map<string, ReportDetail>();

const modalStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending review", className: "bg-orange-100 text-orange-700" },
  verified: { label: "Verified", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

/**
 * Full detail view for a community report. Rendered through a portal so it
 * escapes the page's stacking contexts. Closes on backdrop click and Escape;
 * the dialog itself gets role="dialog" + aria-modal so screen readers treat
 * it as a modal surface.
 */
export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
  report,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [fullResLoaded, setFullResLoaded] = useState(false);
  // Detail fetch: null while in flight, ReportDetail once cached/fetched.
  const [detail, setDetail] = useState<ReportDetail | null>(null);

  const open = report !== null;
  const reportId = report?.report_id;

  useEffect(() => {
    if (!open || !reportId) {
      setDetail(null);
      return;
    }
    setFullResLoaded(false); // fresh report → re-gate the skeleton
    const cached = detailCache.get(reportId);
    if (cached) {
      setDetail(cached);
      return;
    }
    let cancelled = false;
    api
      .get<ReportDetail>(`/reports/${reportId}`)
      .then((response) => {
        if (cancelled) return;
        detailCache.set(reportId, response.data);
        setDetail(response.data);
      })
      .catch((error: AxiosError) => {
        // Stay silent: the modal still renders the list-row baseline photo;
        // an unreachable API shouldn't toast-spam the viewer.
        console.error("Failed to fetch report detail:", error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reportId]);

  // Escape-to-close + body scroll lock, only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !report) return null;

  const status =
    modalStatusConfig[report.status?.toLowerCase() || ""] ||
    modalStatusConfig.pending;
  const lat = report.latitude ?? 0;
  const lng = report.longitude ?? 0;
  const hasCoords = lat !== 0 || lng !== 0;

  // The four analysis states (design §6.2). Before the detail fetch resolves
  // the list-row baseline photo shows with no state note; a confirmed
  // 'pending' or 'failed' shows the "AI analysis unavailable" note inline.
  const analysisStatus = detail?.analysis_status ?? null;
  const detailDetections = detail?.detections ?? [];
  const hasBoxes =
    analysisStatus === "completed" && detailDetections.length > 0;
  const isRunning = analysisStatus === "running";
  const showUnavailableNote =
    analysisStatus === "failed" || analysisStatus === "pending";

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-8"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Report detail: ${report.waste_type || "unknown"}`}
        className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-[#fcfcfc] rounded-[2rem] shadow-2xl border border-slate-100"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-[#fcfcfc]/95 backdrop-blur px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-xl text-[10px] font-black tracking-wider bg-blue-50 text-[#005D90] uppercase">
                {report.waste_type ? report.waste_type.replaceAll("_", " ") : "Unknown"}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-black shadow-sm ${status.className}`}
              >
                {status.label}
              </span>
            </div>
            <p className="mt-2 text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <Calendar size={12} />
              {report.timestamp
                ? new Date(report.timestamp).toLocaleString()
                : "No Date"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report details"
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-[color,background-color,transform] duration-150 ease-out active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Full-resolution photo + AI analysis states (design §6.2) */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
            {!fullResLoaded && report.photo_url && (
              <div className="absolute inset-0 animate-pulse flex items-center justify-center">
                <MapPin className="text-slate-300" size={32} />
              </div>
            )}
            {report.photo_url ? (
              hasBoxes ? (
                <AnnotatedImage
                  imageUrl={report.photo_url}
                  alt="Verified report photo with detected waste"
                  annotations={detailDetections.map((d) => ({
                    label: d.waste_type,
                    confidence: d.confidence_score,
                    bbox: [d.bbox_x1, d.bbox_y1, d.bbox_x2, d.bbox_y2] as [
                      number,
                      number,
                      number,
                      number,
                    ],
                  }))}
                  onImageLoad={() => setFullResLoaded(true)}
                  imageClassName={`max-h-[46dvh] cursor-default ${
                    fullResLoaded ? "opacity-100" : "opacity-0"
                  }`}
                />
              ) : (
                <img
                  src={report.photo_url}
                  alt={report.waste_type || "Report photo"}
                  className={`w-full max-h-[46dvh] object-contain transition-opacity duration-300 ease-out ${
                    fullResLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={() => setFullResLoaded(true)}
                />
              )
            ) : (
              <div className="h-48 flex items-center justify-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  No image available for this report
                </span>
              </div>
            )}

            {isRunning && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-xs text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md">
                <Sparkles size={12} className="animate-pulse" />
                AI analysis running…
              </div>
            )}

            {showUnavailableNote && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-xs text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md opacity-90">
                <Sparkles size={12} className="text-slate-400" />
                AI analysis unavailable
              </div>
            )}
          </div>

          {/* Description — never clamped here */}
          <div className="text-left">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Description
            </p>
            <p className="text-sm text-slate-700 leading-relaxed italic">
              "{report.description || "No description provided"}"
            </p>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <MapPin size={12} className="text-[#005D90]" /> Location
              </p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">
                {lat.toFixed(5)}° N, {lng.toFixed(5)}° E
              </p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <User size={12} className="text-[#005D90]" /> Reporter
              </p>
              <p className="text-sm font-bold text-slate-800">
                {report.reporter_name || "Anonymous Citizen"}
              </p>
            </div>
          </div>

          {/* Mini map */}
          {hasCoords && (
            <div className="rounded-2xl overflow-hidden border border-slate-200 h-56">
              <MapContainer
                center={[lat, lng]}
                zoom={15}
                scrollWheelZoom={false}
                className="h-full w-full z-0"
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <CircleMarker
                  center={[lat, lng]}
                  radius={9}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#005D90",
                    fillOpacity: 0.95,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                    Reported location
                  </Tooltip>
                </CircleMarker>
              </MapContainer>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
