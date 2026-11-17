# Expense Reports

A small expense-report approval app: employees submit reports, managers and finance move them through a fixed state machine, and every transition is recorded in an audit trail. A Fastify + SQLite API and a React UI live in one npm-workspaces monorepo.

- [REQUIREMENTS.md](REQUIREMENTS.md) - the original assignment
- [specs/](specs/) - the specifications the code is built against
- [docs/explainer.md](docs/explainer.md) - an explainer of the project

## Prerequisites

Node 24.

## Commands

```sh
npm install        # install all workspaces
npm test           # run all workspace tests (shared, API, UI)
npm run typecheck  # type-check packages/shared, apps/api and apps/web
npm run dev        # API on port 3000 + Vite dev server; open the UI at the Vite URL printed in the terminal
npm start          # build the UI, then serve API + built UI on PORT (default 3000)
```

In `npm run dev`, keep `PORT` at 3000: the Vite dev proxy forwards `/api` to `http://localhost:3000`.

## Environment variables

| Variable  | Default          | Meaning                                                         |
|-----------|------------------|-----------------------------------------------------------------|
| `PORT`    | `3000`           | Port of the server (it listens on 127.0.0.1).                   |
| `DB_PATH` | `./data/app.db`  | SQLite file, relative to the repo root. `:memory:` is allowed.  |

## Demo users

There is no authentication. Log in by choosing a user in the dropdown on the login page.

| Name               | Role     |
|--------------------|----------|
| Harry Potter       | employee |
| Hermione Granger   | employee |
| Minerva McGonagall | manager  |
| Griphook           | finance  |
| Albus Dumbledore   | admin    |

The admin has a **Reset data** button that deletes all reports and history.

## Test endpoints

`POST /api/test/reset` (deletes all data, freezes the clock at `now`) and `POST /api/test/set-now` (freezes the clock). See `specs/http-api.md` section 4.

```sh
curl -X POST http://localhost:3000/api/test/reset -H 'Content-Type: application/json' -d '{"now":"2026-01-01T00:00:00Z"}'
```

**Warning:** the test endpoints and `POST /api/admin/reset` must be disabled if the app is ever exposed publicly. They are meant for local runs only.
