# CLAUDE.md

Expense report state machine: Fastify + SQLite API (`apps/api`), React demo UI (`apps/web`), shared constants and types (`packages/shared`). npm workspaces, Node 24.

## Commands

```sh
npm install
npm test                                  # all workspaces
npm test -w @app/api -- test/edit.test.ts  # one test file (also @app/web, @app/shared)
npm run typecheck
npm run dev                               # API :3000 + Vite dev server
npm start                                 # build UI, serve API + UI on :3000
```

## Rules

- `specs/` is the single source of truth. `REQUIREMENTS.md` is the original assignment; `specs/http-api.md` §6 lists where the specs deliberately deviate from it.
- Order of work: spec → tests → code. A behaviour change that is not in the specs is not done.
- If a change matters and differs from the specs, update the spec in the same change. Docs and code must never disagree.
- If the specs do not answer a question and the answer changes behaviour, ask; do not guess.
- Discuss a decision until it is final, then update docs and code once. Do not edit files while the user is still thinking aloud.
- Build only what the specs describe; no extra features.
- API tests run with `TZ=America/New_York` on purpose; keep it, it catches time-zone bugs.
- The test endpoints and `POST /api/admin/reset` are for local runs only (`specs/http-api.md` §4); the server listens on `127.0.0.1`.
