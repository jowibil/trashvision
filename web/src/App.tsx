import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import ProtectedRoute from "./services/ProtectedRouteHelper";
import Dashboard from "./pages/Dashboard";
import MapView from "./pages/MapView";
import TrashLogs from "./pages/TrashLogs";
import Reports from "./pages/Reports";
import Layout from "./layouts/AppLayout";
import AuthReport from "./auth/AuthReport";
import Upload from "./auth/Upload";
import Settings from "./auth/Settings";
import AreaDrawer from "./auth/DrawArea";
import { Toaster } from "react-hot-toast";
import "./App.css";

function App() {
  return (
    <>
    <Toaster position="top-right" />
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
    </>
  );
}

export default App;
