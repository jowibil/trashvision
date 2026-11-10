# TrashVision — Knowledge Base

TrashVision is a trash monitoring and reporting platform: drone/camera imagery is run through
an ML detection model, detections are clustered and visualized on maps (web + mobile), and
users file reports that admins manage.

## Repository Layout

| Path      | What it is |
|-----------|------------|
| `backend/`  | FastAPI REST API (Python) — auth, reports, detections, logs, areas, flights, chat |
| `web/`      | React 19 + Vite + Tailwind 4 admin portal (dashboard, map, reports, logs) |
| `mobile/`   | Flutter app (Android/iOS/etc.) — citizen-facing reporting + map |
| `ml/`       | YOLO (ultralytics) training + inference scripts, dataset config, weights |
| `.agents/`  | Cross-agent skills (source of truth); `.claude/skills/` symlinks into it |

## Backend (`backend/`)

- **Framework:** FastAPI + Uvicorn. Entry point `main.py`. CORS is env-driven: `CORS_ORIGINS` (comma-separated) feeds `allow_origins`, defaulting to the localhost:5173 pair for dev — set the deployed portal's origin there per environment.
- **Config:** `config.py` uses `pydantic-settings` reading `backend/.env` **plus the repo-root `.env.local`** (Neon CLI wiring: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`; real env vars beat both files). Required keys:
  `DATABASE_URL`, `SECRET_KEY`, `CLOUDINARY_*`, `SMTP_EMAIL`, `SMTP_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL_NAME`. Notable optional keys: `CORS_ORIGINS`, `SENTRY_DSN` + `SENTRY_TRACES_SAMPLE_RATE` (Sentry is a no-op when unset), `SWEEP_ENABLED` (weekly insights sweep daemon thread), `TEMP_CLEANER_ENABLED`/`TEMP_FILE_MAX_AGE_HOURS` (upload temp reaper), `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30 days).
- **DB:** PostgreSQL (psycopg2) via SQLAlchemy; migrations with Alembic (`alembic.ini` → `migrations/versions/`, 21 revisions). PostGIS is used (see `9c6ad0b483ab_postgis_and_async_fields.py`).
- **Routers** (prefix → file): `/auth` auth, `/detections` detections, `/mobile/map` mobile_map, `/reports` reports, `/logs` logs, `/areas` areas, `/flights` flights, `/users` user, `/gemini` chat, `/info` info (ML metadata), `/insights` insights (critical-area sweep).
- **Services:** `auth_service`, `chat_data_service`, `cloudinary_service` (image upload), `dbscan_service` (clustering detections into severity levels), `detection_service`, `email_service` (SMTP password reset), `gemini_services` (chat + vision prompts in `prompts/`), `geo_assign`, `gps_service`, `insights_service`, `log_service`, `mobile_service`, `report_inference_service` (report-image YOLO stage), `temp_cleanup_service`, `user_service`.
- **Auth:** JWT (python-jose, HS256) with OAuth2 bearer; roles are `guest` < `community` < `admin` (see `ROLE_HIERARCHY` in `dependency.py`). Role gates: `get_current_active_admin`, `require_role(min_role)`. Rate limiting via slowapi.
- **Run:** `uvicorn main:app --reload` from `backend/` (use `venv/` there; deps in `requirements.txt`).

## Web (`web/`)

