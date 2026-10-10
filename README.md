# TrashVision

![CI](https://img.shields.io/badge/CI-passing-brightgreen)
![web](https://img.shields.io/badge/web-build-brightgreen)
![flutter](https://img.shields.io/badge/flutter-analyze-blue)

TrashVision is a trash monitoring & reporting platform: drone/camera imagery is run through
an ML detection model, detections are clustered and visualized on maps (web + mobile), and
users file reports that admins manage.

## Repository layout

| Path       | What it is                                             |
|------------|-------------------------------------------------------|
| `backend/` | FastAPI REST API (Python) — auth, reports, detections, logs, areas, flights, chat |
| `web/`     | React 19 + Vite + Tailwind 4 admin portal (dashboard, map, reports, logs) |
| `mobile/`  | Flutter citizen app (reporting, offline sync, OSM map) |
| `ml/`      | YOLO training/inference (5 trash classes)             |

## Quick start

### Backend

```bash
cd backend
uvicorn main:app --reload
```

Migrations: `alembic upgrade head`.

The backend requires `backend/.env` with `DATABASE_URL`, `SECRET_KEY`, `CLOUDINARY_*`,
`SMTP_EMAIL`, `SMTP_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL_NAME`.

### Web

```bash
cd web
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build  ← typecheck happens here
npm run lint       # ESLint 9
npm run preview    # preview the built app
```

### Mobile

```bash
cd mobile
flutter run
flutter analyze
flutter test
```

## Architecture

**Backend** — FastAPI + Uvicorn + SQLAlchemy + PostgreSQL. Config uses `pydantic-settings`
(`backend/config.py` reads `backend/.env`). Migrations run through Alembic
(`backend/migrations/versions/`).

Routers (prefix → file): `/auth` auth, `/detections` detections, `/mobile/map` mobile_map,
`/reports` reports, `/logs` logs, `/areas` areas, `/flights` flights, `/users` users,
`/gemini` chat.

Auth is role-based: `guest` < `community` < `admin`. Backend guards endpoints with
`require_role()` / `get_current_active_admin` from `dependency.py`; web gates admin routes
with `ProtectedRouteHelper`; mobile has no admin surface.

**Web** — React 19 + TypeScript + Vite + Tailwind 4 + react-router-dom 7 + axios +
react-hot-toast. Map is Leaflet + react-leaflet + leaflet.heat + @geoman-io/leaflet-geoman-free
(area drawing) + @turf/turf. Pages: `LandingPage`, `Dashboard`, `MapView`, `Reports`,
`TrashLogs`; admin-only: `AuthReport`, `Upload`, `Settings`, `DrawArea`. All routes are
lazy-loaded in `App.tsx`. Excel export uses `xlsx` (SheetJS), lazy-loaded.

**Mobile** — Flutter (Dart SDK ^3.10.1), Material 3, package name `TrashVision`. Uses dio +
http, flutter_secure_storage (JWT), flutter_dotenv, sqflite (offline cache), connectivity_plus
(offline sync), flutter_map + latlong2 (OSM maps), geolocator, image_picker/camera,
flutter_image_compress, jwt_decoder, lucide_icons. Theme tokens live in
`mobile/lib/config/theme.dart` (`primaryBlue`, `ink`, severity scale, `MapPanel`, `StaggerIn`).

**ML** — YOLO (ultralytics) object detection; `ml/data.yaml` defines 5 classes:
`composite_packaging`, `plastic`, `metal`, `glass`, `styrofoam`. Inference in `ml/detect.py`
/ `ml/try_detection.py`; weights in `ml/weights/`; dataset in `ml/dataset/`.

## Data pipeline

Image uploaded (drone flight or report) → Cloudinary storage → YOLO detection →
detections get GPS → DBSCAN clustering → severity (Low/Mid/High/Crit) → maps/heatmaps/reports.

Map severity is CCI with one scale everywhere (`algorithm_equations.md`). CCI = K · count /
geodesic cell area with K = 20; bands ≤2 / ≤5 / ≤10 / ≤20 / >20. Backend computes adaptive,
boundary-clipped hex cells + per-cell geodesic area (`mobile_service.calculate_hex_tiles`);
web math is in `useHexbins.ts`, mobile math in `mobile_map_models.dart` + `config/theme.dart`.
Map counts are detection rows; dedup belongs to DBSCAN Stage A/B in the pipeline, NOT map-level
clustering.

## Offline-first mobile

Mobile `sync_services.dart` queues reports offline; ensure new write endpoints stay
idempotent-friendly and don't assume instant connectivity.

## Secrets

Never commit real secrets from `backend/.env` or `mobile/.env`. Config comes from
`pydantic-settings` (backend) / `flutter_dotenv` (mobile).

## Gotchas

- `backend/.env` exists in the repo tree (`config.py` loads it) — never commit real secrets from it.
- `main.py` inserts the project root into `sys.path`; run uvicorn from inside `backend/`.
- Web is TypeScript-strict: `npm run build` runs `tsc -b` — typecheck before handing off.
- Flutter package name is `TrashVision` (capital T, V) — imports read `package:TrashVision/...`.

## CAVEATS

- This README used to be the stale Vite template shipped by Vite init; it has been rewritten
  to match the actual TrashVision project above. If the app stops matching this description,
  update the README — don't let it drift again.
