import { useState, useEffect } from "react";
import { CheckCircle } from "lucide-react";
import { XCircle } from "lucide-react";
import { MapPin } from "lucide-react";
import { User } from "lucide-react";
import { Clock } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import api from "../api/axios";
import toast from "react-hot-toast";
import type { Report } from "../services/hooks/useReports";

// Hoisted: static tab config, previously a fresh array literal on every render.
const STATUS_TABS = ["pending", "verified", "rejected"] as const;

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
          <h3 className="text-3xl font-black text-[#005D90]">Community Submissions</h3>
          <p className="text-slate-500 text-sm font-medium">Verify or reject reports from the field</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {reports.length > 0 ? (
            <div className="bg-[#fcfcfc] border border-slate-200 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-sm">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 accent-[#005D90] cursor-pointer"
                checked={selectedReports.length === reports.length && reports.length > 0}
                onChange={handleSelectAll}
              />
              <span className="text-xs font-bold text-slate-700">
                {selectedReports.length > 0 ? `${selectedReports.length} selected` : "Select All"}
              </span>
            </div>
          ) : null}

          <div className="flex bg-[#fcfcfc] p-1 rounded-xl border border-slate-200 shadow-sm">
            {STATUS_TABS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => handleTabChange(s)}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                  filter === s ? "bg-[#005D90] text-white" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading && reports.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => {
              const isChecked = selectedReports.includes(report.report_id);
              return (
                <div
                  key={report.report_id}
                  className="bg-[#fcfcfc] rounded-[2rem] border border-slate-100 shadow-sm hover:border-slate-200 hover:shadow-xl p-6 flex flex-col justify-between gap-6 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectReport(report.report_id)}
                          className="w-5 h-5 rounded-lg border-slate-300 text-[#005D90] focus:ring-[#005D90] cursor-pointer transition-all"
                        />
                        <div>
                          <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase block">
                            Report Identification ID
                          </span>
                          <p className="text-sm font-black text-slate-700 tracking-tight font-mono">
                            #{report.report_id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl text-[11px] font-black tracking-tight uppercase border border-slate-100 flex items-center gap-1.5">
                          <Clock size={12} strokeWidth={2.5} />
                          {filter.toUpperCase()}
                        </div>
                      </div>
                    </div>

                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-100 group cursor-zoom-in shadow-inner">
                      <img
                        src={report.photo_url}
                        alt={report.waste_type}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onClick={() => setSelectedImage(report.photo_url)}
                      />

                    </div>

                    <div className="space-y-3 text-left">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 text-[#005D90] rounded-xl">
                          <User size={14} strokeWidth={2.5} />
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase block">
                            Submitting Citizen
                          </span>
                          <p className="text-xs font-bold text-slate-700">{report.reporter_name || "Anonymous Citizen"}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 text-[#005D90] rounded-xl">
                          <MapPin size={14} strokeWidth={2.5} />
                        </div>
                        <div>
                          <span className="text-[9px] font-black text-slate-400 tracking-wider uppercase block">
                            Coordinates Matrix
                          </span>
                          <p className="text-xs font-bold text-slate-700 font-mono">
                            {report.latitude?.toFixed(5) || "0.00000"}, {report.longitude?.toFixed(5) || "0.00000"}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-[#005D90] tracking-wider uppercase block">
                            Waste Type: {report.waste_type ? report.waste_type.replace("_", " ").toUpperCase() : "UNKNOWN"}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-3">
                          Description: {report.description || "No manual contextual descriptive overview submitted."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {filter === "pending" ? (
                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(report.report_id, "verified")}
                        className="flex items-center justify-center gap-1.5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl shadow-md hover:shadow-emerald-100 transition-all"
                      >
                        <CheckCircle size={14} strokeWidth={2.5} /> Verify
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(report.report_id, "rejected")}
                        className="flex items-center justify-center gap-1.5 py-3 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black uppercase rounded-xl transition-all"
                      >
                        <XCircle size={14} strokeWidth={2.5} /> Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {loading ? (
            <div className="text-center py-4 text-xs font-bold text-slate-400 animate-pulse">
              Fetching incremental node payload...
            </div>
          ) : null}

          {selectedReports.length > 0 ? (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl z-50 flex items-center gap-6 animate-in slide-in-from-bottom-10">
              <span className="text-sm font-bold">{selectedReports.length} reports selected</span>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-xs font-black transition-all"
              >
                DELETE PERMANENTLY
              </button>
            </div>
          ) : null}
        </>
      )}

      {!loading && reports.length === 0 ? (
        <div className="text-center py-20 bg-[#fcfcfc] rounded-3xl border border-dashed border-slate-200">
          <AlertTriangle className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-lg font-bold text-slate-400">No {filter} reports found.</h3>
        </div>
      ) : null}

      {selectedImage ? (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img src={selectedImage} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain animate-in zoom-in-95" alt="Full view" />
            <button
              type="button"
              className="absolute top-0 right-0 m-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
              onClick={() => setSelectedImage(null)}
              aria-label="Close image preview"
            >
              <XCircle size={32} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}