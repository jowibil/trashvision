# Design Skills — Routing & Conflict Resolution

Ten design-related skills are installed. Their rules overlap and several flatly
contradict each other (fonts, motion budgets, eyebrow badges, dashboards). This
file is the arbiter: **scope decides which skill governs; ties break toward the
project's own conventions.**

## The skills and their scopes

| Skill | Governs | Does NOT govern |
| --- | --- | --- |
| `impeccable` | Master workflow: init/context, audit, critique, polish, harden, clarify, adapt. Most specific command wins. | Replacing a specific skill's craft rules when that skill is loaded |
| `animate` / `review-animations` / `find-animation-opportunities` / `improve-animations` | All motion decisions (Emil Kowalski) | Aesthetics, layout, color |
| `emil-design-eng` | UI craft review format + polish details when explicitly reviewing UI code | Whole-page design direction |
| `pick-ui-library` | Library selection (explicit invocation only) | Implementation |
| `design-taste-frontend` | Landing pages, portfolios, marketing-style redesigns | Dashboards, data tables, product UI (self-declared exclusion) |
| `redesign-existing-projects` | Audit-first upgrades of existing surfaces, any stack | Greenfield aesthetics |
| `minimalist-ui` | "Warm monochrome editorial" look — only when that direction is chosen | Default direction for existing surfaces |
| `industrial-brutalist-ui` | Deliberate brutalist/terminal direction — only when explicitly requested | Default direction; admin portal styling |
| `gpt-taste` | GSAP-heavy award-style marketing pages — only when explicitly requested | Product UI; anything without GSAP installed |
| `high-end-visual-design` | Generic "premium" flair | Overrides from skills with narrower scope |

## Hard conflicts and their resolutions

### 1. Fonts (three skills, three answers)
- `minimalist-ui`: bans Inter, prescribes editorial serif headings (Newsreader, Playfair…).
- `gpt-taste` / `high-end-visual-design`: ban Inter, prescribe Geist/Satoshi/Clash.
- `design-taste-frontend`: discourages Inter as default but allows it; sans-first.
- **Resolution:** TrashVision web already uses **Geist** (`AppLayout.tsx` loads it; treat this as the pinned brand choice). Do not swap fonts to satisfy a taste skill. `design-taste-frontend`'s discipline applies: sans display, no serif injection into sans headlines, no Fraunces/Instrument Serif defaults.
- Note: `design-taste-frontend` and `minimalist-ui` say self-host fonts and never link Google Fonts in production; we currently link Geist via `<link>`. When touching `AppLayout.tsx` for other reasons, self-host it — otherwise leave alone.

### 2. Icon libraries
- `minimalist-ui`, `redesign-existing-projects`, `high-end-visual-design`: discourage Lucide; want Phosphor etc.
- **Resolution:** the codebase standardizes on **lucide-react** (with direct path imports). `design-taste-frontend` explicitly allows an existing icon library. Keep Lucide; do not migrate icons as part of unrelated work. One family per project — never mix.

### 3. Motion intensity (biggest clash)
- `gpt-taste` / `high-end-visual-design`: GSAP pinning, scrubbing, stacking; entry animations on everything; 700–800ms transitions; "static is forbidden".
- `animate` (Emil): UI animations **under 300ms**, animate only what has a purpose, frequency-based gating, keyboard actions never animate.
- **Resolution:** `animate` **wins everywhere in product UI** (admin portal, chat, tables, map overlays — all "Operate" mode). GSAP/marquee/scrub techniques are allowed only on a marketing/landing surface if explicitly requested, and even there the `animate` duration/easing tables still apply to interactive elements. Do not install GSAP or Motion just to satisfy a skill; `animate` rule 5 is "cheapest tool that works", and the project has neither.
- Custom curves: use Emil's tokens (`--ease-out: cubic-bezier(0.23,1,0.32,1)`, etc.) if/when motion tokens are added — not the 700–800ms `cubic-bezier(0.32,0.72,0,1)` defaults from `high-end-visual-design`.

