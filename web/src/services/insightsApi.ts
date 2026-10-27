import api from "../api/axios";

export type InsightAlert = {
  insight_id: string;
  kind: "alert" | "digest";
  area_id: string | null;
  area_name: string | null;
  severity: "Low" | "Medium" | "High" | "Critical" | null;
  detection_count: number | null;
  top_type: string | null;
  top_type_pct: number | null;
  change_pct: number | null;
  message: string;
  created_at: string;
};

export type ActiveInsights = {
  alerts: InsightAlert[];
  digest: InsightAlert | null;
};

/**
 * Unacknowledged critical-area alerts + the latest monthly digest, in one
 * call (GET /insights/). Read is public-role readable; acknowledge is
 * admin-only on the backend but the UI is only mounted on admin pages.
 *
 * Failures throw — the banner renders the honest "couldn't load" state
 * instead of silently pretending there are no alerts.
 */
export async function fetchActiveInsights(): Promise<ActiveInsights> {
  const res = await api.get<ActiveInsights>("/insights/");
  return {
    alerts: res.data?.alerts ?? [],
    digest: res.data?.digest ?? null,
  };
}

/**
 * Mark one alert acknowledged (POST /insights/{id}/acknowledge). Backend
 * records acknowledged_at + acknowledged_by and it disappears from
 * GET /insights/ (banners only show what needs action).
 */
export async function acknowledgeInsight(insightId: string): Promise<void> {
  await api.post(`/insights/${insightId}/acknowledge`);
}
