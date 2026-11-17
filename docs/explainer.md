# Assignment Explainer: Expense Report State Machine

> Original assignment: [`../REQUIREMENTS.md`](../REQUIREMENTS.md).
> The decisions taken on top of it are written into the specs in [`specs/`](../specs/).
> This is a learning walkthrough, not a spec. The specs in `specs/` are written together: the author decides, the assistant drafts the text.

---

## 1. What this is, in one paragraph

We build a **backend (HTTP API) for expense reports**. An employee spent money on work (a taxi, a hotel, a client lunch) and wants it reimbursed. They create a **report**, and the report goes through approvals: first a manager, then finance, and only then is it paid. What can be done with a report, and **by whom**, depends on the **state** the report is in. These rules are given as a table, i.e. a **state machine**. Every transition between states is written to an **audit log**, whose entries are never changed or deleted.

The assignment requires no UI — only a server that answers HTTP requests exactly as the contract describes. It will most likely be checked by **automated tests** sending requests to the server; `/api/test/reset` and `/api/test/set-now` exist precisely for such tests. (We add a demo UI on top anyway — see `specs/ui.md`.)

---

## 2. Deliverables

| # | Deliverable | Where | What it is |
|---|-------------|-------|------------|
| 1 | At least **2 specs** | `specs/` | Documents that precisely describe system behaviour. **Graded.** |
| 2 | **Working implementation** | project code | A server that fulfils the HTTP contract |
| 3 | **Reflection** (≤ 1 page) | `REFLECTION.md` | What AI gave, what specs gave, where AI went wrong, where a spec helped |

The point of the exercise (**spec-driven development**): first state the rules precisely, then implement — possibly with AI — checking the implementation against the spec. The reflection is about exactly that: how the spec changed what AI produced.

---

## 3. Domain: who, what, how

### 3.1 Roles

The user "introduces themselves" with two HTTP headers on every `/api/reports*` request (and on admin reset):

```
X-User-Id: 3f2b...
X-User-Role: employee      # employee | manager | finance | admin
```

There is no real authentication (passwords, tokens, SSO) — it is explicitly a non-goal. The server simply **trusts** the headers. This is a simplification for a training project.

| Role | Real-life counterpart | Can do |
|------|-----------------------|--------|
| `employee` | staff member | creates own reports, edits drafts, submits and withdraws them |
| `manager` | line manager | approves or rejects submitted reports |
| `finance` | accounting | final approval, rejection, marking as paid |
| `admin` | administrator | may perform **any transition listed in the table** |

### 3.2 Report

```json
{
  "id": "6c1e...",
  "ownerId": "3f2b...",
  "title": "Airport taxi",
  "amountCents": 2350,
  "currency": "USD",
  "state": "draft",
  "createdAt": "2026-11-13T10:00:00.000Z",
  "updatedAt": "2026-11-13T10:00:00.000Z"
}
```

- `amountCents > 0` is the amount in **cents** as an integer: $23.50 = `2350`. Money is stored this way because floating-point numbers are imprecise (`0.1 + 0.2 = 0.30000000000000004`).
- `currency` defaults to `"USD"`. There is no currency conversion (FX is a non-goal).
- `ownerId` is taken from the creator's `X-User-Id`, not from the request body.
- Timestamps come from a **controllable clock** (see §5), not from `Date.now()`.

### 3.3 The state machine

```
          (create, employee)
                 │
                 ▼
               draft ◄─────────────┐
                 │                 │
          submit │ (owner)         │ withdraw (owner)
                 ▼                 │
             submitted ────────────┘
              │      │
              │      └──── reject (manager) ────┐
              ▼                                  ▼
       manager_approved ── reject (finance) ──► rejected   (terminal)
              │
              ▼  (finance)
       finance_approved
              │
              ▼  (finance)
             paid                                          (terminal)
```

