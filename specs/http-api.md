# Spec: HTTP API

Status: approved · Terms: [`domain.md`](domain.md) · Rules: [`state-machine.md`](state-machine.md)

This spec defines **how the system is reached**: endpoints, headers, request/response shapes, status codes and error bodies. Business rules are not repeated here; outcomes from `state-machine.md` are mapped to HTTP.

Endpoints marked **(extension)** go beyond the assignment's contract and exist for the demo UI.

---

## 1. Conventions

- Base path: `/api`. All bodies are JSON (`application/json`), except error bodies (`application/problem+json`) and `204` responses (no body).
- Timestamps: ISO 8601 UTC with milliseconds (`2026-11-13T10:00:00.000Z`), except while the clock is frozen by a test: then the frozen value (a string exactly as the test sent it; see §4.1).
- Sorting and date filtering compare **instants**, never timestamp strings (the server keeps a parsed instant alongside each returned string).
- Unknown JSON fields in a request body are rejected (`400 VALIDATION_ERROR`), except on `POST /api/admin/reset`, whose body is ignored (§5). Unknown query parameters are rejected the same way.

### 1.1 Identity headers

| Header | Rule |
|--------|------|
| `X-User-Id` | Required. Non-empty after trimming; at most 100 characters. Used trimmed. |
| `X-User-Role` | Required. Exactly `employee`, `manager`, `finance` or `admin` (lowercase). |

- Required on every `/api/reports*` endpoint and on `POST /api/admin/reset`.
- Not required and not inspected on `/api/test/*`, `GET /api/users`, `GET /api/currencies`.
- Missing or invalid → `400 INVALID_HEADERS`.
- The server trusts these headers and does not check them against the demo users.

### 1.2 Error body (RFC 9457 Problem Details)

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Cannot transition from paid to finance_approved",
  "code": "ILLEGAL_TRANSITION"
}
```

- `type`: always `about:blank`. `title`: the standard reason phrase of `status`. `detail`: human-readable explanation. For `VALIDATION_ERROR` it names the failing fields, e.g. `Request body is invalid: title must be 1–200 characters after trimming`.
- `code`: machine-readable error code (§1.4). Always present.
- `errors`: present only for `VALIDATION_ERROR`; a list of `{ "field": string, "message": string }`. `field` is the body field or query parameter name (e.g. `amountCents`, `state`), or `body` for an error about the body as a whole (not a JSON object, or an empty `PATCH`).

### 1.3 Check order

The server stops at the first failing check:

1. Route and method → `404 NOT_FOUND` / `405 METHOD_NOT_ALLOWED`
2. Identity headers (where required) → `400 INVALID_HEADERS`
3. Content type and JSON parsing (endpoints with a body) → `415 UNSUPPORTED_MEDIA_TYPE` / `400 INVALID_JSON`
4. Body and query validation → `400 VALIDATION_ERROR`
5. Visibility → `404 NOT_FOUND`
6. Permission for a non-transition action (create, edit, admin reset) → `403 FORBIDDEN`. A wrong role on a transition is not checked here; it is `409` at step 7.
7. State → `409 ILLEGAL_TRANSITION` / `409 REPORT_NOT_EDITABLE`

Validation (4) runs before visibility (5). This leaks nothing: a non-existent and a hidden report with an invalid body receive the same `400`.

### 1.4 Error codes

| Status | `code` | When |
|--------|--------|------|
| 400 | `INVALID_HEADERS` | Identity headers missing or invalid. |
| 400 | `INVALID_JSON` | Body is not parseable JSON. |
| 400 | `VALIDATION_ERROR` | Body or query fails validation (wrong type, missing, out of range, unknown field/param, unknown state). |
| 403 | `FORBIDDEN` | `state-machine.md` outcome `FORBIDDEN`; non-admin calling admin reset. |
| 404 | `NOT_FOUND` | Unknown route; report does not exist; `state-machine.md` outcome `NOT_VISIBLE`. |
| 405 | `METHOD_NOT_ALLOWED` | Known path, unsupported method. Response includes an `Allow` header. |
| 409 | `ILLEGAL_TRANSITION` | `state-machine.md` outcome `ILLEGAL_TRANSITION`. |
| 409 | `REPORT_NOT_EDITABLE` | `state-machine.md` outcome `NOT_EDITABLE`. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Endpoint expects a JSON body and the media type is missing or not `application/json` (case-insensitive; parameters such as `charset=utf-8` ignored). |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds the server's size limit. |
| 500 | `INTERNAL_ERROR` | Unexpected server fault. No internal details in `detail`. |

Other errors raised by the HTTP framework itself before our checks (e.g. a malformed `Content-Length`) keep their standard status and get a `code` derived from its reason phrase (e.g. `400 BAD_REQUEST`). A non-canonical path (e.g. `/api//reports`, `/api/%2e%2e/x`) names no resource → `404 NOT_FOUND`.

