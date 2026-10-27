import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, ShieldAlert, CalendarClock } from "lucide-react";
// Direct path imports (repo convention — barrel pulls the full icon set.
import toast from "react-hot-toast";
import {
  acknowledgeInsight,
  fetchActiveInsights,
  type InsightAlert,
} from "../../services/insightsApi";
import { getUserFromToken } from "../../services/tokenHelper";
import { type Role, ROLES, roleHierarchy } from "../../types/roles";

const SEVERITY_STYLES = {
  Critical: "border-red-200 bg-red-50",
  High: "border-orange-200 bg-orange-50",
} as const;

const SEVERITY_BADGE = {
  Critical: "bg-red-600 text-white",
  High: "bg-orange-500 text-white",
} as const;

const SEVERITY_RANK: Record<string, number> = {
  Critical: 3,
  High: 2,
  Medium: 1,
  Low: 0,
};

function bySeverityDesc(a: InsightAlert, b: InsightAlert): number {
  return (
    (SEVERITY_RANK[b.severity ?? "Low"] ?? 0) -
      (SEVERITY_RANK[a.severity ?? "Low"] ?? 0) || b.created_at.localeCompare(a.created_at)
  );
}

/**
 * Critical-area alert banner for the admin Dashboard (brief Task 3d, the
 * web half): unacknowledged insights from GET /insights/ — severity-sorted
 * alert rows with inline Acknowledge, plus the latest monthly digest as a
 * muted footer line (digests need no action, so no button).
 *
 * ADMIN-ONLY surface (product decision 2026-10-27): alerts are an operator
 * workflow — guest/community viewers get nothing. READS are public per
 * backend decision, but a non-actionable alert panel is noise on
 * client-facing pages, so the banner (alerts + digest) never loads there.
 *
 * Renders nothing when there are no unacknowledged alerts AND no digest —
 * an always-visible "all clear" panel would rot into noise.
 */
export default function InsightsBanner() {
  const viewerRole = useMemo<Role>(
    () => (getUserFromToken()?.role?.toLowerCase() as Role) || ROLES.GUEST,
    [],
  );
  const canView =
    viewerRole in roleHierarchy &&
    roleHierarchy[viewerRole] >= roleHierarchy[ROLES.ADMIN];

  const [alerts, setAlerts] = useState<InsightAlert[]>([]);
  const [digest, setDigest] = useState<InsightAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return; // guests never fetch alert data
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    // Backend failure ≠ "no alerts": the banner shows the honest failed
    // state instead of pretending everything is acknowledged.
    fetchActiveInsights()
      .then((data) => {
        if (cancelled) return;
        setAlerts(data.alerts);
        setDigest(data.digest);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView]);

  const handleAcknowledge = useCallback(async (insightId: string) => {
    setBusyId(insightId);
    try {
      await acknowledgeInsight(insightId);
      // Optimistic remove; a refetch would also drop expired siblings, but
      // the panel already holds exactly /insights/' unacknowledged set.
      setAlerts((prev) => prev.filter((a) => a.insight_id !== insightId));
      toast.success("Alert acknowledged");
    } catch {
      toast.error("Couldn't acknowledge — try again");
    } finally {
      setBusyId(null);
    }
  }, []);

  if (!canView) return null;
  if (loading) return null;
  if (!failed && alerts.length === 0 && !digest) return null;

  const sorted = [...alerts].sort(bySeverityDesc);

  return (
    <section
      aria-label="Critical area alerts"
      className="rounded-2xl border border-zinc-900/10 bg-[#fcfcfc] shadow-xs overflow-hidden"
    >
      <header className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-slate-100">
        <ShieldAlert size={16} className="text-[#005D90]" aria-hidden="true" />
        <h3 className="text-sm font-bold text-slate-800 tracking-tight">
          Critical area alerts
        </h3>
        {!failed && sorted.length > 0 ? (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {sorted.length} active
          </span>
        ) : null}
      </header>

      <div className="divide-y divide-slate-100">
        {failed ? (
          <p className="px-4 sm:px-6 py-3 text-xs text-slate-500 font-medium">
            Couldn't load alerts right now.
          </p>
        ) : (
          <>
            {sorted.map((alert) => {
              const styles =
                SEVERITY_STYLES[alert.severity as keyof typeof SEVERITY_STYLES] ??
                "border-slate-100 bg-slate-50";
              const badge =
                SEVERITY_BADGE[alert.severity as keyof typeof SEVERITY_BADGE] ??
                "bg-slate-500 text-white";
              const busy = busyId === alert.insight_id;
              return (
                <div
                  key={alert.insight_id}
                  className={`flex items-start gap-3 px-4 sm:px-6 py-3 ${styles}`}
                >
                  <span
                    className={`shrink-0 mt-0.5 ${badge} text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider`}
                  >
                    {alert.severity ?? "Alert"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800">
                      {alert.area_name ?? "Area"}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAcknowledge(alert.insight_id)}
                    disabled={busy}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-[#fcfcfc] px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-colors active:scale-[0.97] disabled:opacity-60 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2"
                  >
                    {busy ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Check size={13} aria-hidden="true" />
                    )}
                    Acknowledge
                  </button>
                </div>
              );
            })}

            {digest ? (
              <div className="flex items-start gap-2.5 px-4 sm:px-6 py-3 bg-white">
                <CalendarClock size={13} className="mt-0.5 text-slate-400" aria-hidden="true" />
                <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                  <span className="font-bold text-slate-600">Monthly digest — </span>
                  {digest.message}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
