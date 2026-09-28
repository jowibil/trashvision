import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Layout from "./layouts/AppLayout";
// Layout is the shared shell for every /portal route (sidebar + frame) and
// is already lightweight after last iteration's refactor, so it stays
// eager to avoid an extra network round-trip before the shell paints.
import ProtectedRoute from "./services/ProtectedRouteHelper";
import "./App.css";


const LandingPage = lazy(() => import("./pages/LandingPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MapView = lazy(() => import("./pages/MapView"));
const TrashLogs = lazy(() => import("./pages/TrashLogs"));
const Reports = lazy(() => import("./pages/Reports"));
const AuthReport = lazy(() => import("./auth/AuthReport"));
const Upload = lazy(() => import("./auth/Upload"));
const Settings = lazy(() => import("./auth/Settings"));
const AreaDrawer = lazy(() => import("./auth/DrawArea"));

// The chat widget is a heavy, always-mounted, non-critical module (markdown
// rendering, its own network calls) that isn't needed for first paint of any
// route — an explicit dynamic-import candidate per the skill's Bundle Size
// directive.
const ChatWidget = lazy(() => import("./components/chatbot/ChatWidget"));

/**
 * Minimal, taste-skill-compliant Suspense fallback: off-white surface,
 * high-radius container, no neon glow — intentionally boring so it never
 * flashes something louder than the page it's replacing.
 */
function RouteFallback() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#fcfcfc]">
      <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <>
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>
      <Toaster position="top-right" />

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/portal" element={<Layout />}>
            {/* PUBLIC ACCESSIBLE ROUTES  */}
            <Route index element={<Dashboard />} />
            <Route path="map" element={<MapView />} />
            <Route path="reports" element={<Reports />} />
            <Route path="logs" element={<TrashLogs />} />

            {/* ADMIN ONLY ROUTES */}
            <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
              <Route path="manage-reports" element={<AuthReport />} />
              <Route path="upload" element={<Upload />} />
              <Route path="settings" element={<Settings />} />
              <Route path="draw" element={<AreaDrawer />} />
            </Route>
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;