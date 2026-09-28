import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
// import TVLogo from "@/assets/LOGO.png";

const GEIST_FONT_LINK_ID = "font-geist-stylesheet";
const GEIST_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap";

/**
 * Loads the Geist typeface without adding a package dependency. Runs once
 * per app lifetime (idempotent via the link's id) rather than on every
 * AppLayout mount.
 */
function useGeistFont() {
  useEffect(() => {
    if (document.getElementById(GEIST_FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = GEIST_FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = GEIST_FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

export default function AdminLayout() {
  useGeistFont();

  return (
    <div className="flex min-h-[100dvh] h-dvh w-full bg-[#fcfcfc] overflow-hidden font-[Geist,ui-sans-serif,system-ui,sans-serif]">
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