### 4. Eyebrows / badges above headings
- `design-taste-frontend`: max 1 eyebrow per 3 sections; most-violated rule.
- `high-end-visual-design`: mandates an eyebrow pill before every major H1/H2.
- `gpt-taste`: bans meta-labels ("SECTION 01") forever.
- **Resolution:** follow `design-taste-frontend` (≤1 per 3 sections, prefer zero). The mandate from `high-end-visual-design` is overridden.

### 5. Cards, borders, shadows
- `minimalist-ui`: every card exactly `1px solid #EAEAEA`, radius ≤ 12px.
- `high-end-visual-design`: mandates "double-bezel" nested shells and 2rem radii on everything.
- `design-taste-frontend`: cards only when elevation communicates hierarchy; one documented radius rule is fine.
- **Resolution:** `design-taste-frontend`'s restraint wins (this is product UI). Pick one radius scale project-wide when we standardize; do not adopt double-bezel or the universal `1px #EAEAEA` card.

### 6. Dashboards and data surfaces
- `design-taste-frontend` excludes dashboards from its own scope; `gpt-taste` and the taste skills are marketing-page machinery (AIDA, hero rules, marquees).
- `industrial-brutalist-ui` claims dashboards but demands CRT scanlines, hazard-red accents, uppercase-everything.
- **Resolution:** for the admin portal, the governing skills are **Impeccable (Operate mode) + `animate` + `emil-design-eng` + `redesign-existing-projects`**. The taste skills do not fire there. Brutalism only if the user explicitly asks for a "declassified blueprint" look, and then as a deliberate one-way redesign, not a polish pass.

### 7. Animation library guidance
- `design-taste-frontend` defaults to Motion (`motion/react`); `gpt-taste` defaults to GSAP.
- **Resolution:** neither is installed. For any new UI animation need, follow `animate`'s tool ladder (CSS transition → `@starting-style` → CSS animation → WAAPI → Motion). Motion may be introduced only if a gesture/exit-animation need is real, and it gets user sign-off as a new dependency.

### 8. enter/exit durations, stagger
- `high-end-visual-design` stagger delays (`delay-100..200`) and 800ms entry fades vs `emil-design-eng` stagger (30–80ms) and ≤300ms durations.
- **Resolution:** Emil's numbers. Product surfaces only; stagger is decorative and never blocks interaction.

## Tiebreakers (apply in order)

1. **Project conventions win over every skill.** `AGENTS.md` rules (Tailwind utilities, react-hot-toast, lazy routes, shared theme tokens, CCI map scale) are non-negotiable. No skill introduces a second toast library, second theme, or map-level clustering.
2. **Narrower scope beats broader.** `animate` beats `high-end-visual-design` on motion; `redesign-existing-projects` beats taste skills on existing surfaces.
3. **Accessibility is a floor, not a taste item.** WCAG AA contrast, focus rings, `prefers-reduced-motion`, `@media (hover:hover)` gating — every skill agrees on these; they are never traded away for aesthetics.
4. **Explicit user request beats any default here.** If the user asks for brutalist or GSAP style, that brief wins — flag the trade-offs once, then commit fully (no half-picked differences).
5. **When two skills still conflict at equal scope**, ask the user (per AGENTS.md collaboration rule) instead of averaging the styles.

## Per-surface quick reference (TrashVision web)

| Surface | Mode | Governing skills |
| --- | --- | --- |
| Admin portal (Dashboard, Reports, TrashLogs, MapView, Settings) | Operate | Impeccable (`polish`, `harden`, `audit`, `clarify`), `animate`, `emil-design-eng`, `redesign-existing-projects` |
| Landing / marketing page | Persuade | `design-taste-frontend` dials (VARIANCE 7 / MOTION 6 / DENSITY 4), Impeccable, `animate` limits on interactive elements |
| Chat widget | Operate (embedded) | `animate` (transitions not keyframes), `pick-ui-library` if rebuilt |
| Mobile (Flutter) | — | None of these skills; use `mobile/lib/config/theme.dart` tokens and the TrashVision mobile skills only |