A report id in the path that is not a well-formed UUID is treated as non-existent: `404 NOT_FOUND` at the visibility step (§1.3 step 5), not as a validation error. Exception: an id the router cannot accept at all (longer than 1000 characters, or with malformed percent-encoding) gets `404 NOT_FOUND` immediately after the identity-header check, without the 405, 415 or 400 checks.

### 1.5 Representations

**Report**

```json
{
  "id": "6c1e2f0a-…",
  "ownerId": "3f2b9d14-…",
  "title": "Airport taxi",
  "amountCents": 2350,
  "currency": "USD",
  "state": "draft",
  "createdAt": "2026-11-13T10:00:00.000Z",
  "updatedAt": "2026-11-13T10:00:00.000Z"
}
```

**Audit event**

```json
{
  "id": "9a7d…",
  "reportId": "6c1e2f0a-…",
  "from": "submitted",
  "to": "rejected",
  "actorId": "b41c…",
  "role": "manager",
  "at": "2026-11-13T12:00:00.000Z",
  "note": "No receipt"
}
```

`from` is `null` for the creation event. `note` is omitted when absent.

---

## 2. Reports

### 2.1 `POST /api/reports` — create

Body:

| Field | Required | Validation |
|-------|----------|------------|
| `title` | yes | string; trimmed; 1–200 characters |
| `amountCents` | yes | JSON number; integer; `> 0`; safe integer. Strings (`"2350"`), fractions, `0`, negatives → invalid |
| `currency` | no | one of the supported currencies; default `USD` |

Any other field → `400 VALIDATION_ERROR`.

| Result | Response |
|--------|----------|
| Created | `201 Created`, header `Location: /api/reports/{id}`, body: report |
| Actor role is not `employee` | `403 FORBIDDEN` |

Side effect: creation audit event (`state-machine.md` §3).

### 2.2 `PATCH /api/reports/:id` — edit a draft

Body: at least one of

| Field | Validation |
|-------|------------|
| `title` | as in 2.1 |
| `amountCents` | as in 2.1 |

Empty body `{}` or any other field (including `currency`) → `400 VALIDATION_ERROR`.

| Result | Response |
|--------|----------|
| Updated | `200 OK`, body: report |
| Not visible / not found | `404 NOT_FOUND` |
| Not the owner, or role not `employee` | `403 FORBIDDEN` |
| Owner, report not in `draft` | `409 REPORT_NOT_EDITABLE` |

No audit event.

### 2.3 `POST /api/reports/:id/transition` — change state

Body:

| Field | Required | Validation |
|-------|----------|------------|
| `to` | yes | one of the six states; anything else (missing, unknown such as `"banana"`) → `400 VALIDATION_ERROR` |
| `note` | no | string or `null`; trimmed; at most 1000 characters; `null` or empty after trimming = absent |

| Result | Response |
|--------|----------|
| Transitioned | `200 OK`, body: updated report |
| Not visible / not found | `404 NOT_FOUND` |
| Visible, but no permitted row for this actor and state | `409 ILLEGAL_TRANSITION` |

Side effect: audit event (`state-machine.md` §4.4).

