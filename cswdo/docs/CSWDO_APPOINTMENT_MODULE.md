# CSWDO Appointment & Scheduling Module — Documentation

**City Social Welfare and Development Office · Pasig City**
**Scope:** Online Appointment & Scheduling only (Queue Management remains a nav placeholder).

This document describes the **backend-integrated implementation**: a PHP 8 + PDO
appointment API serving the existing MariaDB `cswdo_db`, consumed by the Pasig-branded
single-page module. It covers the architecture, API reference, security model, business
rules, flows, test results, and assumptions of the current build.

---

## 1. Architecture

```text
project root/
├── cswdo_client_appointment_module.html   ← Client Portal (standalone; no cross-links)
├── cswdo_employee_appointment_module.html ← Employee Portal (standalone; no cross-links)
├── css/
│   ├── cswdo_client.css          ← Client design tokens + all client styling
│   └── cswdo_employee.css        ← Employee design tokens + components (badges, bars, panels)
├── js/
│   ├── cswdo_client.js           ← Client UI logic + live API layer (mock mirror as fallback)
│   └── cswdo_employee.js         ← Employee UI logic + live API layer (no mock data)
├── api/                           ← Server-side only (never exposed to the browser)
│   ├── config.php                 ← DB creds, capacity/session rules, demo identity, TEST_MODE
│   ├── bootstrap.php              ← Session, PDO, JSON envelope, server clock, identity resolution
│   ├── auth.php                   ← Identity endpoints (me [?scope=employee] / login / set / staff_login / logout)
│   └── appointments.php           ← client: overview / schedules / book / checkin / late_requeue /
│                                   reschedule / cancel / eligibility
│                                   employee: dashboard / queue / capacities / employee_checkin /
│                                   employee_requeue / serve / set_appointment_status / toggle_lock
├── seed/
│   └── seed_demo.php              ← Idempotent demo seeder (--reset supported)
├── test_api.sh                    ← Automated harness (70 assertions, 13 scenarios)
├── logo.webp                      ← Yellow City Seal (header, left-most)
├── pasig_logo.webp                ← Pasig Typography Logo (immediately after the seal)
├── cswdoDB.sql                    ← Schema source of truth (imported, never modified)
├── CSWDO_UI_Guide.html            ← Design system reference
└── CSWDO_APPOINTMENT_MODULE.md    ← This documentation
```

**Stack:** PHP 8.2 (XAMPP, `C:\xampp\php`) + MariaDB 10.4 (`cswdo_db`) + PDO with
prepared statements. One dev server serves both portals and the API:

```bash
# from the project root (XAMPP MariaDB must be running)
C:\xampp\php\php.exe -S 127.0.0.1:8792
# client portal:   http://127.0.0.1:8792/cswdo_client_appointment_module.html
# employee portal: http://127.0.0.1:8792/cswdo_employee_appointment_module.html
```

### Quick start (fresh machine)

```bash
# 1. Start MariaDB (XAMPP Control Panel, or:)
C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini --standalone

# 2. Import the schema (only if cswdo_db does not exist yet)
C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS cswdo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
C:\xampp\mysql\bin\mysql.exe -u root cswdo_db < cswdoDB.sql

# 3. Seed demo data (idempotent; --reset wipes and re-seeds with stable IDs)
C:\xampp\php\php.exe seed\seed_demo.php

# 4. Serve and open
C:\xampp\php\php.exe -S 127.0.0.1:8792
```

The page degrades gracefully: if the API cannot be reached (no PHP, MariaDB down), the
JS layer falls back to in-browser demo data and shows a **“Demo mode” banner** under
the header; a fresh load with the backend online never shows the banner.

---

## 2. Database integration (existing schema, zero changes)

Tables **used** (all pre-existing in `cswdo_db`; none created, altered, or duplicated):

