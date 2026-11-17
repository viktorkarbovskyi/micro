# Spec: Demo UI

Status: approved · API: [`http-api.md`](http-api.md)

The assignment does not require a UI. This one exists to **demonstrate** the state machine: switching between people, moving a report through its lifecycle, and showing that the server — not the UI — enforces the rules.

Stack: React, shadcn/ui, Tailwind CSS, TanStack Table, Sonner. Dark theme only.

---

## 1. Principles

- **API only.** The UI reads and writes data exclusively through the HTTP API.
- **Deliberately leaky.** Action buttons depend on the user's **role only**, never on the report's state. Buttons for forbidden actions are shown on purpose; clicking them sends the request and the server's refusal is displayed. There is no toggle to hide them.
- **No duplicated rules.** The UI does not know the transition table. It knows only which buttons each role has and which target state each button requests.

## 2. Screens

1. **Login** — choose a demo user.
2. **Main** — header, filters, reports table.
3. **Report sidebar** — opens over the main screen when a row is clicked, or in create mode from **+ New report**.
4. **Reset confirmation dialog** — admin only.

## 3. Login

- A card with the app name "Expense Reports", the hint "Demo: choose who to sign in as", a dropdown of users from `GET /api/users` (shown as "Name — role"), and a **Sign in** button.
- The chosen user (`id`, `name`, `role`) is stored in `localStorage`. On load, if a stored user exists, the login screen is skipped.
- Every API request then carries `X-User-Id` = user id and `X-User-Role` = user role.

## 4. Header

- Contents, left to right: app name · (**+ New report**, employee only) · user name · role · (**Reset data**, admin only) · **Switch user**.
- **Switch user** clears the stored user and returns to login.
- The header is tinted by role in a badge-like style: a ~10% translucent background of the role color, the role name in that color as plain text (not a badge), a thin bottom border in the role color; the user name stays white.

| Role | Header color |
|------|--------------|
| employee | gray |
| manager | green |
| finance | gold |
| admin | purple |

## 5. Reports table

