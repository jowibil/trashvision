import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import TVLogo from "@/assets/LOGO.png";
import { Menu } from "lucide-react";

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
  // Off-canvas sidebar below `md`: the persistent column is display:none on
  // phones so pages get the full viewport width (see Sidebar's className).
  // Without this, the fixed 256px column eats most of a Mobile-S viewport
  // and squishes every page's content down to ~64px.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] h-dvh w-full bg-[#fcfcfc] overflow-hidden font-[Geist,ui-sans-serif,system-ui,sans-serif]">
      {/* Desktop permanent sidebar (hidden below md) */}
      <Sidebar className="hidden md:flex" />

      {/* Mobile top bar + hamburger */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden sticky top-0 z-40 shrink-0 flex items-center justify-between bg-[#EFF4FF] border-b border-slate-200 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-white transition-colors focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <Menu size={22} />
          </button>
          <img src={TVLogo} alt="TrashVision" className="w-8 h-8 object-contain" />
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile off-canvas drawer: scrim + the same sidebar component */}
      {mobileNavOpen ? (
        <div
          className="md:hidden fixed inset-0 z-[1000]"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 shadow-2xl">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}