- **Stack:** React 19, TypeScript (~6.0), Vite 8, Tailwind CSS 4 (via `@tailwindcss/vite`), react-router-dom 7, axios, react-hot-toast.
- **Map:** Leaflet + react-leaflet + leaflet.heat + @geoman-io/leaflet-geoman-free (area drawing) + @turf/turf (geo math). Offline cache-first via `services/mapCache.ts` (IndexedDB mirror of mobile's sqflite map_cache — shared `areas_v1` / `hexbins_v7:...` keys, LRU 24, `areas` protected; `isStale` renders as a "Cached" chip). Hex severity is CCI (`DRONE_K_FACTOR = 20`, spec `docs/algorithm_equations.md` §2.1/§2.3), shared with mobile; cells are adaptive per area (boundary extent / 10, clipped server-side).
- **Excel export:** `xlsx` (SheetJS), lazy-loaded (`services/exportTrashLogsExcel.ts`).
- **Spatial algorithms spec:** `docs/algorithm_equations.md` — DBSCAN stages + CalculateLitterDensityMap (CCI = K · count / geodesic cell area, K = 20, bands ≤2/≤5/≤10/≤20/>20). Backend implements it in `mobile_service.calculate_hex_tiles` (adaptive hex grid + clipping + per-cell geodesic area); map counts are detection rows — dedup belongs to DBSCAN Stage A/B in the pipeline, NOT map-level clustering (cross-flight clustering tried + rolled back 2026-10, see `docs/pipeline_explained.md` §5); web math in `useHexbins.ts`, mobile math in `mobile_map_models.dart` + `config/theme.dart`. Keep all three in sync. Full narrative: `docs/pipeline_explained.md`.
- **Pages** (`src/pages/`): `LandingPage`, `Dashboard`, `MapView`, `Reports`, `TrashLogs`. Admin-only: `auth/AuthReport`, `auth/Upload`, `auth/Settings`, `auth/DrawArea`.
- **Routing:** `App.tsx` — all pages lazy-loaded; `/portal/*` shell is `layouts/AppLayout` (eager); admin routes wrapped in `services/ProtectedRouteHelper` (`allowedRoles={["admin"]}`); catch-all redirects to `/`.
- **Scripts:** `npm run dev` (Vite), `npm run build` (`tsc -b && vite build`), `npm run lint` (ESLint 9), `npm run preview`.

## Mobile (`mobile/`)

- **Stack:** Flutter (Dart SDK ^3.10.1), Material 3. Package name `TrashVision`.
- **Key deps:** dio + http, flutter_secure_storage (JWT), flutter_dotenv (`.env` asset), sqflite (offline cache), connectivity_plus (offline sync), flutter_map + latlong2 (OSM maps), geolocator, image_picker/camera, flutter_image_compress, jwt_decoder, lucide_icons.
- **Structure:** `screens/` (login, register, password_reset, home, camera_page, report, mapview, user_profile), `services/` (`api_client` shared dio client, `api_service`, `auth_service`, `mobile_map_service`, `sync_services`), `models/` (area, detection, report, mobile_map), `widgets/`, `config/theme.dart`.
- **Auth/session:** token expiry is validated at startup (`main.dart` via `JwtDecoder`) and mid-session (`ApiClient.onUnauthorized` hook → wipe token, redirect `/login`). `SyncService.messengerKey` is set at the root for outbox snackbars.
- **Theme tokens** (`config/theme.dart`): `primaryBlue #005D90`, `ink #0f172a`, severity scale Low/Mid/High/Crit with fixed hexes; shared `MapPanel`, `StaggerIn`, `surfaceShadow` primitives — reuse these instead of redefining colors/shadows per screen.
- **Run:** `flutter run` from `mobile/`; `flutter analyze`, `flutter test`.

## ML (`ml/`)

- YOLO (ultralytics) object detection; `data.yaml` defines 5 classes: `composite_packaging`, `plastic`, `metal`, `glass`, `styrofoam`.
- `detect.py` / `try_detection.py` for inference; `weights/` holds trained weights; `dataset/` train/val/test split.

## Cross-Cutting Concepts

- **Pipeline:** image uploaded (drone flight or report) → Cloudinary storage → YOLO detection → detections get GPS → DBSCAN clustering → severity (Low/Mid/High/Crit) → maps/heatmaps/reports.
- **Severity scale (single source of truth in mobile theme):** count > 10 = Critical `#b91c1c`, > 5 = High `#ea580c`, > 2 = Mid `#eab308`, else Low `#22c55e`.
- **Roles:** `guest` (0) / `community` (1) / `admin` (2) — enforced on backend via `require_role`, on web via `ProtectedRouteHelper`.
- **Offline-first mobile:** sqflite cache + outbox queue (`sync_services.dart`) flushed when connectivity returns.
- **Deploys:** main auto-deploys backend → Railway (Railway CLI; also triggered by `ml/**`, `Dockerfile`, `railway.toml`) and portal → Cloudflare Pages (wrangler) via `.github/workflows/deploy-main.yml`, path-filtered per job.
- **Android release:** `mobile/android/app/build.gradle.kts` signs release builds from `mobile/android/key.properties` + upload keystore; falls back to debug signing when the keystore is absent (local/CI), so release builds must not ship from a machine without the keystore.

## Gotchas

- `backend/.env` exists in the repo tree (config.py loads it) — never commit real secrets from it.
- `main.py` inserts the project root into `sys.path`; run uvicorn from inside `backend/`.
- Web is TypeScript-strict: `npm run build` runs `tsc -b` — typecheck before handing off.
- Flutter package name is `TrashVision` (capital T, V) — imports read `package:TrashVision/...`.