| From | To | Who |
|------|----|-----|
| (create) | draft | employee |
| draft | submitted | employee **owner** |
| submitted | draft | employee **owner** (withdraw back to draft) |
| submitted | manager_approved | manager |
| submitted | rejected | manager |
| manager_approved | finance_approved | finance |
| manager_approved | rejected | finance |
| finance_approved | paid | finance |

Consequences:
- `paid` and `rejected` are **terminal**: no way out.
- No skipping steps: `draft → paid` is a 409, even for admin, because no such row exists.
- "employee owner" means **both** conditions: role `employee` and `X-User-Id == ownerId`. Another employee cannot submit someone else's report (in this project they cannot even see it, so they get `404` — see `specs/state-machine.md` §2).
- `admin` can perform **any row** of the table regardless of "Who", but cannot bypass the table: `paid → draft` is impossible for admin too.
- Everything else on a report you can see, with a known target state → **`409 ILLEGAL_TRANSITION`**. An unknown target such as `"banana"` is malformed input → `400`.

### 3.4 Editing

`PATCH` changes `title` and/or `amountCents`, **only while the report is in `draft`**. `state` is never changed by PATCH — only through `/transition`.

### 3.5 Audit

Every **successful transition**, and the creation of a report (`null → draft`), appends an event:

```json
{
  "id": "9a7d...",
  "reportId": "6c1e...",
  "from": "submitted",
  "to": "rejected",
  "actorId": "b41c...",
  "role": "manager",
  "at": "2026-11-13T12:00:00.000Z",
  "note": "No receipt"
}
```

**Append-only** means events are only ever added; there is no API to change or delete individual events; only a full reset (test or admin) wipes them all. It is the report's "black box": who did what, and when.

---

## 4. The HTTP contract: what goes where, and why

| Method & path | Body | Purpose |
|---------------|------|---------|
| `POST /api/test/reset` | `{ "now": "<ISO>" }` or `{ "now": <epoch ms> }` | delete **all** reports and audit events, freeze the clock |
| `POST /api/test/set-now` | `{ "now": "<ISO>" }` or `{ "now": <epoch ms> }` | freeze the clock at a time (data kept) |
| `POST /api/reports` | `{ title, amountCents, currency? }` | create a report in `draft` |
| `PATCH /api/reports/:id` | `{ title?, amountCents? }` | edit a draft |
| `POST /api/reports/:id/transition` | `{ to, note? }` | change state |
| `GET /api/reports/:id` | — | read a report |
| `GET /api/reports/:id/audit` | — | transition history → `{ "events": [...] }` |

A transition is requested by its **target state** (`to`), not by an action name (`"approve"`). The server takes `from` from the report's current state and looks up the `(from, to)` row in the table.

### How a request flows inside the server (transition example)

```
Client / test
   │  POST /api/reports/6c1e.../transition
   │  X-User-Id: b41c..., X-User-Role: manager
   │  { "to": "manager_approved" }
   ▼
[1] Router             → which handler to call (unknown → 404 / 405)
[2] Identity headers   → who is this (actorId, role) → 400
[3] Content type, JSON → 415 / 400
[4] Body validation    → is `to` a known state at all → 400
[5] State machine      → decideTransition(actor, report, to):
                         missing, or hidden from the actor? → 404
                         is there a row (from = report.state, to)?
                         does the role match (or admin)? the owner, if required?
                         no → 409 ILLEGAL_TRANSITION
[6] Mutate + audit     → report.state = to, updatedAt = now,
                         append audit event (one atomic transaction)
[7] Response           → 200 + updated report
```

The state machine rules (step 5) are best written as a **pure function** with no HTTP or database, `decideTransition(actor, report, to) → outcome`. It is easy to test in isolation, and it is exactly what `specs/state-machine.md` describes. The flow above is simplified; the full check order is in `specs/http-api.md` §1.3.

### Example scenario (curl)

