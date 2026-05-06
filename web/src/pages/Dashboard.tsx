import { useEffect, useState } from "react";
import api from "../api/axios";
import placeholder from "@/assets/herobg.png";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [stats, setStats] = useState({ totalDetections: 0, activeReports: 0 });
  const userName = localStorage.getItem("user_name") || "Guest";
  const navigate = useNavigate();

  const openMap = () => navigate("/portal/map")

  // example fetch | not working
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get("/logs/summary");
        setStats(response.data);
      } catch (err) {
        console.error("Error fetching stats");
      }
    };
    fetchStats();
  }, []);

  const zones = [
    {
      id: 1,
      name: "Lapaz-DICT",
      date: "April 1, 2026",
      severity: "Medium",
      color: "bg-yellow-500",
    },
    {
      id: 2,
      name: "Downtown Area",
      date: "April 3, 2026",
      severity: "High",
      color: "bg-red-500",
    },
    {
      id: 3,
      name: "Seaside Zone",
      date: "March 28, 2026",
      severity: "Low",
      color: "bg-green-500",
    },
    {
      id: 4,
      name: "North District",
      date: "April 5, 2026",
      severity: "Info",
      color: "bg-blue-500",
    },
  ];



  return (
    <div className="space-y-6 min-h-screen max-w-7xl">
      <header className="h-20 border-b shadow-md rounded-lg border-slate-200 bg-white px-8 shrink-0 flex items-center">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight">
            Dashboard Overview
          </h3>
          <p className="text-slate-500 font-medium text-sm">Welcome back, {userName}.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CARD */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-left font-medium text-[#00677D]">
            Total Detections
          </p>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            {stats.totalDetections}
          </p>
          <div className="mt-4 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full w-fit font-medium">
            +12% from yesterday
          </div>
        </div>

        {/* CARD */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-left font-medium text-[#00677D]">
            Most Frequent Waste Type
          </p>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            {stats.activeReports}
          </p>
          <div className="mt-4 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full w-fit font-medium">
            5 New Reports
          </div>
        </div>

        {/* CARD */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-left font-medium text-[#00677D]">
            Most Affected Area
          </p>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            {stats.activeReports}
          </p>
          <div className="mt-4 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full w-fit font-medium">
            5 New Reports
          </div>
        </div>
      </div>

      {/* STAT GRAPH */}
      <div className="">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT CARD */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-black text-left">
                  Detection Trends
                </h3>
                <p className="text-sm text-slate-400">
                  Hourly activity over the last 7 days
                </p>
              </div>

              <div className="flex bg-slate-100 rounded-lg p-1 text-sm">
                <button className="px-3 py-1 bg-white rounded-md shadow text-slate-700">
                  7 Days
                </button>
                <button className="px-3 py-1 text-slate-500">30 Days</button>
              </div>
            </div>

            {/* MOCK BAR CHART */}
            <div className="h-64 flex items-end gap-2">
              {[40, 65, 90, 55, 70, 45, 60].map((value, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  {/* BAR */}
                  <div
                    className={`w-full rounded-md ${
                      index === 2 ? "bg-blue-700" : "bg-slate-300"
                    }`}
                    style={{ height: `${value}%` }}
                  />

                  <span className="text-xs text-slate-400 mt-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT CARD */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-lg flex flex-col items-center">
            <div className="w-full mb-4">
              <h3 className="text-lg font-semibold text-black">
                Waste Composition
              </h3>
              <p className="text-sm text-slate-400">
                Breakdown by material type
              </p>
            </div>

            {/* DONUT MOCK */}
            <div className="relative w-40 h-40 mb-6">
              <div className="w-full h-full rounded-full border-14 border-blue-700 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">68%</p>
                  <p className="text-xs text-slate-400">PLASTICS</p>
                </div>
              </div>
            </div>

            {/* TYPES UNDER DONUT */}
            <div className="w-full space-y-2 text-sm">
              {[
                { name: "Plastic Bottles", value: "42%" },
                { name: "Plastic Bag", value: "26%" },
                { name: "Styrofoam", value: "18%" },
                { name: "Other", value: "14%" },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between text-slate-600"
                >
                  <span>• {item.name}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AREA GRID */}
      <div className="p-6 rounded-lg bg-[#005D90]/10 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-semibold text-slate-800">
            Detection Zones
          </h3>
          <p className="text-sm text-blue-600 cursor-pointer hover:underline" onClick={openMap}>
            View Maps
          </p>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="relative bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition"
            >
              <span
                className={`absolute top-3 left-3 ${zone.color} text-xs text-white px-2 py-1 rounded-md`}
              >
                {zone.severity} Severity
              </span>

              <img
                src={placeholder}
                alt={zone.name}
                className="w-full h-40 object-cover rounded-t-xl"
              />

              <div className="p-4 text-left">
                <h3 className="text-lg font-semibold text-slate-800">
                  {zone.name}
                </h3>
                <p className="text-sm text-slate-500">{zone.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
