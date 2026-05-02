import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
// import TVLogo from "@/assets/LOGO.png";

export default function AdminLayout() {
  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