```bash
curl -X POST localhost:3000/api/test/reset -H 'Content-Type: application/json' \
  -d '{"now":"2026-11-13T10:00:00.000Z"}'

curl -X POST localhost:3000/api/reports \
  -H 'X-User-Id: u-1' -H 'X-User-Role: employee' -H 'Content-Type: application/json' \
  -d '{"title":"Taxi","amountCents":2350}'
# → 201 { id: "<uuid>", state: "draft", currency: "USD", ... }

curl -X POST localhost:3000/api/reports/<uuid>/transition \
  -H 'X-User-Id: u-1' -H 'X-User-Role: employee' -H 'Content-Type: application/json' \
  -d '{"to":"submitted"}'
# → 200 { state: "submitted", ... }

curl -X POST localhost:3000/api/reports/<uuid>/transition \
  -H 'X-User-Id: u-1' -H 'X-User-Role: employee' -H 'Content-Type: application/json' \
  -d '{"to":"manager_approved"}'
# → 409 ILLEGAL_TRANSITION   (an employee cannot approve)

curl localhost:3000/api/reports/<uuid>/audit -H 'X-User-Id: u-1' -H 'X-User-Role: employee'
# → 200 { events: [ { from: null, to: "draft", ... }, { from: "draft", to: "submitted", ... } ] }
```

---

## 5. Why `/api/test/reset` and `/api/test/set-now` (controllable clock)

Tests need **deterministic** results: the same run must produce the same `createdAt` and `at` every time. So the server does not call `new Date()` directly; it reads time from a **clock** whose value the test sets:

- `reset { now }` wipes storage and sets "now" to `now`;
- `set-now { now }` moves "now" (e.g. "one hour later") without wiping data.

A test can then assert: "the submit event has `at` = `2026-11-13T11:00:00.000Z`".

The frozen clock does not tick on its own; several actions in a row get the same timestamp, which is expected. See `specs/http-api.md` §4.1 for how real time is used outside tests.

---

## 6. Ambiguities in the assignment

The assignment leaves many questions open: 403 vs 409 for a wrong role, missing headers, error body format, who can read which reports, whether creation is audited, whether a manager may approve their own report, and more. All of them were resolved in a structured interview; the answers are written into the specs, and the deliberate deviations from the contract are listed in `specs/http-api.md` §6.

Guiding rule: where the assignment says something explicitly, implement it **literally** (autotests are most likely written against the literal reading), except the deliberate deviations listed in `specs/http-api.md` §6. Where it is silent, make a reasonable decision and **write it down with its rationale**.

---

## 7. Glossary

### 7.1 Domain terms

| Term | Meaning |
|------|---------|
| **Expense report** | An employee's request to be reimbursed for money spent on work. |
| **Owner** (`ownerId`) | The user who created the report. |
| **Actor** (`actorId`) | The user performing the current action (from `X-User-Id`). May differ from the owner. |
| **Role** | The actor's role in a request: `employee`, `manager`, `finance`, `admin`. |
| **State** | The report's current stage: `draft`, `submitted`, `manager_approved`, `finance_approved`, `paid`, `rejected`. |
| **draft** | Work in progress; the only state in which the report can be edited. |
| **submitted** | Sent for manager approval. |
| **manager_approved** | Approved by the manager, awaiting finance. |
| **finance_approved** | Approved by finance, awaiting payment. |
| **paid** | Reimbursed. Terminal. |
| **rejected** | Declined by manager or finance. Terminal. |
| **Transition** | A move of a report from one state to another; one row of the table. |
| **Illegal transition** | A transition not in the table, or performed by the wrong role → `409 ILLEGAL_TRANSITION`. |
| **Role gate** | A check of whether a role is allowed to perform a transition. |
| **Audit event** | A record of one transition (or of creation): who, when, from which state to which, optional note. |
| **Audit log / trail** | The full sequence of a report's audit events. |
| **Append-only** | Records are only added, never changed or deleted. |
| **Note** | Optional comment on a transition (e.g. a rejection reason). |
| **amountCents** | Amount in the currency's smallest unit (cents), as an integer. |
| **Minor units** | General name for cents/pennies; money is stored in them to avoid floating-point errors. |
| **Terminal state** | A state with no outgoing transitions (`paid`, `rejected`). |
| **Withdraw** | `submitted → draft`: the owner pulls a submitted report back to fix it. |

