# TrashVision

TrashVision is a trash monitoring & reporting platform. Drone and camera imagery is screened
by an on-board detection model that spots trash from the air, and what it finds becomes live
maps, severity ratings, and community reports — aimed at making litter something you can
actually see, track, and act on.

## What it does

- **See trash from the sky** — drone flights are processed automatically and flagged
  detections are clustered into map views with severity levels.
- **Browse openly** — the portal's dashboard and maps are public by default: no account
  needed to look around.
- **Report from anywhere** — the citizen mobile app lets anyone photograph and report
  trash, and queued reports wait patiently while offline, then sync when a connection
  returns.
- **Manage the ask** — admins review reports, draw monitored areas, schedule flights, and
  export logs (including Excel).
- **Ask the assistant** — a built-in chatbot answers questions about the data.

## The parts

| Path       | In one line                                            |
|------------|--------------------------------------------------------|
| `backend/` | The API that does the work (includes the ML pipeline)  |
| `web/`     | The browser portal — dashboards, maps, admin tools     |
| `mobile/`  | The citizen app — reporting, offline sync, maps        |
| `ml/`      | The YOLO model that recognizes the trash classes       |

## Running it

```bash
cd backend && uvicorn main:app --reload   # the API (migrations: alembic upgrade head)
cd web && npm run dev                     # the portal
cd mobile && flutter run                  # the app
```

It's a live system, not just a repo: the API runs on Railway and the portal on
Cloudflare Pages, auto-deployed whenever `main` changes.

## Going deeper

- `AGENTS.md` — the house rules for working on this repo
- `knowledge.md` — architecture and stack details
- `docs/pipeline_explained.md` and `docs/algorithm_equations.md` — how detection
  and severity scoring actually work
- `docs/` — the written specs behind the detection pipeline and the map

Secrets live in environment files that are never committed — if you need credentials or
configuration, ask the team. Anyone contributing code should read `AGENTS.md` first.
