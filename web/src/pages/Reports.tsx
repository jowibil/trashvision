import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { User } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Calendar } from "lucide-react";
import { AlertCircle } from "lucide-react";
import type { Report } from "../services/hooks/useReports";
import { REPORTS_LIST_LIMIT } from "../services/hooks/useReports";
import api from "../api/axios";
import { ReportDetailModal } from "../components/shared/ReportDetailModal";

// Status labels read as plain words, not all-caps shouts — the badge color
// carries the state, the label carries the meaning ("Pending review" explains
// itself; "PENDING" doesn't).
const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending review", bg: "bg-orange-100", text: "text-orange-700" },
  verified: { label: "Verified", bg: "bg-emerald-100", text: "text-emerald-700" },
  rejected: { label: "Rejected", bg: "bg-red-100", text: "text-red-700" },
};

const DynamicImage: React.FC<{ src: string | null; alt: string }> = ({ src, alt }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <div className="relative aspect-video md:aspect-square rounded-2xl overflow-hidden shadow-inner bg-slate-100">
      {!isLoaded && src ? (
        <div className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center">
          <MapPin className="text-slate-300" size={32} />
        </div>
      ) : null}
      {src ? (
        <img
          src={`${src}?q=80&w=640`}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover transition-opacity duration-300 ease-out ${isLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setIsLoaded(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" role="img" aria-label={alt}>
          <MapPin className="text-slate-300" size={32} />
        </div>
      )}
    </div>
  );
};

const CommunityReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Row whose full detail is open in the modal (null = closed).
  const [detailReport, setDetailReport] = useState<Report | null>(null);
  const closeDetail = useCallback(() => setDetailReport(null), []);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      // Explicit limit: the backend default (10) silently capped this feed
      // — the sidebar stats count reports.length, so totals were wrong too.
      const response = await api.get("/reports/?status=verified", {
        params: { limit: REPORTS_LIST_LIMIT },
      });
      setReports(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      // The page itself says what failed and offers a retry — a toast would
      // vanish while the persistent state would still lie ("no reports").
      setLoadFailed(true);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Real aggregates from the fetched list — the sidebar never shows numbers
  // the data can't back.
  const stats = useMemo(() => {
    const counts = new Map<string, number>();
    let latest: Date | null = null;
    for (const r of reports) {
      const type = r.waste_type ? r.waste_type.replaceAll("_", " ") : "Unknown";
      counts.set(type, (counts.get(type) ?? 0) + 1);
      if (r.timestamp) {
        const d = new Date(r.timestamp);
        if (!isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
    return { total: reports.length, top, max: top[0]?.[1] ?? 0, latest };
  }, [reports]);

  return (
    <div className="min-h-[100dvh] w-full p-6 md:p-10">
      <div className="max-w-350 mx-auto mb-12 text-left px-4">
        <h3 className="text-3xl font-black text-[#005D90] tracking-tight mb-2">Community Reports</h3>
        <p className="text-slate-500 text-sm font-medium">Citizen-submitted debris reports, verified by the TrashVision team.</p>
      </div>

      <div className="max-w-350 mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start px-4">
        <div className="lg:col-span-8 space-y-6">
          {loading ? (
            <div className="flex justify-center p-20 animate-pulse text-slate-400 font-bold uppercase tracking-widest">
              Loading reports…
            </div>
          ) : loadFailed && reports.length === 0 ? (
            <div
              role="alert"
              className="p-16 text-center border border-red-100 bg-red-50/60 rounded-[2.5rem]"
            >
              <AlertCircle className="mx-auto text-red-300 mb-3" size={32} />
              <p className="font-bold text-red-700">Couldn't load reports</p>
              <p className="text-sm text-red-600 mt-1">Check your connection and try again.</p>
              <button
                type="button"
                onClick={fetchReports}
                className="mt-5 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-widest bg-[#005D90] text-white transition-transform duration-150 ease-out active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2"
              >
                Try again
              </button>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem]">
              <MapPin className="mx-auto text-slate-300 mb-3" size={32} />
              <p className="font-bold text-slate-500">No verified reports yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Citizen reports appear here once they're reviewed and verified.
              </p>
            </div>
          ) : (
            reports.map((log) => {
              const status = statusConfig[log.status?.toLowerCase() || ""] || statusConfig.pending;
              const wasteLabel = log.waste_type ? log.waste_type.replaceAll("_", " ") : "Unknown";

              return (
                <div
                  key={log.report_id}
                  className="bg-[#fcfcfc] rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-[box-shadow] duration-200 ease-out overflow-hidden group relative"
                >
                  <div className="flex flex-col md:flex-row">
                    <div className="md:w-64 p-4 shrink-0">
                      <div className="relative">
                        <DynamicImage
                          src={log.photo_url}
                          alt={log.waste_type ? `Photo of reported ${wasteLabel}` : "Reported debris photo"}
                        />
                        <span
                          className={`absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-black ${status.bg} ${status.text} shadow-sm`}
                        >
                          {status.label}
                        </span>

                      </div>
                    </div>

                    <div className="flex-1 p-6 flex flex-col justify-between text-left">
                      <div>
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-4 py-1.5 rounded-xl text-[10px] font-black tracking-wider bg-blue-50 text-[#005D90] uppercase">
                              {wasteLabel}
                            </span>

                          </div>
                          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                            <Calendar size={12} /> {log.timestamp ? new Date(log.timestamp).toLocaleDateString() : "Date unavailable"}
                          </span>
                        </div>

                        <p className="mt-4 text-sm text-slate-600 line-clamp-2 italic">
                          "{log.description || "No description provided"}"
                        </p>
                      </div>

                      <div>
                        <div className="grid grid-cols-2 gap-8 mt-6 border-y border-slate-50 py-6">
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <MapPin size={12} className="text-[#005D90]" /> Location
                            </p>
                            <p className="text-sm font-bold text-slate-800 tabular-nums">
                              {log.latitude ? log.latitude.toFixed(4) : "0.0000"}° N, {log.longitude ? log.longitude.toFixed(4) : "0.0000"}° E
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <User size={12} className="text-[#005D90]" /> Reporter
                            </p>
                            <p className="text-sm font-bold text-slate-800">{log.reporter_name || "Anonymous Citizen"}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setDetailReport(log)}
                          aria-haspopup="dialog"
                          className="mt-4 flex items-center gap-2 text-[11px] font-black text-[#005D90] uppercase tracking-widest group-hover:translate-x-1 transition-transform duration-150 ease-out active:scale-[0.97] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 rounded"
                        >
                          View detail <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && !loadFailed && reports.length > 0 && (
          <div className="lg:col-span-4 lg:sticky lg:top-10">
            <div className="bg-[#fcfcfc] rounded-[2.5rem] p-8 shadow-sm border border-slate-100 flex flex-col gap-8 text-left">
              <div className="space-y-1">
                <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-widest">At a glance</h3>
                <p className="text-6xl font-black text-slate-800 tracking-tighter tabular-nums">
                  {stats.total}
                </p>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                  Verified report{stats.total === 1 ? "" : "s"}
                </p>
              </div>

              {stats.top.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
                    Most reported types
                  </h3>
                  <div className="flex items-end gap-2 h-20 px-2" aria-hidden="true">
                    {stats.top.map(([type, count], i) => (
                      <div
                        key={type}
                        className={`flex-1 rounded-t-lg transition-[height] duration-300 ease-out ${
                          i === 0 ? "bg-[#005D90]" : "bg-slate-100"
                        }`}
                        style={{ height: `${Math.max((count / stats.max) * 100, 6)}%` }}
                      />
                    ))}
                  </div>
                  <ul className="space-y-2">
                    {stats.top.map(([type, count]) => (
                      <li key={type} className="flex justify-between items-baseline text-xs">
                        <span className="text-slate-600 font-medium capitalize truncate pr-2">{type}</span>
                        <span className="font-bold text-slate-800 tabular-nums shrink-0">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {stats.latest && (
                <div className="pt-6 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Calendar size={12} className="text-[#005D90]" /> Latest verified report
                  </p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">
                    {stats.latest.toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ReportDetailModal report={detailReport} onClose={closeDetail} />
    </div>
  );
};

export default CommunityReportsPage;