import { useState, useEffect } from "react";
import { CheckCircle } from "lucide-react";
import { XCircle } from "lucide-react";
import { MapPin } from "lucide-react";
import { User } from "lucide-react";
import { Calendar } from "lucide-react";
import { Inbox } from "lucide-react";
import api from "../api/axios";
import toast from "react-hot-toast";
import type { Report } from "../services/hooks/useReports";

// Hoisted: static tab config, previously a fresh array literal on every render.
const STATUS_TABS = ["pending", "verified", "rejected"] as const;

// UI-only lookup: the API needs the raw status value, humans read a label.
const TAB_LABELS: Record<(typeof STATUS_TABS)[number], string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

// Same status palette as the public Reports page — one severity scale
// across both report surfaces (orange = awaiting review, emerald = verified,
// red = rejected). Everything else on this page stays brand blue or neutral.
const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending review", bg: "bg-orange-100", text: "text-orange-700" },
  verified: { label: "Verified", bg: "bg-emerald-100", text: "text-emerald-700" },
  rejected: { label: "Rejected", bg: "bg-red-100", text: "text-red-700" },
};

export default function AuthReport() {
  const [page, setPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  // Value intentionally unread for now (setter drives the page-1 reset);
  // underscore keeps noUnusedLocals satisfied.
  const [, setHasMore] = useState(true);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof STATUS_TABS)[number]>("pending");

  useEffect(() => {
    const controller = new AbortController();

    const fetchReports = async () => {
      setLoading(true);
      try {
        const limit = 10;
        const offset = (page - 1) * limit;
        const response = await api.get(`/reports/?status=${filter}&limit=${limit}&offset=${offset}`, {
          signal: controller.signal,
        });

        setReports((prev) => (page === 1 ? response.data : [...prev, ...response.data]));
        setHasMore(response.data.length === limit);
      } catch (error) {
        if (error instanceof Error && error.name !== "CanceledError") {
          toast.error("Failed to load reports");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReports();

    return () => controller.abort();
  }, [filter, page]);

  const handleTabChange = (newFilter: (typeof STATUS_TABS)[number]) => {
    if (newFilter === filter) return;
    setFilter(newFilter);
    setPage(1);
    setReports([]);
    setSelectedReports([]);
  };

  const handleUpdateStatus = async (report_id: string, newStatus: "verified" | "rejected") => {
    try {
      await api.patch(`/reports/${report_id}/status?status=${newStatus}`);
      toast.success(`Report ${newStatus} successfully`);
      setReports((prev) => prev.filter((r) => r.report_id !== report_id));
      setSelectedReports((prev) => prev.filter((id) => id !== report_id));
    } catch {
      toast.error("Action failed. Try again.");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm("Permanently delete selected reports?")) return;
    try {
      await api.delete("/reports/bulk", {
        data: { report_ids: selectedReports },
      });
      setReports((prev) => prev.filter((r) => !selectedReports.includes(r.report_id)));
      setSelectedReports([]);
      toast.success("Reports deleted!");
    } catch {
      toast.error("Deletion failed.");
    }
  };

  const handleSelectReport = (report_id: string) => {
    setSelectedReports((prev) => (prev.includes(report_id) ? prev.filter((id) => id !== report_id) : [...prev, report_id]));
  };

  const handleSelectAll = () => {
    setSelectedReports((prev) => (prev.length === reports.length ? [] : reports.map((r) => r.report_id)));
  };

  return (
    <div className="min-h-[100dvh] p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight">Community Submissions</h3>
          <p className="text-slate-500 text-sm font-medium">Verify or reject reports from the field</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {reports.length > 0 ? (
            <div className="bg-[#fcfcfc] border border-slate-200 rounded-full px-4 py-2 flex items-center gap-3 shadow-sm">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-[#005D90] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2"
                checked={selectedReports.length === reports.length && reports.length > 0}
                onChange={handleSelectAll}
                aria-label={selectedReports.length === reports.length ? "Deselect all reports" : "Select all reports"}
              />
              <span className="text-xs font-bold text-slate-700 tabular-nums">
                {selectedReports.length > 0 ? `${selectedReports.length} selected` : "Select all"}
              </span>
            </div>
          ) : null}

          <div className="flex bg-[#fcfcfc] p-1 rounded-full border border-slate-200 shadow-sm" role="tablist" aria-label="Filter reports by status">
            {STATUS_TABS.map((s) => (
              <button
                type="button"
                key={s}
                role="tab"
                aria-selected={filter === s}
                onClick={() => handleTabChange(s)}
                className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none ${
                  filter === s ? "bg-[#005D90] text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {TAB_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading && reports.length === 0 ? (
        // First-load skeleton mirrors the card layout so nothing jumps when
        // real content arrives.
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" role="status" aria-label="Loading reports">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[#fcfcfc] rounded-[2.5rem] border border-slate-100 p-6" aria-hidden="true">
              <div className="flex items-center justify-between mb-5">
                <div className="h-4 w-28 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="aspect-video rounded-2xl bg-slate-100 animate-pulse mb-5 motion-reduce:animate-none" />
              <div className="space-y-2">
                <div className="h-3 w-3/4 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => {
              const isChecked = selectedReports.includes(report.report_id);
              const wasteLabel = report.waste_type ? report.waste_type.replaceAll("_", " ") : "Unknown";
              const status = statusConfig[report.status?.toLowerCase() || ""] || statusConfig[filter];

              return (
                <div
                  key={report.report_id}
                  className="bg-[#fcfcfc] rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-[box-shadow] duration-200 ease-out p-6 flex flex-col justify-between gap-5 text-left motion-reduce:transition-none"
                >
                  <div className="flex flex-col gap-5">
                    {/* Card header: identity + status, the two things an admin scans first */}
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-center gap-3 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectReport(report.report_id)}
                          className="w-5 h-5 rounded accent-[#005D90] cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2"
                          aria-label={`Select report ${report.report_id.slice(0, 8).toUpperCase()}`}
                        />
                        <span className="min-w-0">
                          <span className="block text-[10px] font-black text-slate-400 tracking-widest uppercase">
                            Report ID
                          </span>
                          <span
                            className="text-sm font-bold text-slate-700 font-mono tabular-nums tracking-tight"
                            title={report.report_id}
                          >
                            #{report.report_id.slice(0, 8).toUpperCase()}
                          </span>
                        </span>
                      </label>

                      <span className={`px-3 py-1 rounded-full text-[10px] font-black shrink-0 ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedImage(report.photo_url)}
                      className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 cursor-zoom-in block w-full focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2"
                      aria-label={`View full-size photo of ${wasteLabel}`}
                    >
                      <img
                        src={report.photo_url}
                        alt={`Photo of reported ${wasteLabel}`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </button>

                    {/* Metadata grouped into one scannable chunk (matches Reports page) */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-slate-100 py-4">
                      <div className="space-y-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <User size={12} className="text-[#005D90]" aria-hidden="true" /> Reporter
                        </p>
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {report.reporter_name || "Anonymous Citizen"}
                        </p>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <MapPin size={12} className="text-[#005D90]" aria-hidden="true" /> Location
                        </p>
                        <p className="text-sm font-bold text-slate-800 tabular-nums">
                          {report.latitude ? report.latitude.toFixed(4) : "0.0000"}° N,{" "}
                          {report.longitude ? report.longitude.toFixed(4) : "0.0000"}° E
                        </p>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <Calendar size={12} className="text-[#005D90]" aria-hidden="true" /> Submitted
                        </p>
                        <p className="text-sm font-bold text-slate-800 tabular-nums">
                          {report.timestamp ? new Date(report.timestamp).toLocaleDateString() : "Date unavailable"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="inline-block px-3 py-1 rounded-xl text-[10px] font-black tracking-wider bg-blue-50 text-[#005D90] uppercase">
                        {wasteLabel}
                      </span>
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 italic">
                        "{report.description || "No description provided"}"
                      </p>
                    </div>
                  </div>

                  {filter === "pending" ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(report.report_id, "verified")}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-[#005D90] hover:bg-[#004C77] text-white text-[11px] font-black uppercase tracking-widest transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                      >
                        <CheckCircle size={14} strokeWidth={2.5} aria-hidden="true" /> Verify
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(report.report_id, "rejected")}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-black uppercase tracking-widest transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-red-600 focus-visible:outline-offset-2 motion-reduce:transition-none"
                      >
                        <XCircle size={14} strokeWidth={2.5} aria-hidden="true" /> Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {loading ? (
            <p className="text-center py-4 text-xs font-bold text-slate-400 animate-pulse motion-reduce:animate-none" role="status">
              Loading more reports…
            </p>
          ) : null}

          {selectedReports.length > 0 ? (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl z-50 flex items-center gap-6 opacity-100 translate-y-0 transition-[opacity,transform] duration-200 ease-out starting:opacity-0 starting:translate-y-4 motion-reduce:transition-none">
              <span className="text-sm font-bold tabular-nums" aria-live="polite">
                {selectedReports.length} selected
              </span>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-colors duration-150 ease-out active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 motion-reduce:transition-none"
              >
                Delete permanently
              </button>
            </div>
          ) : null}
        </>
      )}

      {!loading && reports.length === 0 ? (
        <div className="text-center py-16 px-8 bg-[#fcfcfc] rounded-[2.5rem] border-2 border-dashed border-slate-200">
          <Inbox className="mx-auto text-slate-300 mb-3" size={32} aria-hidden="true" />
          <p className="font-bold text-slate-500">No {TAB_LABELS[filter].toLowerCase()} reports</p>
          <p className="text-sm text-slate-400 mt-1">
            Reports marked "{TAB_LABELS[filter].toLowerCase()}" will appear here.
          </p>
        </div>
      ) : null}

      {selectedImage ? (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 opacity-100 transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none"
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full-size report photo"
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img
              src={selectedImage}
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain scale-100 transition-transform duration-200 ease-out starting:scale-95 motion-reduce:transition-none"
              alt="Full-size report photo"
            />
            <button
              type="button"
              className="absolute top-0 right-0 m-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
              onClick={() => setSelectedImage(null)}
              aria-label="Close image preview"
            >
              <XCircle size={28} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
