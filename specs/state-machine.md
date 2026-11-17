# Spec: State Machine and Permissions

Status: approved · Terms: [`domain.md`](domain.md)

This spec defines **what is allowed**: who can see a report, who can create, edit and move it, and what is recorded. It is transport-independent: outcomes are named (`NOT_VISIBLE`, `FORBIDDEN`, …) and mapped to HTTP statuses only in [`http-api.md`](http-api.md).

Notation: an **actor** is `{ id, role }`. "Owner" means `actor.id == report.ownerId`.

---

## 1. Outcomes

Every operation ends in exactly one outcome:

| Outcome | Meaning |
|---------|---------|
| `OK` | The operation succeeds. |
| `NOT_VISIBLE` | The actor may not know the report exists. Indistinguishable from a non-existent report. |
| `FORBIDDEN` | The actor sees the report (or is creating one) but lacks permission for a non-transition action. |
| `NOT_EDITABLE` | The owner edits a report that is not in `draft`. |
| `ILLEGAL_TRANSITION` | The requested transition does not match a permitted row for this actor and state. |

Input validation (field formats, unknown states in `to`, etc.) happens before these rules and is defined in `http-api.md`.

## 2. Visibility

`canSee(actor, report)` is true when **any** of the following holds:

1. `actor.role == admin`; or
2. the actor is the owner (any role); or
3. `actor.role ∈ { manager, finance }` **and** `report.state != draft`.

Consequences:
- An `employee` sees only their own reports.
- `manager` and `finance` see every report except other people's drafts.
- `admin` sees everything, including other people's drafts.

**Rule V1.** If `canSee` is false, every operation on that report (read, list membership, audit read, edit, transition) results in `NOT_VISIBLE`, and the report is omitted from lists. Visibility is checked before any other rule in this spec: access first, then permissions, then state.

## 3. Creation

**Rule C1.** Only `actor.role == employee` may create a report. Any other role → `FORBIDDEN`. This includes `admin`.

Creation is a permission, not a state transition, so the admin rule (§4.2) does not apply to it.

Effects on success:
- A report is created with a new `id`, `ownerId = actor.id`, the given `title`, `amountCents`, `currency` (default `USD`), `state = draft`, `createdAt = updatedAt = now`.
- An audit event is appended: `from = null`, `to = draft`, `actorId = actor.id`, `role = actor.role`, `at = now`, no note.

## 4. Transitions

### 4.1 Transition table

| # | From | To | Allowed actor |
|---|------|----|---------------|
| T1 | `draft` | `submitted` | `employee` **and** owner |
| T2 | `submitted` | `draft` | `employee` **and** owner |
| T3 | `submitted` | `manager_approved` | `manager` |
| T4 | `submitted` | `rejected` | `manager` |
| T5 | `manager_approved` | `finance_approved` | `finance` |
| T6 | `manager_approved` | `rejected` | `finance` |
| T7 | `finance_approved` | `paid` | `finance` |

No other `(from, to)` pairs exist. In particular there are no transitions out of `paid` or `rejected`, and no transition from a state to itself.

### 4.2 Admin

**Rule A1.** `admin` may perform any row T1–T7, regardless of the "Allowed actor" column and of ownership. Admin may not perform any pair that is not in the table.

### 4.3 Decision

`decideTransition(actor, report, to)`:

1. If `!canSee(actor, report)` → `NOT_VISIBLE`.
2. Find the row with `from == report.state` and `to == to`. If none → `ILLEGAL_TRANSITION`.
3. If `actor.role == admin` → `OK`.
4. If the row's allowed actor matches (role, and ownership where required) → `OK`.
5. Otherwise → `ILLEGAL_TRANSITION`.

Because of step 1, the ownership condition in T1/T2 never decides an outcome on its own: a non-owner employee cannot see the report (`NOT_VISIBLE`), a non-owner manager or finance user already fails on role, and admin bypasses it (A1). The condition is kept as defence in depth, so the rule stays correct if visibility ever changes.

**Rule T-ROLE.** On a visible report, a wrong role is reported as `ILLEGAL_TRANSITION`, not `FORBIDDEN`. This follows the assignment's contract ("Else 409 ILLEGAL_TRANSITION") literally and is a deliberate deviation from the general HTTP convention of using 403 for permission failures.

### 4.4 Effects on success

In one atomic unit (both or neither):
- `report.state = to`, `report.updatedAt = now`.
- An audit event is appended: `from = previous state`, `to`, `actorId = actor.id`, `role = actor.role`, `at = now`, `note` if provided.

### 4.5 Notes

- A note is optional on every transition, including rejections.
- A note that is empty after trimming is treated as absent and not stored.

## 5. Draft owner edit

`decideEdit(actor, report)`:

1. If `!canSee(actor, report)` → `NOT_VISIBLE`.
2. If the actor is not the owner, or `actor.role != employee` → `FORBIDDEN`.
3. If `report.state != draft` → `NOT_EDITABLE`.
4. Otherwise → `OK`.

