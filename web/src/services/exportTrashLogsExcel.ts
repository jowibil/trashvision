/**
 * Excel (.xlsx) export for the Historical Flight Logs page.
 *
 * Replaces the old PDF export (jsPDF): PDF generation was failing in the
 * browser, while a spreadsheet is also the more useful format for this data
 * (sortable/filterable columns, opens in Excel/Sheets/LibreOffice).
 *
 * `xlsx` is loaded via dynamic import from the click handler, same lazy
 * pattern as the old PDF module — the chunk never touches the initial bundle.
 */

import type { DetectionRow } from "../types/types";

export interface TrashLogExportMeta {
  filters: { type: string; area: string; search: string };
  areaNameResolver: (areaId?: string) => string;
}

const formatWasteType = (type: string): string =>
  (type || "unknown").replace(/_/g, " ");

/** Confidence as a 0–100 integer; tolerates missing/garbage values. */
const confPct = (v: number): number => {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v > 1 ? v : v * 100)));
};

/** SheetJS cell type for a plain text column. */
const textCell = (v: string) => ({ t: "s" as const, v });

/** Per-type tally (weighted by cluster_count), mirrors the page's stats. */
function buildComposition(rows: DetectionRow[]) {
  const freq: Record<string, number> = {};
  let confSum = 0;

  for (const row of rows) {
    const type = row.waste_type || "unknown";
    const w = row.cluster_count || 1;
    freq[type] = (freq[type] || 0) + w;
    confSum += confPct(row.confidence_score);
  }

  const topType =
    Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";
  const topCount = freq[topType] ?? 0;

  return {
    topType,
    topCount,
    avgConfidence: rows.length > 0 ? Math.round(confSum / rows.length) : 0,
  };
}

/**
 * Exports the currently-filtered rows (all pages, not just the visible 15)
 * to `TrashVision_TrashLogs_<date>.xlsx` and triggers the download.
 */
export async function exportTrashLogsExcel(
  rows: DetectionRow[],
  meta: TrashLogExportMeta,
): Promise<void> {
  if (rows.length === 0) {
    toastError("No rows match the current filters — nothing to export.");
    return;
  }

  // Lazy chunk: the spreadsheet library lives behind this import.
  const XLSX = await import("xlsx");

  const { filters, areaNameResolver } = meta;

  // ─── Sheet 1: the filtered log rows ───────────────────────────────────
  const header = [
    "Date",
    "Time",
    "Spatial Sector",
    "Classification",
    "Clusters",
    "Confidence (%)",
    "Latitude",
    "Longitude",
  ];

  const dataRows = rows.map((log) => {
    const parsed = new Date(log.timestamp);
    const valid = !isNaN(parsed.getTime());
    return [
      textCell(
        valid
          ? parsed.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "Unknown",
      ),
      textCell(
        valid
          ? parsed.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--:--",
      ),
      textCell(areaNameResolver(log.area_id)),
      textCell(formatWasteType(log.waste_type)),
      { t: "n" as const, v: log.cluster_count || 1 },
      { t: "n" as const, v: confPct(log.confidence_score) },
      { t: "n" as const, v: log.latitude ?? 0 },
      { t: "n" as const, v: log.longitude ?? 0 },
    ];
  });

  const logsWs = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  logsWs["!cols"] = [
    { wch: 12 }, // Date
    { wch: 8 }, // Time
    { wch: 28 }, // Spatial Sector
    { wch: 20 }, // Classification
    { wch: 9 }, // Clusters
    { wch: 14 }, // Confidence
    { wch: 12 }, // Latitude
    { wch: 12 }, // Longitude
  ];
  logsWs["!freeze"] = { xSplit: 0, ySplit: 1 }; // keep the header row visible

  // ─── Sheet 2: export context (summary + active filters) ──────────────
  const composition = buildComposition(rows);
  const summaryAoa: (string | number)[][] = [
    ["TrashVision — Historical Flight Logs"],
    ["Generated", new Date().toLocaleString()],
    [
      "Records",
      rows.length,
      "Top type",
      formatWasteType(composition.topType),
      "Top count",
      composition.topCount,
      "Avg confidence (%)",
      composition.avgConfidence,
    ],
    [],
    ["Active filters"],
    [
      "Classification",
      filters.type === "All" ? "All categories" : formatWasteType(filters.type),
    ],
    [
      "Spatial zone",
      filters.area === "All" ? "All regions" : areaNameResolver(filters.area),
    ],
    ["Search", filters.search.trim() ? `"${filters.search.trim()}"` : "none"],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
  summaryWs["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, logsWs, "Trash Logs");
  XLSX.utils.book_append_sheet(wb, summaryWs, "Export Info");

  const filename = `TrashVision_TrashLogs_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/** Local error helper — keeps the module free of a top-level toast import. */
function toastError(message: string) {
  // react-hot-toast is tiny and already in the initial bundle; import it here
  // to avoid any import-cycle risk between services and page components.
  import("react-hot-toast").then(({ default: toast }) => toast.error(message));
}
