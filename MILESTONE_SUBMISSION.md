# Klints MVP1 — Frontend Milestone Submission

**Repository:** `DEV_KLINTS_FRONTEND`  
**Submission date:** 14 August 2026  
**Specification baseline:** Klints MVP1 Build Pack v1.2 / DCS v1.4.1  
**Purpose:** Client delivery of the current frontend milestone codebase for review and acceptance.

---

## 1. Executive summary

This repository contains the **Klints** product UI — a TanStack Start / React application that lets operators prove martech stack integrity, run consistency checks, assess architecture, manage pilots/workflows, and export governed assessment reports.

This milestone delivers a coherent operator experience wired to the companion backend (`DEV_KLINTS_BACKEND`), including:

- Auth (sign up, email verify, sign in, password reset) with guest/session handling
- Onboarding and connector connection flows
- Dashboard / overview and activity surfaces
- Data Consistency (DCS) views with run history, diffs, and period compare
- Architecture / lifecycle / opportunities / QA / handoff flows
- Workflow detail and fix / writeback-oriented UX
- Settings (workspace, team invites, honesty for unavailable areas)
- Assessment report PDF export integration

---

## 2. What is included (product surfaces)

| Route / area | Intent |
|--------------|--------|
| `/signin`, `/signup`, `/verify-email`, forgot/reset password | Account lifecycle |
| `/invite/accept` | Team invite acceptance |
| `/onboarding` | First-run connector setup |
| `/dashboard` | Operator overview |
| `/data-consistency` | DCS scoring, runs, compare |
| `/lifecycle` | Lifecycle cockpit |
| `/opportunities` | Opportunity tracker |
| `/workflow`, `/workflow/$id` | Pilot / workflow detail |
| `/fix` | Live fix bridge |
| `/integrations` | Connector management |
| `/settings` | Workspace + team |
| `/qa`, `/handoff`, `/activity` | QA, handoff, activity |

Stack: React, TanStack Router/Start, Vite, Tailwind-based design system.

---

## 3. Repository layout

```
DEV_KLINTS_FRONTEND/
├── package.json
├── vite.config.ts
├── src/
│   ├── routes/              # file-based routes (product screens)
│   ├── components/klints/   # Klints shell, steppers, product UI
│   ├── lib/                 # api, auth, domain data helpers
│   └── styles.css
├── public/
└── MILESTONE_SUBMISSION.md  # this file
```

---

## 4. How to run (local)

```bash
npm install          # or bun / pnpm — lockfiles included
cp .env.example .env # if present; otherwise point API base in src/lib/api.ts
npm run dev
```

Point the API client at a running **`DEV_KLINTS_BACKEND`** instance (default local API: `http://127.0.0.1:8000`).

---

## 5. Backend pairing

This UI expects the milestone backend in **`DEV_KLINTS_BACKEND`**:

- JWT auth (`Authorization: Bearer <access>`)
- DCS, architecture, orchestration, reports, writeback, and team invite APIs

Backend PRDs and scoring specs live under that repo’s `docs/` folder (submitted unchanged).

---

## 6. Security & secrets

- **Not included:** `.env`, local tokens, or production credentials.
- Do not commit real API keys or customer connector secrets.
- Stale JWTs are cleared on guest routes; login/register do not attach Bearer headers.

---

## 7. Acceptance notes for the client

1. This is a **milestone code submit** for product review — validate against a sandbox backend + connector.
2. Some areas intentionally surface “honesty” empty/unavailable states where backend capability is not yet live.
3. Companion backend: **`georgechief/DEV_KLINTS_BACKEND`**.
4. Suggested walkthrough: sign up → verify → connect → DCS → architecture → opportunity/workflow → export brief/PDF.

---

## 8. Suggested review path

1. Install deps and run against local backend
2. Complete auth + onboarding
3. Open Data Consistency and confirm run / compare UI
4. Open a workflow and Fix flow
5. Export assessment brief / PDF from the wired report path

---

*Submitted by the Klints engineering team for client milestone review.*
