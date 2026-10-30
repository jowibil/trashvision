# Railway Migration Checklist (Fly.io → Railway)

Runbook for moving the backend deploy from Fly (`trashvision-api`, trial
expired) to Railway (Hobby plan). Items marked `[code]` are repo changes that
remain to be made — **none have been applied yet**; everything else is
Railway-dashboard/manual work.

Ground truth in this repo: `fly.toml`, `Dockerfile` (cmd listens on port 8080),
`.github/workflows/deploy-main.yml`, `backend/.env` (real values — never
commit), mobile app base URL in `mobile/.env`.

---

## Phase 1 — Railway setup (no code)

- [ ] 1. Create/upgrade Railway account to the **Hobby plan** ($5/mo).
- [ ] 2. Create a project; add a service named `trashvision-api` connected to
      this GitHub repo, **or** create a **Service token** for CLI-driven
      deploys (Phase 3 depends on which you choose).
- [ ] 3. Add the variables the backend expects (copy from `backend/.env` —
      never commit them):
  - `DATABASE_URL` (Neon **pooled** URL) and `DATABASE_URL_UNPOOLED`
    (Neon **unpooled** — migrations need it)
  - `SECRET_KEY`, `CLOUDINARY_*`, `SMTP_*`, `GEMINI_*`, `SENTRY_DSN`
  - `CORS_ORIGINS` (unchanged — the portal stays on Cloudflare Pages)
  - `SWEEP_ENABLED`, `TEMP_CLEANER_ENABLED`, `TEMP_FILE_MAX_AGE_HOURS`
    and any other params `backend/config.py` reads with no sane default
- [ ] 4. Create the **volume** and mount it at `/app/backend/temp`
      (~3 GB, mirroring Fly's `trashvision_temp`). This pins the service to a
      single replica.
- [ ] 5. Set service resources: 2 vCPU / 2 GB to match Fly today
      (can downsize to 1 vCPU / 1 GB at expected traffic).
- [ ] 6. Pick the **region** closest to users (check which Asia regions exist
      on the Hobby plan tier before committing).
- [ ] 7. Generate the service **domain** (`*.up.railway.app`) and note the
      exact URL — it feeds Phase 2/3 and the mobile app.
- [ ] 8. Connectivity stopgap for early testing: set `PORT=8080` as a
      variable (the Dockerfile CMD currently hardcodes `--port 8080`, while
      Railway injects its own `PORT`). Proper fix is item 9.

## Phase 2 — Code changes (waiting on go-ahead)

- [ ] 9. `[code]` `Dockerfile` CMD → listen on `${PORT:-8080}` so Railway's
      injected port is honored.
- [ ] 10. `[code]` Create `railway.toml`:
  - `[build] dockerfilePath = "Dockerfile"`
  - `[deploy] releaseCommand` running `alembic upgrade head` against the
    unpooled URL — same trick as Fly's `release_command`:
    `DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}"`
  - healthcheck path `/` (the root endpoint already returns 200)
- [ ] 11. `[code]` `deploy-main.yml` backend job: replace
      `setup-flyctl` + `flyctl deploy` with `@railway/cli` +
      `railway up --service trashvision-api`, env
      `RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}`; update the
      paths-filter list (`fly.toml` → `railway.toml`).
- [ ] 12. `[code]` Same workflow, web job: `VITE_API_URL` → the Railway
      domain from step 7 (portal calls the API directly, so it must match
      exactly).
- [ ] 13. `[code]` Decide the fate of `fly.toml` — delete it (git history
      keeps it) or leave it dormant. No behavior impact either way.

## Phase 3 — CI wiring

- [ ] 14. GitHub repo → Settings → Secrets: remove `FLY_API_TOKEN`, add
      `RAILWAY_TOKEN` (from step 2).
- [ ] 15. Push a backend-only change to `main` (or use `workflow_dispatch`)
      and watch the run: paths-filter → build → **migration job runs** →
      healthcheck passes → swap.

## Phase 4 — Client cutover

- [ ] 16. **Mobile**: edit `mobile/.env` — the API base URL still points at
      `trashvision-api.fly.dev` → change to the Railway domain. Warrants a
      new app build/distribution.
- [ ] 17. **Portal**: after step 12 merges and `main` is pushed, Cloudflare
      Pages redeploys automatically — just verify the new URL is embedded.
- [ ] 18. Any custom domain previously resolving at `*.fly.dev`: point the
      DNS record(s) at Railway or attach a custom domain to the Railway
      service so old references still resolve.

## Phase 5 — Verification (before touching Fly remnants)

- [ ] `GET /` and Swagger on the Railway URL respond 200
- [ ] Login works from web + mobile; no CORS errors (browser console)
- [ ] Community report with photo upload works end-to-end (Cloudinary keys
      valid, temp volume writable)
- [ ] A drone batch / Stage-B path runs once (YOLO loads from
      `ml/weights`; volume mount confirmed)
- [ ] Alembic is at head — release job logs show the migration ran
- [ ] Sentry receives a test event; sweep/reaper threads show signs of life
      in Railway logs
- [ ] Web portal map/chat/data flows all pull live data

## Phase 6 — Teardown / rollback plan

- [ ] 19. Once verified: Fly machine stays stopped (trial expired) — tidy
      Fly-only leftovers (billing UI) and treat `*.fly.dev` as dead.
- [ ] 20. Rollback escape hatch: keep `fly.toml` + old workflow lines in
      git history until confident; reverting is one `git revert` away.