- Only `title` and `amountCents` can be changed. `currency`, `state`, `ownerId`, `id` and timestamps cannot be changed by an edit.
- Admin cannot edit other people's drafts (step 2). Rationale: edits are not audited, so an admin change of the amount would leave no trace.
- Permission (step 2) is checked before state (step 3): a manager editing a submitted report gets `FORBIDDEN`, the owner editing a submitted report gets `NOT_EDITABLE`.
- To change a submitted report, the owner first withdraws it (T2).

Effects on success: the given fields are updated and `report.updatedAt = now`. **No audit event is written** (the audit event shape describes state changes only).

Accepted consequence: an owner may withdraw a submitted report (T2), change the amount and resubmit, and the audit log will not show the edit. This is acceptable because withdrawal is only possible from `submitted` — before any approval — so the manager always reviews the current amount and can reject it; once a manager has approved, the amount can no longer change.

## 6. Audit rules

- **AU1.** Exactly one event is written for each successful creation and each successful transition.
- **AU2.** No event is written for edits, reads, or any failed operation.
- **AU3.** Events are append-only: never modified, never deleted by domain operations.
- **AU4.** A report's audit log is ordered by **insertion order** (the order in which events were appended), not by `at`. In normal time this is chronological; it stays coherent (each event's `from` equals the previous event's `to`) even if a test moves the clock backwards.
- **AU5.** Reading the audit log is subject to Rule V1.

## 7. Known limitations

- **Header trust.** The actor's id and role are taken as given. The same id can act under different roles (e.g. create as `employee`, then approve as `manager`). Self-approval is therefore not prevented. Preventing it requires authentication, which is a non-goal.
- **Visibility before "Else 409".** The contract says every forbidden transition is `ILLEGAL_TRANSITION`. Here a forbidden transition on a report the actor cannot see (another employee's report, a manager acting on someone's draft) is `NOT_VISIBLE` instead. Deliberate: access is checked first and hidden reports never reveal their existence. Risk: an autotest expecting `409` for these cases fails.
- **Creation outcome.** `(create)` appears in the assignment's table, yet a non-employee creating gets `FORBIDDEN` (not `ILLEGAL_TRANSITION`). Deliberate: creation does not move an existing report between states.

## 8. Reference scenarios

Actors: `H` = Harry (employee, owner), `G` = Hermione (employee, not owner), `M` = manager, `F` = finance, `A` = admin. Report owned by H.

| # | Report state | Actor | Operation | Outcome |
|---|--------------|-------|-----------|---------|
| 1 | — | H | create | `OK`, state `draft`, event `null → draft` |
| 2 | — | M | create | `FORBIDDEN` |
| 3 | — | A | create | `FORBIDDEN` |
| 4 | draft | H | → submitted | `OK` |
| 5 | draft | G | → submitted | `NOT_VISIBLE` |
| 6 | draft | M | read | `NOT_VISIBLE` |
| 6a | draft | M | → submitted | `NOT_VISIBLE` |
| 6b | draft | G | edit | `NOT_VISIBLE` |
| 6c | draft | H's id, role `manager` | → submitted | `ILLEGAL_TRANSITION` (visible as owner, role not `employee`) |
| 7 | draft | A | read | `OK` |
| 8 | draft | A | → submitted | `OK`, event actor = A, role `admin` |
| 9 | draft | H | → paid | `ILLEGAL_TRANSITION` |
| 10 | draft | H | edit | `OK`, no event |
| 11 | draft | A | edit | `FORBIDDEN` |
| 12 | submitted | H | edit | `NOT_EDITABLE` |
| 13 | submitted | M | edit | `FORBIDDEN` |
| 14 | submitted | H | → draft | `OK` |
| 15 | submitted | H | → manager_approved | `ILLEGAL_TRANSITION` |
| 16 | submitted | M | → manager_approved | `OK` |
| 17 | submitted | F | → manager_approved | `ILLEGAL_TRANSITION` |
| 18 | submitted | M | → rejected (no note) | `OK` |
| 19 | manager_approved | F | → finance_approved | `OK` |
| 20 | manager_approved | M | → finance_approved | `ILLEGAL_TRANSITION` |
| 21 | manager_approved | F | → rejected | `OK` |
| 22 | finance_approved | F | → paid | `OK` |
| 23 | finance_approved | M | → paid | `ILLEGAL_TRANSITION` |
| 24 | paid | F | → finance_approved | `ILLEGAL_TRANSITION` |
| 25 | paid | A | → draft | `ILLEGAL_TRANSITION` |
| 26 | rejected | A | → submitted | `ILLEGAL_TRANSITION` |
| 27 | submitted | M | → submitted | `ILLEGAL_TRANSITION` |
| 28 | submitted | G | read | `NOT_VISIBLE` |
| 28a | submitted | G | → draft | `NOT_VISIBLE` |
| 29 | submitted | M (id = H's id) | → manager_approved | `OK` (known limitation) |