### 2.4 `GET /api/reports/:id` — read

| Result | Response |
|--------|----------|
| Found and visible | `200 OK`, body: report |
| Not visible / not found | `404 NOT_FOUND` |

### 2.5 `GET /api/reports/:id/audit` — audit log

| Result | Response |
|--------|----------|
| Found and visible | `200 OK`, body: `{ "events": [ … ] }` in insertion order (`state-machine.md` AU4) |
| Not visible / not found | `404 NOT_FOUND` |

### 2.6 `GET /api/reports` — list (extension)

Query parameters (all optional):

| Param | Format | Filter |
|-------|--------|--------|
| `q` | string | case-insensitive substring of `title` **or** of `id` |
| `state` | state; repeatable (`?state=submitted&state=paid`) | report state is any of the given states |
| `createdFrom` | ISO 8601 date-time (with `Z`, an offset, or no offset = UTC) | `createdAt >= createdFrom` |
| `createdTo` | ISO 8601 date-time (same forms) | `createdAt <= createdTo` |
| `ownerId` | string | `ownerId` equals the value |

- Filters combine with AND; values of one repeatable filter combine with OR; an omitted filter, or one whose value is an empty string (e.g. `?state=`, `?q=`), does not restrict.
- Visibility (`state-machine.md` §2) always applies first: the result contains only reports visible to the actor, whatever the filters say.
- Unknown parameter, unknown state, malformed timestamp, or a parameter other than `state` given more than once → `400 VALIDATION_ERROR`.
- Sorted by `createdAt` descending, ties by `id` ascending. No pagination.

Response: `200 OK`, body `{ "reports": [ … ] }`.

---

## 3. Reference data (extensions)

### 3.1 `GET /api/users`

No identity headers. Returns the demo users (`domain.md` §8):

`200 OK`, body `{ "users": [ { "id", "name", "role" }, … ] }` in the order listed in `domain.md`.

### 3.2 `GET /api/currencies`

No identity headers. Returns the supported currencies (`domain.md` §7):

`200 OK`, body `{ "currencies": ["USD", "EUR", "UAH"], "default": "USD" }`.

---

## 4. Clock and test endpoints

### 4.1 Clock behaviour

- Initially the clock returns real time (ISO 8601 UTC with milliseconds).
- `POST /api/test/reset` and `POST /api/test/set-now` **freeze** the clock at the given `now`. A frozen clock does not advance; consecutive operations receive the same timestamp.
- `now` may be sent as an ISO 8601 date-time string `YYYY-MM-DDTHH:mm[:ss[.fraction]][Z|±hh:mm]` (seconds optional; offset as `±hh:mm`; without an offset it is interpreted as UTC) or as an integer number of epoch milliseconds (a JSON number, not a string). Fractional seconds may have any number of digits; for ordering and filtering they are truncated (not rounded) to milliseconds. `T` and `Z` may be lowercase (RFC 3339). The same string forms apply to `createdFrom`/`createdTo` (§2.6).
- While frozen, the clock returns `now` **exactly as sent** when it was a string (e.g. `"2026-01-01T00:00:00Z"` is stored and returned unchanged), and the millisecond ISO form when it was a number. A test can therefore compare `createdAt` / `at` with its own `now` value as strings.
- The clock stays frozen until the next `reset`/`set-now`, an admin reset (§5), or a server restart — after the last two it returns to real time.
- Moving time backwards is allowed. The server must keep working (e.g. `updatedAt < createdAt` is acceptable).

### 4.2 `POST /api/test/reset`

Body: `{ "now": <ISO 8601 string | epoch ms> }`. No identity headers.

- Deletes all reports and audit events. Demo users are kept.
- Freezes the clock at `now`.
- `200 OK`, body `{ "now": <the value the frozen clock returns, §4.1> }`. Missing or malformed `now` → `400 VALIDATION_ERROR`.

### 4.3 `POST /api/test/set-now`

Body: `{ "now": <ISO 8601 string | epoch ms> }`. No identity headers.

