# CSWDO Pasig — Unified Management Information System

Integrated project combining the following modules into a single codebase:

| Module | Source | Role in unified project |
|--------|--------|-------------------------|
| **CSWDO-MIS** | Front-end UI | Client homepage, registration, login, service pages |
| **Appointment & Scheduling** | Client + Employee portals + PHP API | Online booking, check-in, capacity, queue numbers |
| **Admin Review & Approval** | Module 9 | Admin case review, approve / return |
| **Queue Management** | Queue module | Employee queue desk UI |
| **Notifications & Alerts** | Notif pages | Client / Employee / Admin notification screens |
| **Requirements Verification** | Verification page | Document / requirements check UI |

---

## Project structure

```
cswdo/
├── index.html              → redirects to client homepage
├── portals.html            → hub linking all role portals
├── README.md
├── api/                    → shared PHP backend
│   ├── config.php          → DB + business-rule settings
│   ├── bootstrap.php       → PDO, auth helpers, admin compatibility
│   ├── auth.php
│   ├── appointments.php
│   ├── applications.php    → admin review list
│   ├── decide.php
│   ├── open_case.php
│   └── logout.php
├── sql/
│   ├── cswdo_db.sql        → canonical schema (import first)
│   └── seeds/
│       ├── seed_demo.php
│       └── admin_review_demo_seed.sql
├── assets/                 → logos & backgrounds
├── css/
├── js/
├── client/                 → public / client-facing pages
│   ├── homepage.html
│   ├── login.html
│   ├── register.html
│   ├── *-assistance.html
│   ├── appointment.html
│   ├── notifications.html
│   └── requirements-verification.html
├── employee/
│   ├── appointment.html
│   ├── queue.html
│   └── notifications.html
├── admin/
│   ├── index.html
│   └── notifications.html
└── docs/
    ├── CSWDO_APPOINTMENT_MODULE.md
    ├── CSWDO_UI_Guide.html
    ├── CSWDO_MIS_QUEUE_MANAGEMENT_GUIDE.pdf
    └── test_api.sh
```

---

## Quick start (XAMPP / local PHP)

### 1. Place the project

Copy the entire `cswdo` folder into your web root, e.g.:

```
C:\xampp\htdocs\cswdo\
```

### 2. Create & import the database

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS cswdo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root cswdo_db < sql/cswdo_db.sql
```

Optional demo data:

```bash
php sql/seeds/seed_demo.php
# Optional admin review seed:
mysql -u root cswdo_db < sql/seeds/admin_review_demo_seed.sql
```

### 3. Configure (if needed)

Edit `api/config.php` if your MySQL credentials differ from XAMPP defaults  
(`root` / empty password, host `127.0.0.1`).

### 4. Serve

**Option A — Apache (XAMPP)**  
Open:

- Portal hub:      http://localhost/cswdo/portals.html  
- Client:          http://localhost/cswdo/client/homepage.html  
- Employee:        http://localhost/cswdo/employee/appointment.html  
- Admin:           http://localhost/cswdo/admin/index.html  

**Option B — PHP built-in server**

```bash
cd cswdo
php -S 127.0.0.1:8792
```

Then open http://127.0.0.1:8792/portals.html

---

## Roles & entry points

| Role | Entry | Notes |
|------|-------|-------|
| **Client** | `client/homepage.html` | Demo auto-session via appointment API (`juandelacruz`) until real login is connected |
| **Employee** | `employee/appointment.html` | Staff login via `api/auth.php?action=staff_login` (demo user `cswdostaff`) |
| **Admin** | `admin/index.html` | `DEV_AUTO_LOGIN = true` signs in the first active ADMIN user |

Set `DEV_AUTO_LOGIN` to `false` in `api/config.php` once the shared login module is wired.

---

## Database

- **Database name:** `cswdo_db`
- **Canonical schema:** `sql/cswdo_db.sql` (from Appointment module)
- **No schema changes** were required to integrate the modules.
- Key tables: `users`, `client_profiles`, `employees`, `applications`, `appointments`, `schedule_capacities`, `queues`, `notifications`, `admin_reviews`, `application_documents`, `assistance_types`, …

Business rule: effective online capacity is capped at **30 slots** per AM/PM window even if the dump default is higher.

---

## Integration notes

1. **Shared API layer** — All PHP endpoints live under `/api/`. Client & employee pages call `../api/…`; admin pages do the same.
2. **Bootstrap compatibility** — `api/bootstrap.php` provides both appointment helpers (`cswdo_db`, `require_client`, `require_employee`) and admin aliases (`db`, `require_admin`, `json_out`, `read_json`, `priority_for_wait`).
3. **Paths** — HTML pages live in role folders (`client/`, `employee/`, `admin/`). CSS/JS/assets are shared at the project root; relative paths (`../css/`, `../js/`, `../assets/`, `../api/`) were updated accordingly.
4. **Login** — Front-end login/register pages exist; backend authentication is partially implemented via `api/auth.php` (staff) and demo client auto-session. Full end-to-end login wiring is the next recommended step.
5. **Notifications & Requirements** — Currently static UI pages; they can later consume the `notifications` table and application document endpoints.

---

## Testing the appointment API

```bash
# Enable test mode in api/config.php: define('CSWDO_TEST_MODE', true);
bash docs/test_api.sh
```

---

## Credits

Modules were developed by separate teams and integrated into this unified structure.  
UI follows the CSWDO / Pasig City design guide (navy/blue theme, official seal & logos).