- Data: `GET /api/reports` with the current filters. The server applies visibility; the UI shows whatever it returns.
- Columns: **ID** (first 8 characters), **Title**, **Employee** (the report's owner: name from `GET /api/users`; the raw id if not a demo user), **Amount**, **State**, **Created**, **Updated**.
- The **Employee** column is hidden for employees.
- **State** is a colored badge with a human label:

| State | Label | Color |
|-------|-------|-------|
| `draft` | Draft | gray |
| `submitted` | Submitted | blue |
| `manager_approved` | Manager approved | violet |
| `finance_approved` | Finance approved | amber |
| `paid` | Paid | green |
| `rejected` | Rejected | red |

- **Amount** is formatted from minor units with thousands separators and two decimals, followed by the currency code: `1,234.56 USD`.
- Dates are shown in the viewer's local time zone. A timestamp without an offset (possible while the test clock is frozen) is read as UTC, as `http-api.md` §4.1 defines.
- Empty result: "No reports yet" (shown only once the list has loaded).
- Clicking a row opens the sidebar for that report.

## 6. Filters

Above the table, applied on change (the search box after a short pause of ~250 ms):

| Filter | Control | API param |
|--------|---------|-----------|
| Search | text input "Search by title or ID…" | `q` |
| State | multi-select of the six states | `state` (repeated) |
| Created | date range picker (from–to) | `createdFrom`, `createdTo` |
| Employee | select "All employees" + demo users with role `employee` (hidden for employees) | `ownerId` |

- Date range: the UI converts the local start of the "from" day and the local end of the "to" day (23:59:59.999) to UTC ISO timestamps. Both ends are inclusive.
- Empty filters are not sent.
- A **Clear filters** button appears when any filter is set and resets all of them.

## 7. Report sidebar

Contents, top to bottom:
1. Title, full id, owner name, close button.
2. State badge, amount (large), created and updated timestamps.
3. **Edit** (employee only) — see §8.
4. Optional **Note** text area and the role's transition buttons (§9).
5. **History** from `GET /api/reports/:id/audit`, newest first. Each entry: `From → To` (creation shown as `Created → Draft`), actor name (or raw id) · role · timestamp, and the note if present.

## 8. Editing

- Employees always see an **Edit** button (pencil icon + "Edit"), regardless of state — the same rule as the transition buttons: shown by role, leaky by state. On a non-draft the server answers `409 REPORT_NOT_EDITABLE`. Other roles do not see Edit (their `403` can be shown through the API, like creation).
- Edit switches the sidebar into edit mode: title and amount become inputs; currency is shown but locked; **Save** and **Cancel** buttons appear. While in edit mode the Note field and the transition buttons are hidden; History stays visible. Cancel returns to the normal view; a successful Save closes the sidebar (§12); a failed Save keeps edit mode open.
- The amount is prefilled as a plain decimal with `.` and two decimals (`1234.56`), converted from minor units as a string.
- **Save** sends `PATCH /api/reports/:id` with the changed fields. If nothing was changed, it sends the current `title` and `amountCents` (an empty body would be a `400`), so that Save on a non-draft report still shows the server's answer. On a non-draft report the server answers `409 REPORT_NOT_EDITABLE`, shown as an error toast.

## 9. Transition buttons

Each button sends `POST /api/reports/:id/transition` with its target state and the note (if non-empty).

| Role | Buttons → target state |
|------|------------------------|
| employee | **Submit** → `submitted`, **Withdraw** → `draft` |
| manager | **Approve** → `manager_approved`, **Reject** → `rejected` |
| finance | **Approve** → `finance_approved`, **Reject** → `rejected`, **Mark paid** → `paid` |
| admin | **Submit** → `submitted`, **Withdraw** → `draft`, **Manager approve** → `manager_approved`, **Finance approve** → `finance_approved`, **Reject** → `rejected`, **Mark paid** → `paid` |

Admin's six buttons are shown in three labelled groups, by the stage of the process: **Employee** (Submit, Withdraw), **Approval** (Manager approve, Finance approve, Reject), **Payment** (Mark paid). Other roles have 2–3 buttons and no groups.

All of a role's buttons are always shown, on every report. A button is disabled only while a request from this sidebar is in flight (to prevent double submits), never because of the report's state.

## 10. New report

- **+ New report** (employees only) opens the **same sidebar** used for report details, in create mode, so creating, viewing and editing all happen in one place. The sidebar shows: Title, Amount, Currency (select from `GET /api/currencies`, preselected with its `default`), and **Create** and **Cancel** buttons. No state, history or transition buttons are shown in create mode.
- **Create** sends `POST /api/reports`. On success the general rule applies (§12): success toast, table reloads, sidebar closes.
- Amount input accepts a decimal with `.` or `,` as separator and at most 2 decimal places (`23.50`, `23,5`, `100`). The UI converts it to integer minor units **from the string** — integer part × 100 plus the fraction padded to two digits (`19.99` → `1999`, `23,5` → `2350`) — never by floating-point multiplication (`19.99 * 100 = 1998.9999999999998`, which the server would reject). The same conversion is used when saving an edit.
- Input the UI cannot convert (letters, more than 2 decimals) is flagged in the form and not sent. Everything else is left to the server.

## 11. Admin reset

- **Reset data** (admin only) opens a confirmation dialog: "This will permanently delete all reports and history. Continue?" with **Cancel** and **Reset**.
- **Reset** sends `POST /api/admin/reset`. On success: success toast, empty table.

## 12. Feedback

- **Error** (any non-2xx response): red toast showing status, code and detail, e.g. `409 ILLEGAL_TRANSITION — Cannot transition from paid to finance_approved`. The sidebar stays open.
- **Success**: green toast; the table reloads; the sidebar closes. Texts:

| Action | Toast |
|--------|-------|
| → `submitted` | Report submitted |
| → `draft` | Report withdrawn |
| → `manager_approved` / `finance_approved` | Report approved |
| → `rejected` | Report rejected |
| → `paid` | Report marked as paid |
| Save | Report saved |
| Create | Report created |
| Reset | All data deleted |

- A network failure (no HTTP response) is shown as a red toast with the browser's error message. An error response whose body is not Problem Details JSON (e.g. from a proxy) is shown as `<status> HTTP_<status> — <status text>`.