- Freezes the clock at `now`. Data is untouched.
- `200 OK`, body `{ "now": <the value the frozen clock returns, §4.1> }`. Missing or malformed `now` → `400 VALIDATION_ERROR`.

These endpoints return `200` with a body rather than `204`, so that a test asserting a `200` status or `res.ok` passes.

Test endpoints are always enabled in local runs. They — and `POST /api/admin/reset` (§5), which is guarded only by trusted headers — must be disabled if the application is ever exposed publicly.

---

## 5. `POST /api/admin/reset` (extension)

Identity headers required. Any request body and `Content-Type` are ignored (the UI sends neither).

| Result | Response |
|--------|----------|
| Actor role is `admin` | `204 No Content` |
| Any other role | `403 FORBIDDEN` |

Effects: deletes all reports and audit events, keeps demo users, returns the clock to real time.

**Append-only exception.** This is a maintenance operation outside the domain model, used to clean up after testing and demos. It wipes the whole data set; it never removes or alters individual events while the system is in use. `/api/test/reset` is not reused here because it freezes the clock.

---

## 6. Deliberate deviations and autotest risks

| Case | This API | Convention | Why |
|------|----------|------------|-----|
| Wrong role on a transition (visible report) | `409 ILLEGAL_TRANSITION` | `403` | The assignment's contract says "Else 409 ILLEGAL_TRANSITION". |
| Unknown target state in `to` | `400 VALIDATION_ERROR` | — | Malformed input, not a transition. Risk: an autotest may read "Else 409" as covering it. |
| Supported currencies only (`USD`, `EUR`, `UAH`) | `400 VALIDATION_ERROR` for others | — | The contract only gives the default. Risk: an autotest creating with another currency fails. |
| Unknown body fields / query params | `400 VALIDATION_ERROR` | — | Strict input. Risk: an autotest sending extra fields fails. |
| Non-employee (including admin) creates a report | `403 FORBIDDEN` | — | Creation registers a new entity; it is not a state transition. Risk: an autotest reading `(create)` as a table row may expect `409`, or `201` for admin. |
| Hidden report (any operation: read, audit, edit, transition) | `404 NOT_FOUND` | `403`; the contract's "Else 409" for transitions | RFC 9110 §15.5.4 allows 404 to hide a resource's existence; access is checked first. Risk: the contract has no read restriction; an autotest may expect `200` for a read, or `409` for a transition, when another employee or a manager acts on a report they cannot see. |
| Non-owner edit (including admin) | `403 FORBIDDEN` | — | Only the owner edits; edits are not audited (`state-machine.md` §5). Risk: an autotest may expect an admin edit to succeed. |
| Creation audit event | event `null → draft` on create | — | Creation is recorded like a transition (`state-machine.md` §3). Risk: an autotest counting events after one transition sees one extra. |
| Input limits | title ≤ 200, note ≤ 1000, `X-User-Id` ≤ 100, `amountCents` a JSON integer, `PATCH {}` rejected → `400` | — | Strict input. Risk: an autotest sending values outside these gets `400`. |
| Owner edits a non-draft | `409 REPORT_NOT_EDITABLE` | — | Editing is not a transition, so it gets its own code. Risk: an autotest may expect the code `ILLEGAL_TRANSITION` (status matches). |
| Body without `application/json` | `415 UNSUPPORTED_MEDIA_TYPE` | — | RFC 9110. Risk: an autotest sending JSON without the header would fail. |
| Missing identity headers | `400 INVALID_HEADERS` | `401` | 401 requires a `WWW-Authenticate` challenge; there is no authentication scheme. |
| Error code field | `code` member of Problem Details | — | Risk: an autotest may look for the code under another field name; changing it is a one-place change. |
| Header trust | no identity verification | authentication | Authentication (SSO) is a non-goal (`state-machine.md` §7). Risk: role spoofing and self-approval through the API. |
| Admin reset deletes audit events | allowed (§5) | append-only audit | Maintenance operation outside the domain model. Formally breaks append-only. |
