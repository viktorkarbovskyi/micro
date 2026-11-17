# Spec: Domain Model

Status: approved

This spec defines **what exists**: the vocabulary, roles, states and entities. It says nothing about who may do what ([`state-machine.md`](state-machine.md)) or how it is exposed over HTTP ([`http-api.md`](http-api.md)). Every other spec refers to the names defined here.

---

## 1. Glossary

| Term | Definition |
|------|------------|
| **Expense report** (report) | An employee's request to be reimbursed for an amount spent on work. |
| **Owner** | The user who created a report. Stored as `ownerId`; never changes. |
| **Actor** | The user performing the current action, identified by an id and a role. May differ from the owner. |
| **Role** | The capacity in which an actor acts: one of the four roles in §2. |
| **State** | The stage of a report's lifecycle: one of the six states in §3. |
| **Transition** | A change of a report's state from one state to another, permitted by a row of the transition table. Creation is treated as a transition from "no state" to `draft` for audit purposes only. |
| **Audit event** | An immutable record of one transition (§5). |
| **Audit log** | All audit events of one report, in order. |
| **Draft owner edit** | A change of a draft's `title` and/or `amountCents` by its owner. Not a transition. |
| **Visible** | A report is visible to an actor if the actor is allowed to know it exists (rules in `state-machine.md`). |
| **Hidden** | Not visible to the actor (outcome `NOT_VISIBLE` in `state-machine.md`). A hidden report is indistinguishable from a non-existent one. |
| **Terminal state** | A state with no outgoing transitions. |
| **Minor units** | The smallest unit of a currency (cents, kopiykas). Amounts are stored in minor units as integers. |
| **Demo user** | A predefined user that exists only so the UI can offer a login choice. Not used for authorization. |

## 2. Roles

| Role | Meaning |
|------|---------|
| `employee` | Staff member who claims expenses. |
| `manager` | First-level approver. |
| `finance` | Second-level approver; marks reports as paid. |
| `admin` | Administrator; may perform any transition listed in the table. |

- Role values are lowercase strings, exactly as written above.
- A role is supplied by the actor with each request; it is not stored per user for authorization purposes.

## 3. States

| State | Meaning | Terminal |
|-------|---------|----------|
| `draft` | Being prepared by the owner; the only editable state. | no |
| `submitted` | Waiting for the manager. | no |
| `manager_approved` | Approved by the manager, waiting for finance. | no |
| `finance_approved` | Approved by finance, waiting for payment. | no |
| `paid` | Reimbursed. | **yes** |
| `rejected` | Declined by the manager or finance. | **yes** |

Every report is in exactly one state at any time. A new report starts in `draft`.

## 4. Report

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (UUID) | Assigned by the system at creation. Immutable. |
| `ownerId` | string | The creator's actor id. Immutable. |
| `title` | string | Required. Trimmed of leading/trailing whitespace; 1–200 characters after trimming. |
| `amountCents` | integer | Required. Amount in minor units. `> 0` and a safe integer (`≤ 9 007 199 254 740 991`). No business upper limit. |
| `currency` | string | One of the supported currencies (§7). Defaults to `USD`. Immutable after creation. |
| `state` | State | Starts as `draft`. Changed only by transitions. |
| `createdAt` | timestamp | Set at creation. Immutable. |
| `updatedAt` | timestamp | Set at creation; updated on every draft owner edit and every transition. |

- A report has exactly these fields; no derived or nested data (e.g. owner name, audit log) is part of it.
- Text lengths (here, for `note`, and for the actor id) are counted as JavaScript string length (UTF-16 code units), the same as an HTML `maxLength`.
- Amounts are integers in minor units to avoid floating-point errors. `2350` with `USD` means $23.50.
- There is no business limit on the amount; implausible claims are handled by rejection in the workflow.

## 5. Audit event

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (UUID) | Assigned by the system. |
| `reportId` | string (UUID) | The report the event belongs to. |
| `from` | State or `null` | The state before the transition; `null` for creation. |
| `to` | State | The state after the transition. |
| `actorId` | string | The actor who performed the transition. |
| `role` | Role | The role the actor acted in. |
| `at` | timestamp | The time of the transition (from the clock, §6). |
| `note` | string, optional | Free-text comment; absent when not provided. 1–1000 characters after trimming. |

- Audit events are **append-only**: once written, an event is never modified or deleted by any domain operation.
- The only operation that removes events is a full data reset (see `http-api.md`), which is a maintenance operation outside the domain model.

## 6. Time

- All timestamps are ISO 8601 strings, normally in UTC with millisecond precision, e.g. `2026-11-13T10:00:00.000Z`. When the clock has been frozen by a test, timestamps are the frozen value (a string exactly as the test sent it; see `http-api.md` §4.1).
- The domain reads "now" from a **clock**, never directly from the system time. The clock's behaviour (real vs frozen time) is defined in `http-api.md`.

## 7. Supported currencies

The supported currencies are, in this order: `USD`, `EUR`, `UAH`. The default is `USD`. The list is defined once and used both for validation and for display.

## 8. Demo users

Predefined users for the UI's login choice. They have fixed ids that never change.

| Field | Type |
|-------|------|
| `id` | string (UUID) |
| `name` | string |
| `role` | Role |

| Name | Role |
|------|------|
| Harry Potter | `employee` |
| Hermione Granger | `employee` |
| Minerva McGonagall | `manager` |
| Griphook | `finance` |
| Albus Dumbledore | `admin` |

- Demo users are a **directory only**. The system never checks that an actor id belongs to a demo user, and never checks that the role an actor sends matches the demo user's role.
- Demo users are not reports or audit data; resets do not remove them.
- No demo reports are seeded; reports are created during the demo.