### 7.2 General technical terms

| Term | Meaning |
|------|---------|
| **State machine (finite automaton)** | A model where an object is always in one of a known set of states, and moves between them only by explicit rules. |
| **Explicit state machine** | One whose rules are written down **explicitly** (a table/map in code), not scattered across `if`s. |
| **Spec (specification)** | A document that unambiguously describes how the system must behave: inputs, outputs, rules, errors, edge cases. |
| **Spec-driven development** | Write the spec first, then code (your own or AI-generated) that conforms to it. |
| **HTTP API** | An interface through which programs talk to a server via HTTP requests. |
| **HTTP contract** | The agreement on which endpoints exist, what they accept and what they return. Tests check exactly this. |
| **Endpoint** | A concrete API address: method + path, e.g. `POST /api/reports`. |
| **HTTP method** | The kind of action: `GET` (read), `POST` (create or perform an action), `PATCH` (partial update). |
| **Path parameter** (`:id`) | The variable part of a path: `/api/reports/abc` → `id = "abc"`. |
| **Request body** | The JSON the client sends (e.g. `{ "to": "submitted" }`). |
| **Header** | Request metadata (`X-User-Id`, `Content-Type`). The `X-` prefix traditionally marks a custom header. |
| **Status code** | Numeric result: `200` OK, `201` Created, `204` No Content, `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `405` Method Not Allowed, `409` Conflict, `415` Unsupported Media Type. |
| **403 Forbidden** | "The server understood who you are, but your permissions are insufficient" (RFC 9110). |
| **409 Conflict** | "The request conflicts with the current state of the resource" (RFC 9110). |
| **Error code** | A machine-readable string in the error body (`ILLEGAL_TRANSITION`) so clients can tell causes apart. Many codes can share one status. |
| **Problem Details** | RFC 9457 standard format for HTTP error bodies (`type`, `title`, `status`, `detail`, plus custom members). |
| **Validation** | Checking input (type, range, presence) before running business logic. |
| **Authentication** | "Who are you?" (absent here — we trust headers). |
| **Authorization** | "What are you allowed to do?" (role gates + ownership check). |
| **Ownership check** | Verifying `actorId == ownerId`. |
| **Timestamp** | A point in time, usually an ISO 8601 string: `2026-11-13T10:00:00.000Z`. |
| **ISO 8601** | The standard date-time format. A trailing `Z` means UTC. |
| **Clock / injectable clock** | An abstraction for "what time is it" that can be replaced; here controlled by `/api/test/set-now`. |
| **Deterministic** | Same input always gives the same result (including the same time). |
| **Test hooks / test endpoints** | Service endpoints that exist only for tests (`/api/test/*`). |
| **Reset** | Returning the system to a clean state between tests. |
| **Seed data** | Data inserted automatically at startup (here: the demo users). |
| **In-memory store** | Data kept in process memory; lost on restart. |
| **SQLite** | A database stored in a single file, with no separate server process. |
| **Transaction / atomic operation** | A group of changes that either all happen or none do (state change + audit event together). |
| **Pure function** | A function with no side effects whose result depends only on its arguments. Ideal for state machine rules. |
| **Idempotent** | Repeating the call gives the same result (`GET`, `reset`). `transition` is not idempotent. |
| **UUID** | A universally unique identifier, e.g. `3f2b6c1e-...`. |
| **Time box** | A fixed time limit for a task (here 1–3 days). |
| **Non-goals** | Things explicitly **not** to build, to keep focus. |
| **OCR** | Optical Character Recognition: reading text from a photo of a receipt. Not built. |
| **FX** | Foreign Exchange: currency conversion. Not built. |
| **SSO** | Single Sign-On: unified corporate login (Google/Okta). Not built; headers are used instead. |
| **Reflection** | A short write-up of the experience: what worked, what didn't, what was learned. |