| Table | Role in this module |
|---|---|
| `applications` | Eligible ONLINE applications; permanent `control_number` (`OL-YYYY-####`) |
| `appointments` | Lifecycle record; **UNIQUE(application_id)** — one row per application, reused on re-book |
| `schedule_capacities` | Per-date AM/PM capacity; **UNIQUE(schedule_date, time_window)**; rows lazily initialized |
| `queues` | Temporary queue numbers after check-in (`ONLINE_VERIFICATION` / `RE_QUEUE`) |
| `users` / `client_profiles` | Session identity → client resolution (`users.role = 'CLIENT'`) |
| `application_status_history` | Written by the seeder for existing application statuses (see §5.4) |
| `notifications` | One row per appointment event (booked, checked in, late, re-queued, rescheduled, cancelled) |
| `assistance_types` | Read-only reference for seeding/demo labels |

**No schema changes were required.** No `online_*` tables, no new columns, no second
database. `DB changes: none` — only data rows are inserted/updated.

### The 30-slot rule vs the dump default

`schedule_capacities.max_slots` **defaults to 50** in the dump. The application logic
never honors more than the business rule:

- Every read computes `effective_capacity = min(stored max_slots, 30)`.
- Every write creates rows with `max_slots = 30`.
- Full-session checks compare `booked_slots >= 30` (the effective capacity), so a row
  carrying 50 could still never accept more than 30 online bookings.

---

## 3. API reference

All endpoints are same-origin under `api/` and speak one envelope:

```jsonc
// success
{ "ok": true,  ...payload }
// failure (proper HTTP status)
{ "ok": false, "error": "code", "message": "user-friendly message" }
```

| Endpoint | Method | Purpose |
|---|---|---|
| `api/auth.php?action=me` | GET | Active session identity + `test_mode` flag |
| `api/auth.php?action=login` | POST | **TEST_MODE-only** identity switch (body: `{"username":"…"}`) |
| `api/auth.php?action=logout` | POST | Clears the session |
| `api/auth.php?action=staff_login` | POST | **Employee-portal sign-in** (always available, TEST_MODE independent): body `{username, password}` — verifies the real `password_hash`, applies the `users.failed_login_attempts` / `lockout_until` columns, binds an EMPLOYEE/ADMIN session |
| `api/appointments.php?action=overview` | GET | Application + appointment + schedule + queue + check-in state |
| `api/appointments.php?action=schedules&year=YYYY&month=MM` | GET | Calendar month; lazily initializes capacity rows |
| `api/appointments.php?action=book` | POST | `{date, window}` — transaction-safe booking |
| `api/appointments.php?action=checkin` | POST | Check-in window logic; returns on-time or LATE result |
| `api/appointments.php?action=late_requeue` | POST | Re-queue a LATE appointment (capacity-checked) |
| `api/appointments.php?action=reschedule` | POST | `{date, window}` — validate-then-move |
| `api/appointments.php?action=cancel` | POST | Release slot; row kept (`CANCELLED`) |
| `api/appointments.php?action=eligibility` | GET | Booking eligibility summary |

**Employee portal endpoints** (staff identity only — the portal has no login
screen: `resolve_current_employee()` binds an explicit staff session when one
exists, otherwise the demo officer auto-session, exactly mirroring the CLIENT
demo auto-session; `auth.php?action=staff_login` remains the production path
with real `password_hash` verification): all reuse the client business cores
(`perform_checkin` / `perform_late_requeue`), so the office terminal can never
do anything the client API cannot.

