import { useState, type JSX } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Map as MapIcon,
  FileClock,
  CheckSquare,
  CloudUpload,
  ClipboardList,
  Settings,
  LogOut,
  Home,
  Menu,
  ChevronsLeft,
  PenBoxIcon
} from "lucide-react";
import TVLogo from "@/assets/LOGO.png";
import { getUserFromToken } from "../services/tokenHelper";
import { type Role, ROLES, roleHierarchy } from "../types/roles";

type MenuItem = {
  name: string;
  path: string;
  icon: JSX.Element;
  minRole: Role;
};

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const user = getUserFromToken();
  const userRole = (user?.role?.toLowerCase() as Role) || ROLES.GUEST;
  const safeRole: Role = userRole in roleHierarchy ? userRole : ROLES.GUEST;

  const handleLogout = () => {
    if (loading) return;

    setLoading(true);
    localStorage.removeItem("token");
    localStorage.removeItem("user_name");
    sessionStorage.clear();
    navigate("/", { replace: true });
  };

  const goHome = () => {
    localStorage.removeItem("user_name");
    sessionStorage.clear();
    navigate("/", { replace: true });
  };

  const menuItems: MenuItem[] = [
    {
      name: "Dashboard",
      path: "/portal",
      icon: <LayoutDashboard size={20} />,
      minRole: ROLES.GUEST,
    },
    {
      name: "Map View",
      path: "/portal/map",
      icon: <MapIcon size={20} />,
      minRole: ROLES.GUEST,
    },
    {
      name: "Reports",
      path: "/portal/reports",
      icon: <FileClock size={20} />,
      minRole: ROLES.GUEST,
    },
    {
      name: "Verify Reports",
      path: "/portal/manage-reports",
      icon: <CheckSquare size={20} />,
      minRole: ROLES.ADMIN,
    },
    {
      name: "Drone Upload",
      path: "/portal/upload",
      icon: <CloudUpload size={20} />,
      minRole: ROLES.ADMIN,
    },
    {
      name: "Area Boundary",
      path: "/portal/draw",
      icon: <PenBoxIcon size={20} />,
      minRole: ROLES.ADMIN,
    },
    {
      name: "Trash Logs",
      path: "/portal/logs",
      icon: <ClipboardList size={20} />,
      minRole: ROLES.GUEST,
    },
    {
      name: "Settings",
      path: "/portal/settings",
      icon: <Settings size={20} />,
      minRole: ROLES.ADMIN,
    },
  ];

  const filteredItems = menuItems.filter(
    (item) => roleHierarchy[safeRole] >= roleHierarchy[item.minRole],
  );

  return (
    <aside
      className={`bg-[#EFF4FF] border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      <div
        className={`p-4 border-b border-slate-100 flex items-center transition-all ${
          isCollapsed ? "justify-center" : "justify-between"
        }`}
      >
        <div className="flex items-center gap-3" onClick={goHome}>
          <img
            src={TVLogo}
            alt="TrashVision Logo"
            className="w-10 h-10 object-contain shrink-0"
          />
          {!isCollapsed && (
            <h3 className="font-bold text-blue-500 text-xl whitespace-nowrap">
              TrashVision
            </h3>
          )}
        </div>

        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors"
          >
            <ChevronsLeft size={20} />
          </button>
        )}
      </div>

      {isCollapsed && (
        <div className="flex justify-center p-2 border-b border-slate-100">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
      )}

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {filteredItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.path === "/portal"}
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
            {!isCollapsed && <span>{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100">
        {!token || userRole !== ROLES.ADMIN ? (
          <button
            onClick={goHome}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all ${
              isCollapsed ? "justify-center px-2" : ""
            }`}
            title={isCollapsed ? "Back to Home" : ""}
          >
            <Home size={20} />
            {!isCollapsed && <span>Back to Home</span>}
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all ${
              isCollapsed ? "justify-center px-2" : ""
            }`}
            title={isCollapsed ? "Logout" : ""}
          >
            <LogOut size={20} />
            {!isCollapsed && <span>Logout</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
