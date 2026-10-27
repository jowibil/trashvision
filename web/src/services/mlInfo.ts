import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";

/** Class list + per-split image counts from ml/dataset_manifest.json. */
export interface DatasetManifest {
  source: string;
  export_format: string;
  version: string;
  classes: string[];
  splits: { train: number; valid: number; test: number };
  total_images: number;
}

/** One alert severity band; `above` is the exclusive threshold. Backend:
 *  insights_service.CRITICAL/HIGH/MEDIUM_COUNT_THRESHOLD served via routes/info.py. */
export interface SeverityBand {
  name: string;
  above: number;
}

export interface StageAParams {
  eps_meters: number;
  min_samples: number;
}

export interface StageBParams {
  gsd_factor: number;
  gsd_meters: number;
  min_samples: number;
}

export interface HexGridParams {
  edge_min_m: number;
  edge_max_m: number;
  default_edge_m: number;
}

export interface MlInfo {
  dataset: DatasetManifest | null;
  verified_reports_contributed: number;
  /** Shared constants — the page never re-types these. Served by
   *  routes/info.py from the same modules that compute with them. */
  severity_bands?: SeverityBand[];
  dedup?: { stage_a: StageAParams; stage_b: StageBParams };
  hex_grid?: HexGridParams;
}

export type MlInfoStatus = "loading" | "ready" | "error";

interface MlInfoResult {
  ok: boolean;
  data: MlInfo | null;
}

async function fetchMlInfo(): Promise<MlInfoResult> {
  try {
    const res = await api.get<MlInfo>("/info");
    return { ok: true, data: res.data };
  } catch {
    return { ok: false, data: null };
  }
}

/** Reads GET /info (public endpoint module routes/info.py). Legacy shape
 *  (MlInfo | null, loading and error both null) still used by Landing. */
export async function getMlInfo(): Promise<MlInfo | null> {
  return (await fetchMlInfo()).data;
}

/**
 * Hook with the three distinct API states the Info page needs (brief A5):
 * loading / ready / error, plus a retry. Fetches once per mount; numbers are
 * static (the manifest only changes on a new training export), so no polling.
 */
export function useMlInfoState() {
  // attempt-resolved pair instead of syncing "loading" inside the effect
  // (react-hooks/set-state-in-effect): status derives, state is only set in
  // the fetch callback. attempt starts at 1 so the very first fetch reads as
  // loading; retry just bumps it.
  const [attempt, setAttempt] = useState(1);
  const [resolvedAttempt, setResolvedAttempt] = useState(0);
  const [info, setInfo] = useState<MlInfo | null>(null);
  const [ok, setOk] = useState(false);

  const status: MlInfoStatus =
    attempt === resolvedAttempt ? (ok ? "ready" : "error") : "loading";

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchMlInfo().then((res) => {
      if (cancelled) return;
      setOk(res.ok);
      setInfo(res.data);
      setResolvedAttempt(attempt);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { status, info, retry };
}

/**
 * Shared hook for the two surfaces that show the dataset counts + verified
 * reports stat: the portal Info page and the landing "How it's built"
 * section. Only exposes resolved info (null while loading and on error —
 * surfaces show a dash instead of fake zeros); use useMlInfoState when a
 * surface needs to distinguish loading from error.
 */
export function useMlInfo(): MlInfo | null {
  return useMlInfoState().info;
}