| Endpoint | Method | Purpose |
|---|---|---|
| `?action=dashboard&date=YYYY-MM-DD` | GET | Joined appointments (client, assistance, session, queue ticket, invalidated count) + summary counters + AM/PM slot state |
| `?action=queue&date=YYYY-MM-DD` | GET | All queue tickets for the date (`end_of_line: true` marks RQ tail tickets) |
| `?action=capacities&year&month` | GET | Per-day AM/PM booked / max (30) / locked grid |
| `?action=employee_checkin` | POST | `{control_number}` — office check-in via the same window/lateness rules (OV-###, LATE flags) |
| `?action=employee_requeue` | POST | `{control_number}` — AM→PM rollover (slot transfer, RQ-### at tail) |
| `?action=serve` | POST | `{queue_id}` — WAITING/CALLED → `COMPLETED`, stamps `called_at` once |
| `?action=set_appointment_status` | POST | `{appointment_id, status}` — office correction limited to `SCHEDULED` / `CANCELLED` with full slot hygiene |
| `?action=toggle_lock` | POST | `{schedule_id}` — flip `is_locked` on one session (office closure) |

Employee endpoint error codes: `unauthorized` (401, no session), `not_employee`
(403), `unknown_control_number` (404), `missing_control_number`,
`missing_queue_id`, `unknown_queue`, `not_active` (ticket already completed),
`same_status`, `bad_status`.

Staff sign-in error codes: `missing_credentials` (400), `invalid_credentials`
(401, identical message for unknown username and wrong password so accounts
cannot be enumerated), `account_locked` (429, after
`CSWDO_STAFF_MAX_ATTEMPTS = 5` failures within the window — locked for
`CSWDO_STAFF_LOCKOUT_MINUTES = 15`).

HTTP semantics: `400` invalid input / rule violation, `401` no session, `403` not
eligible/owner, `404` no appointment, `409` conflict (full, duplicate, locked,
already checked in, no re-queue capacity), `500` server fault, `503` DB unavailable.

Error codes include: `closed`, `full`, `already_booked`, `locked`, `too_early`,
`wrong_date`, `already_checked_in`, `already_late`, `no_capacity`, `not_late`,
`same_session`, `unauthorized`, `no_application`, `bad_month`.

**User-facing messages** (server-generated, §33 of the spec):

- Full session → *“This time slot is already full. Please select another available session.”*
- Closed session → *“This appointment session is already closed. Please select another available schedule.”*
- Too early → *“Check-in is not yet available. Please return at 7:30 AM for the AM session or at 11:30 AM for the PM session.”*
- Wrong date → *“Check-in is only available on your scheduled appointment date.”*
- Duplicate booking → *“This application already has an appointment.”*
- Unauthorized → *“You are not authorized to access this appointment.”* (401) / ownership resolved server-side
- Late → *“You have been marked as late. Your appointment will proceed through the re-queue process.”*
- No re-queue capacity → *“No remaining queue capacity is available for this session. Please reschedule your appointment according to the system's available schedule.”*

---

## 4. Security model

- **Identity is server-side only.** The PHP session resolves `user_id → client_profiles`
  → eligible application. The frontend never sends `client_id`, `application_id`, slot
  counts, or statuses; `auth.php?action=login` can only switch identity while
  `TEST_MODE = true`.
- **Staff access resolves to an EMPLOYEE/ADMIN identity, never to a client.**
  Employee endpoints (`dashboard`, `queue`, `capacities`, office check-in /
  re-queue, `serve`, status correction, lock toggle) call
  `resolve_current_employee()`: an explicit staff session when one exists —
  `auth.php?action=staff_login` verifies the stored `password_hash` with
  `password_verify()`, regenerates the session id, clears the lockout counters
  (`users.failed_login_attempts` / `lockout_until`, 5 attempts → 15 minutes)
  and returns the same generic error for an unknown username or a wrong
  password — otherwise the demo officer auto-session. Both portal identities
  are resolved per request from the session, and the CLIENT session key is
  never overwritten by the staff path, so the client and employee portals stay
  independent and both work side by side in one browser.
- **Prepared statements everywhere** (PDO, native prepares, `ERRMODE_EXCEPTION`).
- **Transactions:** booking, check-in, re-queue, reschedule, and cancel each run inside
  `beginTransaction()`; capacity rows are locked with `SELECT … FOR UPDATE`; any thrown
  rule violation rolls everything back. Two users racing for the last slot cannot both
  win (row lock + `booked_slots >= 30` re-check under lock), and the
  `appointments UNIQUE(application_id)` key backs the duplicate rule at the schema level.
- **Time is server time** (`Asia/Manila`). The only clock override is the
  `X-CSWDO-Test-Now` header, honored **only** when `TEST_MODE = true` (used by
  `test_api.sh`); with the flag off the header is ignored.
- **No credentials in the frontend.** `api/config.php` is server-side only; the browser
  receives JSON envelopes, never DB settings.

### Interim demo identity (no login screen — documented assumption)

There is no pre-existing login system in this workspace, so `bootstrap.php`
auto-binds any session-less request to the seeded demo CLIENT
(`CSWDO_DEMO_USERNAME = 'juandelacruz'` in `api/config.php`). The header shows
“Juan Dela Cruz — Demo session · CSWDO login coming soon”. The real CSWDO
authentication replaces `resolve_current_user()` / the `login` action in
`auth.php` — **no business endpoint needs to change**, because they only ever read
the identity from the session.

---

## 5. Business rules (as implemented)

### 5.1 Control number vs queue numbers

| Concept | Format | Where | Lifetime |
|---|---|---|---|
| Control number | `OL-YYYY-####` | `applications.control_number` | **Permanent** — never regenerated on book / check-in / late / re-queue / reschedule |
| Verification queue | `OV-###` | `queues.queue_number`, `queue_type = ONLINE_VERIFICATION` | Temporary; **only** created at check-in |
| Re-queue | `RQ-###` | `queues.queue_number`, `queue_type = RE_QUEUE` | Temporary; created only by a successful late re-queue |

Queue sequences are per `(queue_date, time_window, prefix)` — an AM check-in gets
`OV-001`, the next PM re-queue that day gets `RQ-001`; online verification numbers
never mix with walk-in or re-queue series.

### 5.2 Sessions, capacity, auto-close

- AM = 8:00 AM–12:00 PM, PM = 12:00 PM–5:00 PM; **30 slots each, 60/day**.
- `book` rejects: weekends, past dates, `is_locked` sessions, `booked_slots >= 30`,
  and any same-day booking once the session's **end time** has passed
  (AM closes at 12:00 PM, PM at 5:00 PM; after 5:00 PM the whole day is unselectable).
- The calendar and session cards mirror this: `AVAILABLE` (with `x/30 slots available`
  + `Select AM/PM`), `FULL — 30/30` (disabled), `CLOSED` (past end time / locked),
  weekend & holiday cells disabled.

### 5.3 Check-in windows

- Check-in opens **30 minutes before** session start: 7:30 AM (AM) / 11:30 AM (PM).
- **On-time window (extended — the old 8:30 AM / 12:30 PM grace cutoff is gone):**
  - AM: **7:30 AM – 10:59:59 AM** (`AM_CHECKIN_OPEN` → `AM_ONTIME_END = "11:00"`)
  - PM: **11:30 AM – 4:59:59 PM** (`PM_CHECKIN_OPEN` → `PM_ONTIME_END = "17:00"`)
  - Inside the window → `CHECKED_IN` + `OV-###` queue row (`WAITING`, `called_at = NULL`).
- **`LATE` escalation** (after the on-time end):
  - AM appointment checked in 11:00 AM – 12:00 PM (or missed) → `LATE` with
    `{"late": true, "can_requeue_pm": true, "pm_has_capacity": <bool>, "suggest_reschedule": true}`.
  - PM appointment checked in at/after 5:00 PM (or missed) → `LATE` with
    `{"late": true, "can_requeue_pm": false, "must_reschedule_tomorrow": true}` — the
    operational day is over; same-day re-queue is refused and rescheduling for the next
    working day is the only path.
- AM after session end (12:00 PM, non-late path) → *session closed* (re-queue refused;
  reschedule is the path).
- The Check In button is disabled with a label naming the opening time before the
  window; the server re-validates every condition on the actual request.

### 5.4 Status separation

Application status, appointment status, and queue status are independent concepts
and are never merged. Booking, check-in, queueing, lateness, and re-queue **never**
change `applications.current_status` (an application stays e.g. `FOR_REVIEW` — shown
client-facing as “Under Review” — and is never auto-`APPROVED`).
`application_status_history` is maintained by the application workflow (the seeder
writes one row per demo application); this module writes history only if a future
integration makes the application status itself transition.
`notifications` receives one row per appointment event.

### 5.5 Re-queue rules (AM → PM rollover, capacity, strict ordering)

**AM → PM rollover.** An AM client re-queued between 11:00 AM and 12:00 PM moves to
the **same-day PM session**. Inside a transaction, the LATE appointment and the AM/PM
schedule rows are locked `FOR UPDATE`; only when the PM session has capacity
(`booked_slots < 30`) the AM `booked_slots` is decremented, the PM `booked_slots`
incremented, the appointment's `schedule_id` moved to the PM row, and a new `RQ-###`
`RE_QUEUE` row issued for the **PM** window — appended at the tail of the PM queue.
The appointment returns to `CHECKED_IN`; the control number (`OL-YYYY-####`) never
changes. A PM-late client gets no same-day re-queue at all: the API refuses with the
office-day-concluded message and points to the next working day.

**Strict ordering (no queue jumping).** Any prior `OV-###` ticket the client held —
bypassed while absent or invalidated by lateness — is flagged `NO_SHOW`, and the new
`RQ-###` number is appended strictly at the tail (one past the current maximum per
date + window + prefix, via `next_queue_number()`), never into a vacated spot.

**Capacity.** Re-queue requires at least one of the target session's 30 slots
unbooked (`booked_slots < 30`). Without: **no queue row**, appointment stays
`LATE`, and the exact no-capacity message from the spec is shown with the reschedule
path offered.

### 5.6 Working days & the holiday hook

Booking/schedule initialization accept Monday–Friday only
(`is_working_day()` in `api/appointments.php`). Per the spec's “keep it simple”
directive there is **no holiday table**; the documented plug-in point is the
`holiday_name($date)` helper (currently returns `null`): when the office adds an
office-calendar/holiday table, resolve it there and the booking validation and the
`schedules` endpoint will start refusing those dates automatically. The frontend
keeps its existing PH holiday list for calendar cosmetics.

---

## 6. Flows

### Booking (transaction-safe)
`Select AM/PM → Confirm Appointment → POST book` →
lock schedule row → validate day/session/capacity → verify no active appointment
(reuse the row if the previous one is `CANCELLED` — `UNIQUE(application_id)`) →
insert/reuse + `booked_slots + 1` → notification → **commit** (any failure: full
rollback, zero mutations). Success dialog shows appointment ID, control number,
date, session, time, **Check-in Opens**, status `SCHEDULED`, and the reminder
*“Your queue number will only be generated after you check in on the appointment date.”*
No queue number exists at this point (DB-verified).

### Check-in
`Check In → POST checkin` → ownership + status + date + window re-validated →
on-time: `OV-###` row (`ONLINE_VERIFICATION`, `WAITING`) + appointment
`CHECKED_IN` + notification; late: appointment `LATE` + late dialog (re-queue if
capacity, else reschedule). Double check-in → 409 `already_checked_in`.

### Late / re-queue
Late dialog branches on the server's flags: **AM-late** → “Re-queue to PM Session”
(disabled + warning when `pm_has_capacity` is false) or “Reschedule Appointment”;
**PM-late** → office-day-concluded alert, no same-day re-queue, “Reschedule for Next
Available Day”. Re-queue → `POST late_requeue` → PM capacity? `RQ-###` (tail of the
PM line, prior `OV-###` flagged `NO_SHOW`) + `CHECKED_IN` + success feedback;
**no** capacity → the no-capacity message, appointment stays `LATE`, reschedule modal
offered. Control number never changes anywhere in this flow.

### Reschedule / cancel
Reschedule validates the new session (day, lock, capacity, same-session guard)
**before** releasing the old slot; confirm button label flips to
“Confirm Reschedule”. Cancel sets `CANCELLED` and releases the slot; re-booking
later **reuses the same `appointment_id`** (one row per application, forever).

---

## 7. Frontend integration

Two standalone pages, no cross-links in either direction. Each portal owns one
stylesheet and one script: `css/cswdo_client.css` + `js/cswdo_client.js` for
the client, `css/cswdo_employee.css` + `js/cswdo_employee.js` for the
employee portal. No inline `<style>` or `<script>` blocks remain in either page.

**Client portal** (`cswdo_client_appointment_module.html`)

- `js/cswdo_client.js` section 7 is the live API layer: every action calls
  `api/*.php` and **syncs the response into a `mockDb` mirror**, so the rendering
  layer (calendar, cards, panels, dialogs) is unchanged from phase 2 and keeps
  working identically.
- `withFallback()` routes a call to the in-browser mock twin only when the backend
  is unreachable (network error / non-JSON response / 5xx) — then the demo-mode
  banner appears once. Business rule rejections (4xx) are surfaced as real errors.
- The phase-2 feedback system is intact: spinners (`.isLoading`), inline
  `role=alert` areas, toasts, disabled buttons during requests with re-enable on
  failure, validate-then-mutate ordering, and the blocking policy dialog.
- Header additions: session identity block (`#headerSession`) + the demo-mode
  banner (`#apiModeBanner`). The error-simulation toggle was removed (real
  backend errors are now exercised).
- `schedules` responses drive the calendar: remaining counts, `FULL — 30/30`,
  `CLOSED` after session end, locked days, weekend/holiday cells.

**Employee portal** (`cswdo_employee_appointment_module.html`)

- `js/cswdo_employee.js` boots with no login screen: it resolves the staff
  identity from `auth.php?action=me&scope=employee`, then loads dashboard +
  queue + capacities for the selected date. If the API is unreachable it shows
  one explanatory card — it never falls back to mock data.
- `css/cswdo_employee.css` carries the design tokens (`--navy`, `--pasig-blue`,
  semantic status colors, radii, shadows) plus the component classes used by
  the markup: `.stat-card` / `.stat-label` / `.stat-value` / `.stat-icon`,
  `.data-table`, `.panel`, `.capacity-bar` / `.capacity-fill`, and the
  `.badge-state` family (`badge-scheduled`, `badge-checked-in`, `badge-late`,
  `badge-cancelled`, `badge-waiting`, `badge-called`, `badge-serving`,
  `badge-completed`, `badge-no-show`) plus `.badge-ticket` and
  `.badge-end-of-line` for the RQ tail marker. Layout utilities come from
  Tailwind (config declared in the page head, matching those tokens).
- Zero emojis anywhere: every status/action icon is an inline SVG.

---

## 8. Testing

### 8.1 Automated API harness — `bash test_api.sh`

Requires: PHP server on `127.0.0.1:8792`, `cswdo_db` imported + seeded, and
`CSWDO_TEST_MODE = true` in `api/config.php` (for the identity switch and the
`X-CSWDO-Test-Now` clock override). Restore the flag to `false` afterwards.

**Final run: PASS 70 / FAIL 0** (57 client-side + 13 employee-portal assertions).
Weekday-aware: the harness books the *next working day*, so it passes on any weekday.

| # | Scenario | Result |
|---|---|---|
| 0 | Session + overview for the demo client (`OL-2026-0001`) | PASS |
| 1 | AM booking (next working day) → `SCHEDULED`, **no queue number** (response + `queues` empty) | PASS |
| 2 | PM booking (mariasantos) → `SCHEDULED` | PASS |
| 3 | Duplicate booking → 409 *“This application already has an appointment.”* | PASS |
| 4 | Cross-client isolation → each client sees only their own application | PASS |
| 5 | AM/PM forced 30/30 → booking blocked, calendar shows `FULL` | PASS |
| 6 | Check-in windows: 7:00 too early (names **7:30 AM**) · 7:30 → `OV-001` · double check-in 409 · **8:30 → `OV-002` on-time (old grace cutoff gone)** · **10:30 → `OV-003` on-time (previously `LATE`)** | PASS |
| 7 | **11:15 AM check-in → `LATE`** + `can_requeue_pm`/`pm_has_capacity`/`suggest_reschedule` flags; row `LATE` | PASS |
| 8 | Re-queue AM→PM: `RQ-001` `RE_QUEUE` in the **PM** window; AM slots −1 / PM slots +1; `schedule_id` moved; bypassed `OV-004` → `NO_SHOW`; control unchanged; appointment `CHECKED_IN` | PASS |
| 9 | PM forced full → re-queue refused (*“No remaining queue capacity…”*), no queue row, stays `LATE` | PASS |
| 10 | **PM-late 17:05 → `LATE` + `must_reschedule_tomorrow`**; re-queue refused (*office day concluded*, next working day), no row, stays `LATE` | PASS |
| 11 | Reschedule to next working day PM; wrong-day check-in blocked; 18:00 → AM/PM `CLOSED`; same-day booking after close rejected | PASS |
| 12 | **Employee portal:** employee auto-session via `me&scope=employee` (no login screen) · dashboard reachable for the auto-bound officer · `staff_login` with a wrong password refused (401 `invalid_credentials`) · staff login → employee identity · dashboard lists the client booking (live sync, `total = 1`) · `employee_checkin` → `OV-001` `CHECKED_IN` · queue board shows the ticket · `serve` → `COMPLETED` · `toggle_lock` locks/unlocks | PASS |

### 8.2 Browser walkthrough (real UI, real server)

**Employee portal** (`cswdo_employee_appointment_module.html`, live rewrite):
sign-in gate → staff login → officer identity (Maria Santos · Welfare Officer ·
CSWDO-E-0001) + separated live clock. Client books via the API → the dashboard
table shows the row immediately on refresh (`UPCOMING`, slot counter 0→1).
Office check-in → `OV-001` appears on the AM queue board; **Call & Serve** →
board badge `Served`, stats update. LATE row → Re-queue button → `RQ-001` with
the **End of line** tag on the PM board; slot counters move AM −1 / PM +1.
Capacities view renders per-day AM/PM cards from the live grid with Lock/Close.
Zero emojis (source + rendered DOM), all icons inline SVG, no cross-links to
the client portal.

Verified end-to-end at `http://127.0.0.1:8792/cswdo_client_appointment_module.html`:
policy dialog first → booking flow → **`RQ-###` queue display shows the
“End of line” badge** (tail-of-line rule visible in the UI) → late dialogs driven
from the server payload (live page): **AM-late + PM capacity** → both buttons with
“Re-queue to PM Session” enabled; **AM-late + PM full** → re-queue button disabled
with the PM-full warning; **PM-late** → office-day-concluded alert, no re-queue
button, “Reschedule for Next Available Day”. Updated policy paragraph (7:30/11:30
opens, before-11:00/before-17:00 on-time, late rules, tail-of-line note) rendered in
the check-in hint. `php -l` clean on all 5 PHP files; `node --check` clean; zero
console errors on a fresh load; no horizontal scroll at 1280 px and 375 px; the only
sub-40px buttons are the two compact calendar-nav ghosts (pre-existing style,
unchanged from phase 2).

---

## 9. Assumptions & notes

1. **No login screen (interim).** Both portals open directly into their
   workspace: the client portal binds the demo CLIENT
   (`CSWDO_DEMO_USERNAME`) and the employee portal binds the demo officer
   (`CSWDO_DEMO_EMPLOYEE_USERNAME`) — each request still resolves its identity
   server-side from the session, and the two auto-sessions never overwrite each
   other, so both portals work side by side in one browser. The real CSWDO
   login/staff modules plug into `bootstrap.php` / `auth.php`
   (`staff_login` already implements the production staff path) without
   touching business logic.
2. **Re-queue capacity** = remaining session slots (`booked_slots < 30`).
3. **On-time windows** are config-driven: `AM_ONTIME_END = "11:00"`,
   `PM_ONTIME_END = "17:00"`. Because `PM_ONTIME_END == PM_SESSION_END`, a PM client
   is either on time or past close — there is no same-day PM re-queue window; only
   AM clients get the 11:00–12:00 late lane with PM rollover. The office-cutoff
   variant (`CSWDO_OFFICE_CUTOFF`) remains available but disabled by default.
4. **Walk-in exclusion:** the module resolves only the client's `ONLINE` application
   (the seeder adds `WI-2026-0001` to prove walk-ins never appear here).
5. **Eligibility:** ONLINE + owned by the session client + not `COMPLETED` + no
   active appointment. Booking never changes the application status.
6. **`max_slots` default 50** is never honored (effective cap 30, new rows created
   with 30).
7. **Dev topology:** one `php -S` server for page + API on port 8792; production
   would map the same layout under Apache/XAMPP (`htdocs`) with no code changes.

---

## 10. Changelog

- **Phase 1** — static module (mock data, flows, dialogs).
- **Phase 2** — Pasig template header, interactive feedback system, schema-aligned
  mock layer, demo tools; 6 validation fixes.
- **Phase 3 (current)** — real backend: `api/` (config, bootstrap, auth,
  appointments), `seed/seed_demo.php`, JS API layer with mirror + offline
  fallback, server-side enforcement of every rule (capacity 30, windows,
  auto-close, late/re-queue, transactions, ownership), header session info +
  demo banner, error-sim toggle removed, browser walkthrough verified, this
  document rewritten.
- **Full-stack integration & UI modernization** — employee portal wired to
  the live API: seeded staff identity (`cswdostaff`), employee session model
  (`require_employee`), and 8 server-side endpoints (dashboard, queue,
  capacities, office check-in / re-queue reusing the client business cores,
  serve, status correction, lock toggle); mock data and all emojis removed,
  inline SVG icons, separated identity/clock header blocks, client header
  polish (Yellow Seal → Pasig typography order, yellow accent strip removed,
  wide policy dialog without inner scrollbars). Harness extended to 69
  assertions, all passing.
- **Staff sign-in fix** — `auth.php?action=staff_login` (production-shaped,
  TEST_MODE-independent) authenticates the seeded staff account with
  `password_verify()` plus the users table lockout columns, so the employee
  portal can be signed into with `CSWDO_TEST_MODE = false`; the demo
  identity switch stays TEST_MODE-only.
- **Directory restructuring & no-login workspace** — client portal renamed to
  `cswdo_client_appointment_module.html` with `css/cswdo_client.css` and
  `js/cswdo_client.js`; the employee portal's inline `<style>`/`<script>` blocks
  extracted into `css/cswdo_employee.css` (design tokens + component classes)
  and `js/cswdo_employee.js`. The employee portal now opens directly into the
  officer workspace via `auth.php?action=me&scope=employee` (staff session, else
  the demo officer auto-session) with no login screen; `staff_login` remains the
  production authentication path. Harness extended to 70 assertions.
- **Check-in window refactor** — extended on-time windows (AM until 10:59,
  PM until 16:59; the 8:30/12:30 grace cutoff removed), `LATE` escalation
  flags per window (`can_requeue_pm`/`pm_has_capacity`/`suggest_reschedule` for
  AM; `must_reschedule_tomorrow` for PM), AM→PM same-day rollover with a
  transaction-safe slot transfer (AM −1 / PM +1, `schedule_id` moved, `RQ-###`
  at the tail, bypassed `OV-###` → `NO_SHOW`, control number untouched), PM-late
  same-day re-queue refusal, spec-exact late dialogs + policy copy, and the
  harness grown to 57 assertions (all passing) covering 8:30/10:30 on-time,
  11:15 late, PM-full refusal, and PM-late mandatory reschedule.
