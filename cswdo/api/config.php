<?php
/**
 * CSWDO Pasig — Online Appointment & Scheduling
 * Configuration (server-side only — NEVER included by or exposed to the frontend).
 *
 * Database: existing MariaDB `cswdo_db` (XAMPP defaults for this workstation).
 * Schema source of truth: cswdoDB.sql (no tables are created or altered here).
 */

// ---------------------------------------------------------------------------
// Database connection (XAMPP MariaDB defaults on this machine).
// ---------------------------------------------------------------------------
define('CSWDO_DB_HOST', '127.0.0.1');
define('CSWDO_DB_PORT', '3306');
define('CSWDO_DB_NAME', 'cswdo_db');
define('CSWDO_DB_USER', 'root');
define('CSWDO_DB_PASS', '');

// ---------------------------------------------------------------------------
// Time handling. The server clock is the single source of truth for session
// windows, check-in eligibility and auto-close rules (master prompt §8, §27).
// ---------------------------------------------------------------------------
define('CSWDO_TIMEZONE', 'Asia/Manila');

// ---------------------------------------------------------------------------
// Capacity rules (master prompt §6, §7, §34):
//   AM = 30 online slots, PM = 30 online slots, 60 per day.
// The schedule_capacities.max_slots column defaults to 50 in the dump — the
// application logic must never honor more than the configured 30 per session.
// New rows are initialized with max_slots = 30 (prompt §29).
// ---------------------------------------------------------------------------
define('CSWDO_MAX_ONLINE_SLOTS', 30);

// Session windows (master prompt §6): AM 8:00 AM–12:00 PM, PM 12:00 PM–5:00 PM.
define('CSWDO_AM_START', '08:00');
define('CSWDO_AM_END',   '12:00');
define('CSWDO_PM_START', '12:00');
define('CSWDO_PM_END',   '17:00');

// ---------------------------------------------------------------------------
// Check-in windows & lateness thresholds (master prompt §5.3 / refactor spec).
//   AM: check-in opens 7:30 AM, ON-TIME until before 11:00 AM, session ends 12:00 PM.
//   PM: check-in opens 11:30 AM, ON-TIME until before 5:00 PM, session ends 5:00 PM.
// A check-in inside [CHECKIN_OPEN, ONTIME_END) → CHECKED_IN + OV-###.
// A check-in inside [ONTIME_END, SESSION_END) → LATE (AM: re-queue to PM offered;
// PM: office day concluded — reschedule for the next working day).
// A check-in at/after SESSION_END → session closed.
// ---------------------------------------------------------------------------
define('CSWDO_AM_CHECKIN_OPEN', '07:30');
define('CSWDO_AM_ONTIME_END',   '11:00');
define('CSWDO_AM_SESSION_END',  '12:00');
define('CSWDO_PM_CHECKIN_OPEN', '11:30');
define('CSWDO_PM_ONTIME_END',   '17:00');
define('CSWDO_PM_SESSION_END',  '17:00');

// Optional earlier office cutoff (e.g. 11:00 / 15:00). Empty string disables
// the earlier cutoff and uses the session end time instead (master prompt §8).
define('CSWDO_OFFICE_CUTOFF', '');

// ---------------------------------------------------------------------------
// Demo identity (interim until the real CSWDO login module is connected).
// Every request without a session is automatically bound to this CLIENT user,
// so the module runs without a login screen. Identity switching via auth.php
// is only possible while TEST_MODE is true.
// ---------------------------------------------------------------------------
define('CSWDO_DEMO_USERNAME', 'juandelacruz');

// Demo EMPLOYEE identity for the employee portal. Employee endpoints require
// a staff sign-in (auth.php?action=staff_login, real password_hash check) or
// the TEST_MODE-only identity switch — unlike the CLIENT demo auto-session,
// staff actions are never bound automatically.
define('CSWDO_DEMO_EMPLOYEE_USERNAME', 'cswdostaff');

// Staff sign-in hardening (auth.php?action=staff_login). Uses the
// failed_login_attempts / lockout_until columns the users table already has.
define('CSWDO_STAFF_MAX_ATTEMPTS', 5);
define('CSWDO_STAFF_LOCKOUT_MINUTES', 15);

// ---------------------------------------------------------------------------
// TEST MODE (used by test_api.sh):
//   true  → auth.php?action=login|set may switch the demo identity and the
//           X-CSWDO-Test-Now header overrides the server clock per request.
//   false → both are refused (production-safe default).
// ---------------------------------------------------------------------------
define('CSWDO_TEST_MODE', false);

// ---------------------------------------------------------------------------
// Admin module settings (used by applications.php / decide.php / logout.php)
// ---------------------------------------------------------------------------
if (!defined('LOGIN_URL')) {
    // Relative to the admin pages under /admin/
    define('LOGIN_URL', '../client/login.html');
}
if (!defined('DEV_AUTO_LOGIN')) {
    // DEVELOPMENT ONLY — auto-sign-in as first active ADMIN when session is empty.
    // Set to false once the real login module is wired up.
    define('DEV_AUTO_LOGIN', true);
}
// Also expose as const for files that use const-style references
if (!defined('DB_HOST')) {
    define('DB_HOST', CSWDO_DB_HOST);
    define('DB_NAME', CSWDO_DB_NAME);
    define('DB_USER', CSWDO_DB_USER);
    define('DB_PASS', CSWDO_DB_PASS);
}
