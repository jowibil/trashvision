import { useCallback, useMemo, useState, type JSX } from "react";
import { NavLink, useNavigate } from "react-router-dom";

// Direct path imports instead of the lucide-react barrel export so bundlers
// can tree-shake precisely and avoid pulling in the full icon set.
import { LayoutDashboard } from "lucide-react";
import { MapIcon } from "lucide-react";
import { FileClock } from "lucide-react";
import { CheckSquare } from "lucide-react";
import { CloudUpload } from "lucide-react";
import { ClipboardList } from "lucide-react";
import { Info } from "lucide-react";
import { SettingsIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { Home } from "lucide-react";
import { Menu } from "lucide-react";
import { ChevronsLeft } from "lucide-react";
import { X } from "lucide-react";
import { PenBoxIcon } from "lucide-react";

import TVLogo from "@/assets/LOGO.png";
import { getUserFromToken } from "../services/tokenHelper";
import { type Role, ROLES, roleHierarchy } from "../types/roles";

type MenuItem = {
  name: string;
  path: string;
  icon: JSX.Element;
  minRole: Role;
  end?: boolean;
};

// The menu never depends on component state or props, so it is built once
// at module scope instead of reallocating its JSX elements and objects on
// every render.
const MENU_ITEMS: MenuItem[] = [
  { name: "Dashboard", path: "/portal", icon: <LayoutDashboard size={20} />, minRole: ROLES.GUEST, end: true },
  { name: "Map View", path: "/portal/map", icon: <MapIcon size={20} />, minRole: ROLES.GUEST },
  { name: "Reports", path: "/portal/reports", icon: <FileClock size={20} />, minRole: ROLES.GUEST },
  { name: "Verify Reports", path: "/portal/manage-reports", icon: <CheckSquare size={20} />, minRole: ROLES.ADMIN },
  { name: "Drone Upload", path: "/portal/upload", icon: <CloudUpload size={20} />, minRole: ROLES.ADMIN },
  { name: "Area Boundary", path: "/portal/draw", icon: <PenBoxIcon size={20} />, minRole: ROLES.ADMIN },
  { name: "Trash Logs", path: "/portal/logs", icon: <ClipboardList size={20} />, minRole: ROLES.GUEST },
  { name: "Info", path: "/portal/info", icon: <Info size={20} />, minRole: ROLES.GUEST },
  { name: "Settings", path: "/portal/settings", icon: <SettingsIcon size={20} />, minRole: ROLES.ADMIN },
];

// Responsive shell: the sidebar is hidden below `md` (AppLayout renders a
// hamburger + this component inside an off-canvas drawer instead). Without
// this, the fixed 256px column eats most of a Mobile-S viewport and squishes
// every page's content down to ~64px.
interface SidebarProps {
  className?: string;
  /** Called after any drawer nav action so AppLayout can close the overlay. */
  onNavigate?: () => void;
  /** "drawer" = off-canvas overlay copy (below md): the header close button
   * dismisses the overlay outright there, since the desktop collapse-to-rail
   * state is useless on a phone (it doesn't even persist across drawer
   * reopens — the instance unmounts). Default "permanent" keeps collapse. */
  variant?: "permanent" | "drawer";
}

export default function Sidebar({
  className = "",
  onNavigate,
  variant = "permanent",
}: SidebarProps) {
  const isDrawer = variant === "drawer";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const user = getUserFromToken();
  const userRole = (user?.role?.toLowerCase() as Role) || ROLES.GUEST;
  const safeRole: Role = userRole in roleHierarchy ? userRole : ROLES.GUEST;

  const handleLogout = useCallback(() => {
    if (loading) return;
    setLoading(true);
    localStorage.removeItem("token");
    localStorage.removeItem("user_name");
    sessionStorage.clear();
    navigate("/", { replace: true });
  }, [loading, navigate]);

  const goHome = useCallback(() => {
    // Token hygiene now matches handleLogout: a stale/invalid token used to
    // survive the trip home and could make the landing page read a user as
    // logged-in with dead credentials. "Back to Home" closes the portal
    // session on this device — signing in again is one tap away.
    localStorage.removeItem("token");
    localStorage.removeItem("user_name");
    sessionStorage.clear();
    navigate("/", { replace: true });
  }, [navigate]);

  const toggleCollapsed = useCallback(() => setIsCollapsed((prev) => !prev), []);

  // Derived state computed during render (memoized on the one input that
  // matters) rather than kept as a separate, sync-prone state value.
  const filteredItems = useMemo(
    () => MENU_ITEMS.filter((item) => roleHierarchy[safeRole] >= roleHierarchy[item.minRole]),
    [safeRole],
  );

  const showLogout = Boolean(token) && userRole === ROLES.ADMIN;

  return (
    <aside
      className={`bg-[#EFF4FF] border-r border-slate-200 flex flex-col h-dvh sticky top-0 transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      } ${className}`}
    >
      <div
        className={`p-4 border-b border-slate-100 flex items-center transition-all ${
          isCollapsed ? "justify-center" : "justify-between"
        }`}
      >
        <button
          type="button"
          onClick={goHome}
          className="flex items-center gap-3 text-left"
        >
          <img src={TVLogo} alt="TrashVision Logo" className="w-10 h-10 object-contain shrink-0" />
          {!isCollapsed ? (
            <h3 className="font-bold text-blue-500 text-xl whitespace-nowrap tracking-tight">
              TrashVision
            </h3>
          ) : null}
        </button>

        {!isCollapsed ? (
          <button
            type="button"
            onClick={isDrawer ? () => onNavigate?.() : toggleCollapsed}
            className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500"
            aria-label={isDrawer ? "Close navigation menu" : "Collapse sidebar"}
          >
            {isDrawer ? <X size={20} /> : <ChevronsLeft size={20} />}
          </button>
        ) : null}
      </div>

      {/* Permanent-only: mini-rail expand row; unreachable in the drawer. */}
      {isCollapsed && !isDrawer ? (
        <div className="flex justify-center p-2 border-b border-slate-100">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors"
            aria-label="Expand sidebar"
          >
            <Menu size={20} />
          </button>
        </div>
      ) : null}

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {filteredItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.end ?? false}
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-white hover:shadow-sm ${
                isActive
                  ? "bg-white shadow-sm text-[#005D90] font-semibold"
                  : "text-slate-600 font-medium hover:text-slate-900"
              } ${isCollapsed ? "justify-center px-2" : ""}`
            }
            title={isCollapsed ? item.name : ""}
          >
            <div className="shrink-0">{item.icon}</div>
            {!isCollapsed ? <span>{item.name}</span> : null}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100">
        {showLogout ? (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              handleLogout();
            }}
            disabled={loading}                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-700 transition-all disabled:opacity-50 ${
              isCollapsed ? "justify-center px-2" : ""
            }`}
            title={isCollapsed ? "Logout" : ""}
          >
            <LogOut size={20} />
            {!isCollapsed ? <span>Logout</span> : null}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              goHome();
            }}                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-all ${
              isCollapsed ? "justify-center px-2" : ""
            }`}
            title={isCollapsed ? "Back to Home" : ""}
          >
            <Home size={20} />
            {!isCollapsed ? <span>Back to Home</span> : null}
          </button>
        )}
      </div>
    </aside>
  );
}