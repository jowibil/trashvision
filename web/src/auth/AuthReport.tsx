import { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  MapPin,
  User,
  Clock,
  AlertTriangle,
} from "lucide-react";
import api from "../api/axios";
import toast from "react-hot-toast";

interface CommunityReport {
  report_id: string;
  user_id: string;
  waste_type: string;
  photo_url: string;
  description: string;
  status: "pending" | "verified" | "rejected";
  timestamp: string;
  latitude: number;
  longitude: number;
  reporter_name: string;
}

export default function AuthReport() {
  const [page, setPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [hasmore, setHasMore] = useState(true);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    setPage(1);
    fetchReports(true);
  }, [filter]);

  const fetchReports = async (isNewFilter = false) => {
    setLoading(isNewFilter);
    try {
      const limit = 10;
      const offset = isNewFilter ? 0 : (page - 1) * limit;
      const response = await api.get(
        `/reports/?status=${filter}&limit=${limit}&offset=${offset}`,
      );
      if (isNewFilter) {
        setReports(response.data);
      } else {
        setReports((prev) => [...prev, ...response.data]);
      }
      setHasMore(response.data.length === limit);
    } catch (error) {
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (
    report_id: string,
    newStatus: "verified" | "rejected",
  ) => {
    try {
      // Matches: @router.patch("/{report_id}/status")
      // Note: status is passed as a query param in your FastAPI definition
      await api.patch(`/reports/${report_id}/status?status=${newStatus}`);

      toast.success(`Report ${newStatus} successfully`);
      setReports(reports.filter((r) => r.report_id !== report_id));
    } catch (error) {
      toast.error("Action failed. Try again.");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm("Permanently delete selected reports?")) return;
    try {
      await api.delete("/reports/bulk", {
        data: { report_ids: selectedReports },
      });
      setReports(reports.filter((r) => !selectedReports.includes(r.report_id)));
      setSelectedReports([]);
      toast.success("Reports deleted!");
    } catch (e) {
      toast.error("Deletion failed.");
    }
  };
  const handleSelectAll = () => {
    if (selectedReports.length === reports.length) {
      setSelectedReports([]);
    } else {
      setSelectedReports(reports.map((r) => r.report_id));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90]">
            Community Submissions
          </h3>
          <p className="text-slate-500 text-sm font-medium">
            Verify or reject reports from the field
          </p>
        </div>

        {/* Filter Toggle */}
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          {["pending", "verified", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => {
                setFilter(s);
                setSelectedReports([]);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                filter === s
                  ? "bg-[#005D90] text-white"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {filter === "rejected" && reports.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-4">
              <input
                type="checkbox"
                className="w-5 h-5 rounded border-slate-300 accent-[#005D90] cursor-pointer"
                checked={
                  selectedReports.length === reports.length &&
                  reports.length > 0
                }
                onChange={handleSelectAll}
              />
              <span className="text-sm font-bold text-slate-700">
                {selectedReports.length > 0
                  ? `${selectedReports.length} selected`
                  : "Select All Reports"}
              </span>
            </div>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <div
              key={report.report_id}
              className={`bg-white rounded-3xl border transition-all duration-300 overflow-hidden flex flex-col group relative ${
                selectedReports.includes(report.report_id)
                  ? "ring-2 ring-[#005D90] border-transparent shadow-lg"
                  : "border-slate-200 shadow-sm hover:shadow-xl"
              }`}
            >
              {filter === "rejected" && (
                <div className="absolute top-4 right-4 z-20">
                  <input
                    type="checkbox"
                    className="w-6 h-6 rounded-lg border-white shadow-sm accent-[#005D90] cursor-pointer scale-110"
                    checked={selectedReports.includes(report.report_id)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedReports([
                          ...selectedReports,
                          report.report_id,
                        ]);
                      else
                        setSelectedReports(
                          selectedReports.filter(
                            (id) => id !== report.report_id,
                          ),
                        );
                    }}
                  />
                </div>
              )}
              {/* Image Header */}
              <div className="relative h-48 overflow-hidden bg-slate-200">
                <img
                  src={report.photo_url}
                  loading="lazy"
                  alt="Waste"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  onClick={() => setSelectedImage(report.photo_url)}
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-blue-600 uppercase">
                    {report.waste_type}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4 grow">
                <div className="flex items-start justify-between">
                  <div>
                    {/* <h3 className="font-bold text-slate-800 leading-tight">{report.location_name}</h3> */}
                    <div className="flex items-center gap-1 text-slate-400 mt-1">
                      <MapPin size={12} />
                      <span className="text-[10px] font-medium italic">
                        {report.latitude.toFixed(4)},{" "}
                        {report.longitude.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 line-clamp-3 italic">
                  "{report.description}"
                </p>

                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <User size={14} />
                    <span className="text-xs font-bold">
                      {report.reporter_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock size={14} />
                    <span className="text-[10px]">
                      {new Date(report.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {filter === "pending" && (
                <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                  <button
                    onClick={() =>
                      handleUpdateStatus(report.report_id, "rejected")
                    }
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-600 font-bold text-xs hover:bg-red-50 transition-colors"
                  >
                    <XCircle size={16} /> REJECT
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateStatus(report.report_id, "verified")
                    }
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white font-bold text-xs hover:bg-green-700 transition-colors shadow-lg shadow-green-100"
                  >
                    <CheckCircle size={16} /> VERIFY
                  </button>
                </div>
              )}
              {filter === "rejected" && (
                <div className="absolute top-4 right-4 z-10">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded-lg border-white accent-red-600"
                    checked={selectedReports.includes(report.report_id)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedReports([
                          ...selectedReports,
                          report.report_id,
                        ]);
                      else
                        setSelectedReports(
                          selectedReports.filter(
                            (id) => id !== report.report_id,
                          ),
                        );
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          {selectedReports.length > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl z-50 flex items-center gap-6 animate-in slide-in-from-bottom-10">
              <span className="text-sm font-bold">
                {selectedReports.length} reports selected
              </span>
              <button
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-xs font-black transition-all"
              >
                DELETE PERMANENTLY
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && reports.length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
          <AlertTriangle className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-lg font-bold text-slate-400">
            No {filter} reports found.
          </h3>
        </div>
      )}
      {selectedImage && (
        <div
          className="fixed inset-0 z-100 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img
              src={selectedImage}
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain animate-in zoom-in-95"
              alt="Full view"
            />
            <button
              className="absolute top-0 right-0 m-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
              onClick={() => setSelectedImage(null)}
            >
              <XCircle size={32} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
