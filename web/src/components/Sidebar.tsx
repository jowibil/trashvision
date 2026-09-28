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
import { SettingsIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { Home } from "lucide-react";
import { Menu } from "lucide-react";
import { ChevronsLeft } from "lucide-react";
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

// Hoisted to module scope: this array never depends on component state or
// props, so building it once avoids re-allocating 8 JSX elements + objects
// on every render.
const MENU_ITEMS: MenuItem[] = [
  { name: "Dashboard", path: "/portal", icon: <LayoutDashboard size={20} />, minRole: ROLES.GUEST, end: true },
  { name: "Map View", path: "/portal/map", icon: <MapIcon size={20} />, minRole: ROLES.GUEST },
  { name: "Reports", path: "/portal/reports", icon: <FileClock size={20} />, minRole: ROLES.GUEST },
  { name: "Verify Reports", path: "/portal/manage-reports", icon: <CheckSquare size={20} />, minRole: ROLES.ADMIN },
  { name: "Drone Upload", path: "/portal/upload", icon: <CloudUpload size={20} />, minRole: ROLES.ADMIN },
  { name: "Area Boundary", path: "/portal/draw", icon: <PenBoxIcon size={20} />, minRole: ROLES.ADMIN },
  { name: "Trash Logs", path: "/portal/logs", icon: <ClipboardList size={20} />, minRole: ROLES.GUEST },
  { name: "Settings", path: "/portal/settings", icon: <SettingsIcon size={20} />, minRole: ROLES.ADMIN },
];

export default function Sidebar() {
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
      }`}
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
            onClick={toggleCollapsed}
            className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft size={20} />
          </button>
        ) : null}
      </div>

      {isCollapsed ? (
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
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white hover:shadow-sm ${
                isActive
                  ? "bg-white/50 shadow-xl text-blue-600 border-r-4 border-blue-500"
                  : "text-slate-600 hover:text-slate-900"
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
            onClick={handleLogout}
            disabled={loading}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all disabled:opacity-50 ${
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
            onClick={goHome}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all ${
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