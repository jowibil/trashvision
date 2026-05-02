import React, { useEffect, useState } from "react";
import { MapPin, User, ChevronRight, Calendar } from "lucide-react";
import { type SeverityType } from "../types/mockWasteData";
import api from "../api/axios";
import toast from "react-hot-toast";


interface CommunityReport {
  report_id: string;
  waste_type: string;
  photo_url: string;
  description: string;
  status: "pending" | "verified" | "rejected";
  timestamp: string;
  reporter_name: string;
  latitude: number;
  longitude: number;
}

const statusConfig: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  pending: { label: "PENDING", bg: "bg-orange-100", text: "text-orange-700" },
  verified: {
    label: "VERIFIED",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
  },
  rejected: { label: "REJECTED", bg: "bg-red-100", text: "text-red-700" },
};

// const severityConfig: Record<SeverityType, { bg: string; text: string }> = {
//   CRITICAL: { bg: "bg-red-100", text: "text-red-700" },
//   MEDIUM: { bg: "bg-amber-100", text: "text-amber-800" },
//   HIGH: { bg: "bg-orange-100", text: "text-orange-700" },
//   LOW: { bg: "bg-green-100", text: "text-green-700" },
// };

const DynamicImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <div className="relative aspect-video md:aspect-square rounded-2xl overflow-hidden shadow-inner bg-slate-100">
      {!isLoaded && (
        <div className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center">
          <MapPin className="text-slate-300" size={32} />
        </div>
      )}
      <img
        src={`${src}?q=80&w=640`}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
};

const CommunityReportsPage: React.FC = () => {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        // Using the trailing slash as discussed to avoid CORS redirects
        const response = await api.get("/reports/?status=verified");
        setReports(response.data);
      } catch (error) {
        toast.error("Failed to sync with TrashVision API");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  return (
    <div className="min-h-screen w-full p-6 md:p-10">
      <div className="max-w-350 mx-auto mb-12 text-left px-4">
        <h3 className="text-3xl font-black text-[#005D90] tracking-tight mb-2">
          Community Reports
        </h3>
        <p className="text-slate-500 text-sm font-medium">
          Verified crowdsourced debris detection results.
        </p>
      </div>

      <div className="max-w-350 mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start px-4">
        <div className="lg:col-span-8 space-y-6">
          {loading ? (
            <div className="flex justify-center p-20 animate-pulse text-slate-400 font-bold uppercase tracking-widest">
              Connecting to Database...
            </div>
          ) : reports.length === 0 ? (
            <div className="p-20 text-center border-2 border-dashed rounded-[2.5rem] text-slate-400 font-bold">
              No verified reports found.
            </div>
          ) : (
            reports.map((log) => {
              // Handle status safely
              const status =
                statusConfig[log.status.toLowerCase()] || statusConfig.pending;

              return (
                <div
                  key={log.report_id}
                  className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group"
                >
                  <div className="flex flex-col md:flex-row">
                    {/* Image Part - Now using photo_url from Cloudinary */}
                    <div className="md:w-64 p-4 shrink-0">
                      <div className="relative">
                        <DynamicImage
                          src={log.photo_url}
                          alt={log.waste_type}
                        />
                        <span
                          className={`absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-black ${status.bg} ${status.text} shadow-sm uppercase`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>

                    {/* Content Part */}
                    <div className="flex-1 p-6 flex flex-col justify-between text-left">
                      <div className="flex justify-between items-start">
                        <span className="px-4 py-1.5 rounded-xl text-[10px] font-black tracking-wider bg-blue-50 text-[#005D90] uppercase">
                          {log.waste_type.replace("_", " ")}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                          <Calendar size={12} />{" "}
                          {new Date(log.timestamp).toLocaleDateString()}
                        </span>
                      </div>

                      <p className="mt-4 text-sm text-slate-600 line-clamp-2 italic">
                        "{log.description || "No description provided"}"
                      </p>

                      <div className="grid grid-cols-2 gap-8 mt-6 border-y border-slate-50 py-6">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <MapPin size={12} className="text-[#005a8e]" />{" "}
                            Location
                          </p>
                          <p className="text-sm font-bold text-slate-800 tabular-nums">
                            {log.latitude.toFixed(4)}° N,{" "}
                            {log.longitude.toFixed(4)}° E
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <User size={12} className="text-[#005a8e]" />{" "}
                            Reporter
                          </p>
                          <p className="text-sm font-bold text-slate-800">
                            {log.reporter_name}
                          </p>
                        </div>
                      </div>

                      <button className="mt-4 flex items-center gap-2 text-[11px] font-black text-[#005a8e] uppercase tracking-widest group-hover:translate-x-1 transition-all">
                        View Detail <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: STATS (4/12) */}
        <div className="lg:col-span-4 lg:sticky lg:top-10">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 flex flex-col gap-8 text-left">
            <div className="flex justify-between items-center">
              <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
                Response Rate
              </h3>
              <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-[10px] font-black">
                +5.2%
              </span>
            </div>

            {/* Chart Simulation */}
            <div className="flex items-end gap-2 h-20 px-2">
              {[30, 45, 35, 100, 60, 40, 55].map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-lg transition-all duration-500 ${h === 100 ? "bg-[#005a8e]" : "bg-slate-100"}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            <div className="space-y-1">
              <h3 className="text-6xl font-black text-slate-800 tracking-tighter">
                92.4<span className="text-3xl text-slate-500">%</span>
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                Avg. Resolution Time: 4.2 hrs
              </p>
            </div>

            <div className="pt-6 border-t border-slate-50">
              <div className="bg-blue-50 rounded-2xl p-4">
                <p className="text-[10px] font-black text-[#005a8e] uppercase tracking-widest mb-1">
                  Expert Insight
                </p>
                <p className="text-xs font-medium text-slate-600 leading-relaxed">
                  Community response is 12% faster in sectors with active drone
                  monitoring.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityReportsPage;
