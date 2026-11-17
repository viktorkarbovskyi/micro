# Requirements — Expense Report State Machine

> Original assignment text, copied verbatim (only the table converted to Markdown).

## Goal

Expense reports driven by an explicit state machine with role gates and append-only audit.

## Time box

1–3 days.

## Required artifacts (trainee)

- At least two written specs you author yourself (store under `specs/` in your solution).
- Running implementation satisfying the HTTP contract.
- Short reflection (≤1 page) on AI vs specs.

You will not receive pre-written specs. Specs are a graded deliverable.

## Domain

Headers: `X-User-Id`, `X-User-Role` ∈ `employee|manager|finance|admin`.

Report: `id`, `ownerId`, `title`, `amountCents` (>0), `currency` (default USD), `state`, timestamps.

| From             | To               | Who            |
| ---------------- | ---------------- | -------------- |
| (create)         | draft            | employee       |
| draft            | submitted        | employee owner |
| submitted        | draft            | employee owner |
| submitted        | manager_approved | manager        |
| submitted        | rejected         | manager        |
| manager_approved | finance_approved | finance        |
| manager_approved | rejected         | finance        |
| finance_approved | paid             | finance        |

`admin` may perform any listed transition. Else `409 ILLEGAL_TRANSITION`. Edit title/amount only in draft. Audit event per transition: `{ id, reportId, from, to, actorId, role, at, note? }`.

## HTTP

- `POST /api/test/reset { now }` · `POST /api/test/set-now { now }`
- `POST /api/reports` · `PATCH /api/reports/:id` · `POST /api/reports/:id/transition { to, note? }`
- `GET /api/reports/:id` · `GET /api/reports/:id/audit → { events }`

## Non-goals

OCR, FX, SSO.
