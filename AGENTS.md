# AGENTS.md — TrashVision

Instructions for AI coding agents working in this repository.
For architecture and stack details, read `knowledge.md` first.

## Project Overview

TrashVision is a trash monitoring & reporting platform with three deployables:

- `backend/` — FastAPI + SQLAlchemy + PostgreSQL API (auth, reports, detections, flights, areas, chat)
- `web/` — React 19 + TypeScript + Vite + Tailwind 4 admin portal (Leaflet maps)
- `mobile/` — Flutter citizen app (reporting, offline sync, OSM map)
- `ml/` — YOLO training/inference (5 trash classes)

## Commands

```bash
# Backend (run from backend/, use its venv)
uvicorn main:app --reload
alembic upgrade head          # migrations

# Web (run from web/, npm)
npm run dev                   # Vite dev server
npm run build                 # tsc -b && vite build  ← typecheck happens here
npm run lint                  # ESLint 9

# Mobile (run from mobile/)
flutter run
flutter analyze
flutter test
```

## Ground Rules

1. **Match existing conventions before inventing new ones.** This repo has established patterns — follow them.
2. **Never commit or print secrets.** `backend/.env` and `mobile/.env` hold real keys (DB, Cloudinary, SMTP, Gemini). Config comes from `pydantic-settings` / `flutter_dotenv`.
3. **Database changes require Alembic migrations.** Never hand-edit schema; generate a revision in `backend/migrations/versions/` and keep models in `backend/models/` in sync.
4. **Auth is role-based.** Roles: `guest` < `community` < `admin`. Backend: guard endpoints with `require_role()` / `get_current_active_admin` from `dependency.py`. Web: gate admin routes with `ProtectedRouteHelper`. Mobile has no admin surface.
5. **Typecheck before you finish.**
   - Web: `npm run build` must pass (strict `tsc -b`).
   - Mobile: `flutter analyze` must be clean.
   - Backend: files are plain Python; no typechecker configured — verify by import/run.
6. **Reuse shared primitives instead of duplicating:**
   - Mobile theme tokens/colors/severity scale: `mobile/lib/config/theme.dart` (`primaryBlue`, `ink`, `severityScale`, `MapPanel`, `StaggerIn`).
   - Mobile HTTP: `api_client.dart` (shared http client with 401 handling) — don't create bare `http`/`dio` calls that bypass it.
   - Web API calls go through `web/src/services/`.
7. **Map severity is CCI, one scale everywhere** (spec: `algorithm_equations.md`). CCI = K · count / geodesic cell area with K = 20; bands ≤2 / ≤5 / ≤10 / ≤20 / >20 (web: `useHexbins.classifyCci`, mobile: `theme.dart` `getCciColor`). Backend computes adaptive, boundary-clipped hex cells + per-cell geodesic area (`mobile_service.calculate_hex_tiles`). Don't reintroduce raw-count coloring or a second K factor.
8. **Map window modes are a shared contract.** `mode=month` (per-month + cumulative week cutoff W1–W4) vs `mode=accumulated` (Jan 1 → end of selected month, same year, no week cutoff) — implemented once in `mobile_service.calculate_hex_tiles` / `get_area_detection_stats` / the `/collection` date params, consumed by web (`useAreaHexbins`, `useLazyAreaCollection`) and mobile (`MobileMapService`). Cache keys are `hexbins_v5:{mode}:...` on BOTH platforms, always in lockstep. Pins and hexes must always query the same window.
9. **Map counts are detection rows; dedup is the pipeline's job.** Duplicate "trash" within a run is normalized by DBSCAN Stage A (overlapping frames, ε=3 m) and Stage B (same-frame boxes, ε≈2–3×GSD) — do NOT add map-level clustering across flights/windows (tried 2026-10, rolled back: undercounted; design preserved in `pipeline_explained.md` §5). Full pipeline narrative: `pipeline_explained.md`; formal math: `algorithm_equations.md`. K calibration against real survey data is still an open item.
8. **Don't break the offline outbox.** Mobile `sync_services.dart` queues reports offline; ensure new write endpoints stay idempotent-friendly and don't assume instant connectivity.
9. **Lazy-loading discipline (web):** route components are `lazy()` in `App.tsx`; keep heavy widgets (e.g., ChatWidget) out of the critical path.
10. **Git hygiene:** current working branch is `feature-branch`. Don't commit unrelated files; don't touch `venv/`, `__pycache__/`, `build/`, `node_modules/`.

## Code Style

- **Backend:** FastAPI routers in `routes/`, business logic in `services/`, ORM models in `models/`. Routers stay thin.
- **Web:** function components + hooks; TypeScript strict; Tailwind utility classes; toasts via `react-hot-toast`.
- **Mobile:** Material 3; screens in `screens/`, HTTP in `services/`, reusable UI in `widgets/`; use the shared theme constants, not hardcoded hexes.
- **Web UI work follows the design playbook:** read `.agents/design-prescription.md` (per-page skills & modes) and `.agents/design-skills-routing.md` (skill conflict resolution) before touching web UI.
- Naming: files snake_case in backend, PascalCase components / camelCase helpers on web, snake_case files on mobile.

## Verification Checklist (before finishing any task)

- [ ] Typecheck/analyze passes for the subproject touched
- [ ] No secrets, tokens, or `.env` values in code, logs, or commits
- [ ] Schema changes have a migration and updated model
- [ ] New endpoints have role guards
- [ ] UI changes tested on the relevant platform (web browser / Flutter device or emulator)
