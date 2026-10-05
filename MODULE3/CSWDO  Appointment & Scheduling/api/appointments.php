<?php
/**
 * CSWDO Pasig — Online Appointment & Scheduling (appointment endpoints)
 *
 *   GET  ?action=overview                 → client's application + appointment + queue
 *   GET  ?action=schedules&year&month     → month calendar with AM/PM capacity states
 *   POST ?action=book       {date,window} → transaction-safe booking (SCHEDULED, no queue)
 *   POST ?action=checkin                  → check-in / late detection (creates OV-### queue)
 *   POST ?action=late_requeue             → late client re-queue (creates RQ-### queue)
 *   POST ?action=reschedule {date,window} → move appointment (validate-then-mutate)
 *   POST ?action=cancel                   → release slot, status CANCELLED
 *   GET  ?action=eligibility              → booking eligibility summary
 *
 * Security (master prompt §26/§27): the identity ALWAYS comes from the PHP
 * session (demo auto-session until the real CSWDO login is connected); the
 * client_id / application / appointment are resolved server-side from it.
 * Every rule below (capacity, windows, ownership, status, duplicates) is
 * enforced server-side; all statements are prepared.
 *
 * Tables used (existing, unmodified): applications, appointments,
 * schedule_capacities, queues, notifications, users, client_profiles.
 * application_status_history is only written when the APPLICATION status
 * itself changes — booking/check-in/queue transitions do not change it
 * (statuses are separate concepts, prompt §16/§17).
 */

require_once __DIR__ . '/bootstrap.php';

const QUEUE_PREFIX_ONLINE = 'OV';   // queues.queue_type = ONLINE_VERIFICATION
const QUEUE_PREFIX_REQUEUE = 'RQ';  // queues.queue_type = RE_QUEUE

$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'overview':     action_overview();     break;
        case 'schedules':    action_schedules();    break;
        case 'book':         action_book();         break;
        case 'checkin':      action_checkin();      break;
        case 'late_requeue': action_late_requeue(); break;
        case 'reschedule':   action_reschedule();   break;
        case 'cancel':       action_cancel();       break;
        case 'eligibility':  action_eligibility();  break;

        // ---- Employee portal endpoints (require an EMPLOYEE session) ----
        case 'dashboard':    action_dashboard();    break;
        case 'queue':        action_queue();        break;
        case 'capacities':   action_capacities();   break;
        case 'employee_checkin':    action_employee_checkin();    break;
        case 'employee_requeue':    action_employee_requeue();    break;
        case 'serve':        action_serve();        break;
        case 'set_appointment_status': action_set_appointment_status(); break;
        case 'toggle_lock':  action_toggle_lock();  break;
        default:
            fail('Unknown appointments action.', 400, 'unknown_action');
    }
} catch (ApiException $e) {
    if (cswdo_db()->inTransaction()) {
        cswdo_db()->rollBack();
    }
    json_fail($e->getMessage(), $e->httpStatus(), $e->errorCode(), $e->extra());
} catch (PDOException $e) {
    if (cswdo_db()->inTransaction()) {
        cswdo_db()->rollBack();
    }
    json_fail('Database error while processing the appointment request.', 500, 'db_error');
}

/* ==========================================================================
   Session window helpers (AM 8:00–12:00, PM 12:00–5:00; cap 30 per session)
   ========================================================================== */

function session_bounds(string $window): array
{
    if ($window === 'AM') {
        return ['start' => CSWDO_AM_START, 'end' => CSWDO_AM_END];
    }
    return ['start' => CSWDO_PM_START, 'end' => CSWDO_PM_END];
}

function minutes_of(string $hhmm): int
{
    [$h, $m] = array_map('intval', explode(':', $hhmm));
    return $h * 60 + $m;
}

function now_minutes(DateTimeImmutable $now): int
{
    return ((int) $now->format('H')) * 60 + (int) $now->format('i');
}

function label_time(string $hhmm): string
{
    $dt = DateTimeImmutable::createFromFormat('H:i', $hhmm);
    return $dt->format('g:i A'); // "8:00 AM"
}

// Check-in window for one session (minutes since midnight), from config:
//   open       → check-in becomes possible (AM 7:30 / PM 11:30)
//   ontime_end → last on-time check-in is the second BEFORE this (AM 11:00 / PM 17:00)
//   end        → session auto-closes at/after this (AM 12:00 / PM 17:00)
function checkin_window(string $window): array
{
    if ($window === 'AM') {
        return [
            'open'       => minutes_of(CSWDO_AM_CHECKIN_OPEN),
            'ontime_end' => minutes_of(CSWDO_AM_ONTIME_END),
            'end'        => minutes_of(CSWDO_AM_SESSION_END),
        ];
    }
    return [
        'open'       => minutes_of(CSWDO_PM_CHECKIN_OPEN),
        'ontime_end' => minutes_of(CSWDO_PM_ONTIME_END),
        'end'        => minutes_of(CSWDO_PM_SESSION_END),
    ];
}

function checkin_opens_label(string $window): string
{
    $openMin = checkin_window($window)['open'];
    return label_time(sprintf('%02d:%02d', intdiv($openMin, 60), $openMin % 60));
}

// Effective ONLINE capacity — the business rule caps every session at 30 even
// if a schedule row still carries the dump's default max_slots of 50.
function effective_capacity(array $row): int
{
    $stored = (int) ($row['max_slots'] ?? CSWDO_MAX_ONLINE_SLOTS);
    return max(0, min($stored, CSWDO_MAX_ONLINE_SLOTS));
}

function is_working_day(string $date): bool
{
    $dow = (int) DateTimeImmutable::createFromFormat('Y-m-d', $date)->format('N'); // 1=Mon … 7=Sun
    return $dow <= 5;
}

// Working-day restriction hook (master prompt §30): when the office later adds
// a holiday/office-calendar table, resolve it here (query + cache) and return
// the holiday name for non-working dates. Kept deliberately simple until then.
function holiday_name(string $date): ?string
{
    return null;
}

/* ==========================================================================
   Validation helpers
   ========================================================================== */

function validate_date($value): string
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        fail('Please provide a valid appointment date (YYYY-MM-DD).', 400, 'bad_date');
    }
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $value);
    if (!$dt || $dt->format('Y-m-d') !== $value) {
        fail('Please provide a valid appointment date (YYYY-MM-DD).', 400, 'bad_date');
    }
    return $value;
}

function validate_window($value): string
{
    if (!is_string($value) || !in_array($value, ['AM', 'PM'], true)) {
        fail('Please choose the AM (8:00 AM – 12:00 PM) or PM (12:00 PM – 5:00 PM) session.', 400, 'bad_window');
    }
    return $value;
}

// Auto-close rule (master prompt §8): a session becomes CLOSED once its end
// time has passed on the appointment day; past dates are never bookable.
function validate_booking_slot(string $date, string $window, DateTimeImmutable $now): void
{
    if (!is_working_day($date)) {
        fail('Appointments are available on weekdays only. Please select another available schedule.', 400, 'not_working_day');
    }
    $holiday = holiday_name($date);
    if ($holiday !== null) {
        fail("The office is closed on {$date} ({$holiday}). Please select another available schedule.", 400, 'holiday');
    }
    $today = $now->format('Y-m-d');
    if ($date < $today) {
        fail('This appointment session is already closed. Please select another available schedule.', 400, 'closed');
    }
    if ($date === $today && now_minutes($now) >= minutes_of(session_bounds($window)['end'])) {
        fail('This appointment session is already closed. Please select another available schedule.', 400, 'closed');
    }
}

/* ==========================================================================
   Data access (ownership always derived from the session identity)
   ========================================================================== */

function fetch_eligible_application(PDO $pdo, int $clientId, bool $forUpdate = false): ?array
{
    $sql = "SELECT * FROM applications
            WHERE client_id = ?
              AND application_type = 'ONLINE'
              AND current_status <> 'COMPLETED'
            ORDER BY submission_date DESC, application_id DESC
            LIMIT 1" . ($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$clientId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function fetch_appointment_for_application(PDO $pdo, int $applicationId, bool $forUpdate = false): ?array
{
    $sql = 'SELECT * FROM appointments WHERE application_id = ? LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$applicationId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function fetch_schedule(PDO $pdo, int $scheduleId, bool $forUpdate = false): ?array
{
    $sql = 'SELECT * FROM schedule_capacities WHERE schedule_id = ?' . ($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$scheduleId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function fetch_schedule_by_date_window(PDO $pdo, string $date, string $window, bool $forUpdate = false): ?array
{
    $sql = 'SELECT * FROM schedule_capacities WHERE schedule_date = ? AND time_window = ?' . ($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$date, $window]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function fetch_latest_queue(PDO $pdo, int $applicationId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT * FROM queues WHERE application_id = ? ORDER BY queue_id DESC LIMIT 1'
    );
    $stmt->execute([$applicationId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// Strict queue-ordering rule (refactor spec §1C): a late/bypassed client cannot
// reclaim their original OV-### spot — that ticket is flagged NO_SHOW so the
// control-room display treats it as invalidated, and a fresh RQ-### is appended
// strictly at the tail (next_queue_number → MAX+1).
function invalidate_open_queue_tickets(PDO $pdo, int $applicationId): int
{
    $stmt = $pdo->prepare(
        "UPDATE queues
         SET queue_status = 'NO_SHOW'
         WHERE application_id = ?
           AND queue_status IN ('WAITING', 'CALLED', 'SERVING')"
    );
    $stmt->execute([$applicationId]);
    return $stmt->rowCount();
}

// Late-response payload flag: does TODAY's PM session still have at least one
// of its 30 slots unbooked? (Used for the AM-late "Re-queue to PM Session" offer.)
function pm_capacity_today(PDO $pdo, string $today): array
{
    $row = fetch_schedule_by_date_window($pdo, $today, 'PM');
    if (!$row) {
        return ['has_capacity' => false, 'remaining' => 0];
    }
    $remaining = max(0, effective_capacity($row) - (int) $row['booked_slots']);
    return ['has_capacity' => $remaining > 0, 'remaining' => $remaining];
}

// Creates the per-day AM/PM capacity rows (max 30, booked 0, unlocked) exactly
// once thanks to UNIQUE(schedule_date, time_window) + INSERT IGNORE (§29).
function ensure_schedule_rows(PDO $pdo, string $date): void
{
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO schedule_capacities (schedule_date, time_window, max_slots, booked_slots, is_locked)
         VALUES (?, "AM", ?, 0, 0), (?, "PM", ?, 0, 0)'
    );
    $stmt->execute([$date, CSWDO_MAX_ONLINE_SLOTS, $date, CSWDO_MAX_ONLINE_SLOTS]);
}

// Sequential temporary queue number per appointment date + session + type:
// ONLINE_VERIFICATION → OV-001…, RE_QUEUE → RQ-001… (control numbers are a
// separate, permanent OL-YYYY-#### series in applications.control_number).
function next_queue_number(PDO $pdo, string $date, string $window, string $prefix): string
{
    $stmt = $pdo->prepare(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(queue_number, 4) AS UNSIGNED)), 0)
         FROM queues
         WHERE queue_date = ? AND time_window = ? AND queue_number LIKE ?"
    );
    $stmt->execute([$date, $window, $prefix . '-%']);
    $last = (int) $stmt->fetchColumn();

    return sprintf('%s-%03d', $prefix, $last + 1);
}

function notify(PDO $pdo, int $userId, string $title, string $message): void
{
    $stmt = $pdo->prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)');
    $stmt->execute([$userId, $title, $message]);
}

/* ==========================================================================
   Public payload mappers (snake_case, matching the cswdo_db columns)
   ========================================================================== */

function public_application(array $app): array
{
    return [
        'application_id'        => (int) $app['application_id'],
        'control_number'        => $app['control_number'],
        'client_id'             => (int) $app['client_id'],
        'assistance_type_id'    => (int) $app['assistance_type_id'],
        'requested_output_type' => $app['requested_output_type'],
        'application_type'      => $app['application_type'],
        'current_status'        => $app['current_status'],
        'submission_date'       => $app['submission_date'],
    ];
}

function public_appointment(array $appt): array
{
    return [
        'appointment_id'     => (int) $appt['appointment_id'],
        'application_id'     => (int) $appt['application_id'],
        'schedule_id'        => (int) $appt['schedule_id'],
        'appointment_status' => $appt['appointment_status'],
        'created_at'         => $appt['created_at'],
    ];
}

function public_queue(array $queue): array
{
    return [
        'queue_id'     => (int) $queue['queue_id'],
        'application_id' => (int) $queue['application_id'],
        'queue_number' => $queue['queue_number'],
        'queue_type'   => $queue['queue_type'],
        'queue_date'   => $queue['queue_date'],
        'time_window'  => $queue['time_window'],
        'queue_status' => $queue['queue_status'],
        'called_at'    => $queue['called_at'],
    ];
}

function public_schedule(array $row, ?DateTimeImmutable $now = null): array
{
    $window = $row['time_window'];
    $bounds = session_bounds($window);
    $capacity = effective_capacity($row);
    $booked = (int) $row['booked_slots'];

    return [
        'schedule_id'     => (int) $row['schedule_id'],
        'schedule_date'   => $row['schedule_date'],
        'time_window'     => $window,
        'max_slots'       => (int) $row['max_slots'],
        'booked_slots'    => $booked,
        'is_locked'       => (int) $row['is_locked'],
        'capacity'        => $capacity,
        'remaining'       => max(0, $capacity - $booked),
        'start'           => $bounds['start'],
        'end'             => $bounds['end'],
        'start_label'     => label_time($bounds['start']),
        'end_label'       => label_time($bounds['end']),
        'checkin_opens'   => sprintf('%02d:%02d', intdiv(checkin_window($window)['open'], 60), checkin_window($window)['open'] % 60),
        'checkin_opens_label' => checkin_opens_label($window),
        'almost_full'     => $booked * 100 >= $capacity * 80 && $booked < $capacity,
    ];
}

// Client-side check-in window state for one appointment (UI only — the server
// re-validates everything on the actual check-in call).
function checkin_state(array $appt, array $sched, DateTimeImmutable $now): array
{
    $today = $now->format('Y-m-d');
    $date = $sched['schedule_date'];
    $window = $sched['time_window'];
    $bounds = session_bounds($window);
    $win = checkin_window($window);
    $openAt = $win['open'];
    $lateAfter = $win['ontime_end'];
    $endAt = $win['end'];
    $nowMin = now_minutes($now);

    $state = 'upcoming';
    if ($date === $today && $window === 'PM' && $nowMin >= $win['ontime_end']) {
        // PM on-time end == session end: ≥5:00 PM is LATE (day concluded),
        // not "closed" — mirrors the checkin action's PM-late branch.
        $state = 'late';
    } elseif ($date < $today || ($date === $today && $nowMin >= $endAt)) {
        $state = 'closed';
    } elseif ($date === $today && $nowMin >= $lateAfter) {
        $state = 'late';
    } elseif ($date === $today && $nowMin >= $openAt) {
        $state = 'open';
    }

    return [
        'state'        => $state,
        'opens_label'  => checkin_opens_label($window),
        'can_checkin'  => in_array($appt['appointment_status'], ['SCHEDULED', 'RESCHEDULED'], true) && $state === 'open',
    ];
}

function booking_eligibility(?array $app, ?array $appt, DateTimeImmutable $now): array
{
    if (!$app) {
        return ['can_book' => false, 'reason' => 'no_online_application'];
    }
    if ($app['current_status'] === 'COMPLETED') {
        return ['can_book' => false, 'reason' => 'application_completed'];
    }
    if ($appt && $appt['appointment_status'] !== 'CANCELLED') {
        return ['can_book' => false, 'reason' => 'already_booked'];
    }
    return ['can_book' => true, 'reason' => null];
}

/* ==========================================================================
   Actions
   ========================================================================== */

function action_overview(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    [$user, $profile] = require_client();

    $app = fetch_eligible_application($pdo, (int) $profile['client_id']);

    $payload = [
        'user'        => public_user($user, $profile),
        'application' => $app ? public_application($app) : null,
        'appointment' => null,
        'schedule'    => null,
        'queue'       => null,
        'server_now'  => $now->format('Y-m-d H:i:s'),
        'today'       => $now->format('Y-m-d'),
    ];

    if ($app) {
        $appt = fetch_appointment_for_application($pdo, (int) $app['application_id']);
        $active = $appt && $appt['appointment_status'] !== 'CANCELLED' ? $appt : null;

        if ($active) {
            $sched = fetch_schedule($pdo, (int) $active['schedule_id']);
            $queue = fetch_latest_queue($pdo, (int) $app['application_id']);

            $payload['appointment'] = public_appointment($active);
            $payload['schedule']    = $sched ? public_schedule($sched, $now) : null;
            $payload['queue']       = $queue ? public_queue($queue) : null;
            if ($sched) {
                $payload['checkin'] = checkin_state($active, $sched, $now);
            }
        }

        $payload['eligibility'] = booking_eligibility($app, $appt, $now);
    } else {
        $payload['eligibility'] = ['can_book' => false, 'reason' => 'no_online_application'];
    }

    json_ok($payload);
}

function action_eligibility(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    [, $profile] = require_client();

    $app = fetch_eligible_application($pdo, (int) $profile['client_id']);
    $appt = $app ? fetch_appointment_for_application($pdo, (int) $app['application_id']) : null;

    json_ok([
        'eligibility' => booking_eligibility($app, $appt, $now),
        'application' => $app ? public_application($app) : null,
    ]);
}

function action_schedules(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_client();

    $year = $_GET['year'] ?? '';
    $month = $_GET['month'] ?? '';
    if (!is_string($year) || !preg_match('/^\d{4}$/', $year) || !is_string($month) || !preg_match('/^(0[1-9]|1[0-2])$/', $month)) {
        fail('Please request schedules with a 4-digit year and a zero-padded month (e.g. year=2026&month=10).', 400, 'bad_month');
    }

    $today = $now->format('Y-m-d');
    $nowMin = now_minutes($now);
    $daysInMonth = (int) (new DateTimeImmutable("{$year}-{$month}-01"))->format('t');

    $days = [];
    for ($d = 1; $d <= $daysInMonth; $d++) {
        $date = sprintf('%s-%s-%02d', $year, $month, $d);
        $working = is_working_day($date);
        $holiday = holiday_name($date);

        $sessions = [];
        foreach (['AM', 'PM'] as $window) {
            $session = [
                'state'               => 'CLOSED',
                'non_working_day'     => !$working,
                'holiday'             => $holiday,
                'remaining'           => 0,
                'booked'              => 0,
                'capacity'            => CSWDO_MAX_ONLINE_SLOTS,
                'is_locked'           => 0,
                'start'               => session_bounds($window)['start'],
                'end'                 => session_bounds($window)['end'],
                'start_label'         => label_time(session_bounds($window)['start']),
                'end_label'           => label_time(session_bounds($window)['end']),
                'checkin_opens_label' => checkin_opens_label($window),
            ];

            if ($working && $holiday === null && $date >= $today) {
                ensure_schedule_rows($pdo, $date);
                $row = fetch_schedule_by_date_window($pdo, $date, $window);
                if ($row) {
                    $capacity = effective_capacity($row);
                    $booked = (int) $row['booked_slots'];
                    $locked = (int) $row['is_locked'] === 1;
                    $closedToday = ($date === $today && $nowMin >= minutes_of(session_bounds($window)['end']));

                    $session['schedule_id'] = (int) $row['schedule_id'];
                    $session['max_slots']   = (int) $row['max_slots'];
                    $session['booked']      = $booked;
                    $session['capacity']    = $capacity;
                    $session['remaining']   = max(0, $capacity - $booked);
                    $session['is_locked']   = (int) $row['is_locked'];
                    $session['almost_full'] = $booked * 100 >= $capacity * 80 && $booked < $capacity;
                    $session['state']       = ($locked || $closedToday) ? 'CLOSED' : ($booked >= $capacity ? 'FULL' : 'AVAILABLE');
                }
            } elseif ($date < $today && $working) {
                // Past working day: report stored numbers but keep CLOSED.
                $row = fetch_schedule_by_date_window($pdo, $date, $window);
                if ($row) {
                    $session['booked'] = (int) $row['booked_slots'];
                    $session['capacity'] = effective_capacity($row);
                    $session['remaining'] = max(0, effective_capacity($row) - (int) $row['booked_slots']);
                    $session['is_locked'] = (int) $row['is_locked'];
                }
                $session['state'] = 'CLOSED';
            }

            $sessions[$window] = $session;
        }

        $days[] = [
            'date'           => $date,
            'is_working_day' => $working,
            'holiday'        => $holiday,
            'sessions'       => $sessions,
        ];
    }

    json_ok([
        'year'       => (int) $year,
        'month'      => (int) $month,
        'today'      => $today,
        'server_now' => $now->format('Y-m-d H:i:s'),
        'days'       => $days,
    ]);
}

function action_book(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    [$user, $profile] = require_client();

    $body = read_json_body();
    $date = validate_date($body['date'] ?? null);
    $window = validate_window($body['window'] ?? null);

    $pdo->beginTransaction();
    try {
        // 1. The application is resolved from the session identity — never
        //    from a client-supplied application_id (master prompt §26/§31).
        $app = fetch_eligible_application($pdo, (int) $profile['client_id'], true);
        if (!$app) {
            fail('No eligible ONLINE application was found for your account.', 403, 'no_application');
        }
        if ($app['current_status'] === 'COMPLETED') {
            fail('This application has already been completed and cannot book an appointment.', 409, 'application_completed');
        }

        // 2. Session validity (working day, not past, not closed today).
        validate_booking_slot($date, $window, $now);

        // 3. Lock the capacity row and verify the 30-slot business rule.
        ensure_schedule_rows($pdo, $date);
        $sched = fetch_schedule_by_date_window($pdo, $date, $window, true);
        if (!$sched) {
            fail('The requested schedule could not be created.', 500, 'schedule_missing');
        }
        if ((int) $sched['is_locked'] === 1) {
            fail('This session is locked by the office and cannot be booked.', 409, 'locked');
        }
        $capacity = effective_capacity($sched);
        if ((int) $sched['booked_slots'] >= $capacity) {
            fail('This time slot is already full. Please select another available session.', 409, 'full');
        }

        // 4. Duplicate-appointment rule (appointments UNIQUE(application_id)).
        //    A CANCELLED row is reused so the client keeps ONE appointment row.
        $existing = fetch_appointment_for_application($pdo, (int) $app['application_id'], true);
        if ($existing && $existing['appointment_status'] !== 'CANCELLED') {
            fail('This application already has an appointment.', 409, 'already_booked');
        }

        // 5. Insert or reuse, then increment the capacity — commit or roll back
        //    everything together (master prompt §18).
        if ($existing) {
            $stmt = $pdo->prepare(
                "UPDATE appointments SET schedule_id = ?, appointment_status = 'SCHEDULED', created_at = NOW()
                 WHERE appointment_id = ?"
            );
            $stmt->execute([(int) $sched['schedule_id'], (int) $existing['appointment_id']]);
            $appointmentId = (int) $existing['appointment_id'];
        } else {
            $stmt = $pdo->prepare(
                "INSERT INTO appointments (application_id, schedule_id, appointment_status)
                 VALUES (?, ?, 'SCHEDULED')"
            );
            $stmt->execute([(int) $app['application_id'], (int) $sched['schedule_id']]);
            $appointmentId = (int) $pdo->lastInsertId();
        }

        $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots + 1 WHERE schedule_id = ?');
        $stmt->execute([(int) $sched['schedule_id']]);

        notify(
            $pdo,
            (int) $user['user_id'],
            'Appointment scheduled',
            sprintf(
                'Appointment %s scheduled for %s (%s session, %s – %s). Your queue number will only be generated after you check in on the appointment date.',
                $app['control_number'],
                $date,
                $window,
                label_time(session_bounds($window)['start']),
                label_time(session_bounds($window)['end'])
            )
        );

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($e->getCode() === '23000') {
            fail('This application already has an appointment.', 409, 'already_booked');
        }
        throw $e;
    }

    $appt = fetch_appointment_for_application($pdo, (int) $app['application_id']);
    $sched = fetch_schedule($pdo, (int) $sched['schedule_id']);

    json_ok([
        'message'        => 'Appointment successfully scheduled. Your queue number will only be generated after you check in on the appointment date.',
        'control_number' => $app['control_number'],
        'appointment'    => public_appointment($appt),
        'schedule'       => public_schedule($sched, $now),
    ]);
}

function action_checkin(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    [$user, $profile] = require_client();

    $app = fetch_eligible_application($pdo, (int) $profile['client_id']);
    if (!$app) {
        fail('No eligible ONLINE application was found for your account.', 403, 'no_application');
    }

    $appt = fetch_appointment_for_application($pdo, (int) $app['application_id']);
    if (!$appt) {
        fail('You do not have an appointment to check in to.', 404, 'no_appointment');
    }

    perform_checkin($pdo, $app, $now);
}

// Shared check-in core (client portal + employee portal). The caller has
// already resolved and permission-checked the application; this function
// re-fetches the appointment row FOR UPDATE, applies every window/lateness
// rule, issues the OV-### queue ticket, commits, and emits the JSON envelope.
function perform_checkin(PDO $pdo, array $app, DateTimeImmutable $now): void
{
    $pdo->beginTransaction();
    try {
        // Re-fetch inside the transaction so concurrent client/office actions
        // serialize on the appointment row.
        $appt = fetch_appointment_for_application($pdo, (int) $app['application_id'], true);
        if (!$appt) {
            fail('You do not have an appointment to check in to.', 404, 'no_appointment');
        }

        // Notification target: the appointment owner (client_profiles.user_id).
        // Identity/permission was enforced by the caller (CLIENT session or
        // staff login); notifications always go to the client.
        $stmt = $pdo->prepare('SELECT user_id FROM client_profiles WHERE client_id = ? LIMIT 1');
        $stmt->execute([(int) $app['client_id']]);
        $clientUserId = (int) ($stmt->fetchColumn() ?: 0);
        if ($clientUserId === 0) {
            fail('No client profile is linked to this application.', 403, 'profile_missing');
        }

        if ($appt['appointment_status'] === 'CHECKED_IN') {
            fail('You have already been checked in.', 409, 'already_checked_in');
        }
        if ($appt['appointment_status'] === 'CANCELLED') {
            fail('This appointment was cancelled. Please book a new appointment.', 409, 'cancelled');
        }
        if ($appt['appointment_status'] === 'LATE') {
            fail('This appointment is already marked as LATE. Use the re-queue procedure.', 409, 'already_late');
        }
        if (!in_array($appt['appointment_status'], ['SCHEDULED', 'RESCHEDULED'], true)) {
            fail('This appointment cannot be checked in.', 409, 'bad_status');
        }

        $sched = fetch_schedule($pdo, (int) $appt['schedule_id'], true);
        if (!$sched) {
            fail('The appointment schedule row is missing.', 500, 'schedule_missing');
        }

        // Check-in is only available on the scheduled appointment date (§33).
        $today = $now->format('Y-m-d');
        if ($sched['schedule_date'] !== $today) {
            fail('Check-in is only available on your scheduled appointment date.', 400, 'wrong_date');
        }

        $window = $sched['time_window'];
        $win = checkin_window($window);
        $nowMin = now_minutes($now);

        if ($nowMin < $win['open']) {
            fail(
                sprintf(
                    'Check-in is not yet available. Please return at %s for the %s session or at %s for the PM session.',
                    checkin_opens_label('AM'),
                    'AM',
                    checkin_opens_label('PM')
                ),
                400,
                'too_early'
            );
        }
        // ---- PM-late must be evaluated BEFORE the closed guard: the PM on-time
        // end and the PM session end are both 5:00 PM, so a check-in at/after
        // 5:00 PM is not "closed" — it is LATE with the operational day over
        // (same-day queue generation impossible → mandatory reschedule).
        if ($window === 'PM' && $nowMin >= $win['ontime_end']) {
            $stmt = $pdo->prepare("UPDATE appointments SET appointment_status = 'LATE' WHERE appointment_id = ?");
            $stmt->execute([(int) $appt['appointment_id']]);

            notify(
                $pdo,
                (int) $clientUserId,
                'Appointment marked as LATE',
                'The office day has concluded. Your PM appointment must be rescheduled for the next available working day. Your control number ' . $app['control_number'] . ' stays the same.'
            );

            $pdo->commit();

            json_ok([
                'late'                     => true,
                'can_requeue_pm'           => false,
                'must_reschedule_tomorrow' => true,
                'message'                  => 'The office day has concluded. Your PM appointment cannot be re-queued today — please reschedule for the next available working day.',
                'control_number'           => $app['control_number'],
                'appointment'              => public_appointment(array_merge($appt, ['appointment_status' => 'LATE'])),
                'schedule'                 => public_schedule($sched, $now),
            ]);
        }

        if ($nowMin >= $win['end']) {
            fail('This appointment session is already closed. Please select another available schedule.', 400, 'closed');
        }

        // ---- AM-late: on-time window passed (11:00 AM), session still open —
        // re-queue to the SAME DAY PM session is offered while PM capacity
        // lasts; otherwise reschedule.
        if ($nowMin >= $win['ontime_end']) {
            $pm = pm_capacity_today($pdo, $today);

            $stmt = $pdo->prepare("UPDATE appointments SET appointment_status = 'LATE' WHERE appointment_id = ?");
            $stmt->execute([(int) $appt['appointment_id']]);

            notify(
                $pdo,
                (int) $clientUserId,
                'Appointment marked as LATE',
                'You have been marked as late. Your AM appointment can still be re-queued into the same-day PM session while slots remain, or rescheduled. Your control number ' . $app['control_number'] . ' stays the same.'
            );

            $pdo->commit();

            json_ok([
                'late'               => true,
                'can_requeue_pm'     => true,
                'pm_has_capacity'    => $pm['has_capacity'],
                'pm_remaining'       => $pm['remaining'],
                'suggest_reschedule' => true,
                'message'            => 'You have been marked as late. Your AM appointment may be re-queued into the same-day PM session (end of the queue) while capacity remains, or rescheduled.',
                'control_number'     => $app['control_number'],
                'appointment'        => public_appointment(array_merge($appt, ['appointment_status' => 'LATE'])),
                'schedule'           => public_schedule($sched, $now),
            ]);
        }

        // ---- Normal check-in: issue the temporary OV-### queue number. ----
        // Lock the session row so concurrent check-ins cannot draw the same number.
        $sched = fetch_schedule_by_date_window($pdo, $sched['schedule_date'], $window, true);

        $queueNumber = next_queue_number($pdo, $sched['schedule_date'], $window, QUEUE_PREFIX_ONLINE);
        $stmt = $pdo->prepare(
            "INSERT INTO queues (application_id, queue_number, queue_type, queue_date, time_window, queue_status, called_at)
             VALUES (?, ?, 'ONLINE_VERIFICATION', ?, ?, 'WAITING', NULL)"
        );
        $stmt->execute([(int) $app['application_id'], $queueNumber, $sched['schedule_date'], $window]);
        $queueId = (int) $pdo->lastInsertId();

        $stmt = $pdo->prepare("UPDATE appointments SET appointment_status = 'CHECKED_IN' WHERE appointment_id = ?");
        $stmt->execute([(int) $appt['appointment_id']]);

        notify(
            $pdo,
            (int) $clientUserId,
            'Check-in successful',
            'You are checked in for the ' . $window . ' session on ' . $sched['schedule_date'] . '. Temporary queue number: ' . $queueNumber . '. Control number ' . $app['control_number'] . ' stays the same.'
        );

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }

    $appt = fetch_appointment_for_application($pdo, (int) $app['application_id']);
    $queue = fetch_latest_queue($pdo, (int) $app['application_id']);
    $sched = fetch_schedule($pdo, (int) $appt['schedule_id']);

    json_ok([
        'late'           => false,
        'message'        => 'Check-in successful. Your temporary queue number is ' . $queue['queue_number'] . '.',
        'control_number' => $app['control_number'],
        'appointment'    => public_appointment($appt),
        'schedule'       => public_schedule($sched, $now),
        'queue'          => public_queue($queue),
    ]);
}

function action_late_requeue(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    [$user, $profile] = require_client();

    $app = fetch_eligible_application($pdo, (int) $profile['client_id']);
    if (!$app) {
        fail('No eligible ONLINE application was found for your account.', 403, 'no_application');
    }

    perform_late_requeue($pdo, $app, $now);
}

// Shared late re-queue core (client portal + employee portal): the caller has
// already resolved and permission-checked the application; this function
// re-fetches the LATE appointment FOR UPDATE, performs the AM→PM rollover
// (slot transfer, NO_SHOW invalidation, RQ-### at the PM tail), commits and
// emits the JSON envelope. PM-late is refused — reschedule is the only path.
function perform_late_requeue(PDO $pdo, array $app, DateTimeImmutable $now): void
{
    try {
        $pdo->beginTransaction();

        // Notification target: the appointment owner (client_profiles.user_id).
        $stmt = $pdo->prepare('SELECT user_id FROM client_profiles WHERE client_id = ? LIMIT 1');
        $stmt->execute([(int) $app['client_id']]);
        $clientUserId = (int) ($stmt->fetchColumn() ?: 0);
        if ($clientUserId === 0) {
            fail('No client profile is linked to this application.', 403, 'profile_missing');
        }

        $appt = fetch_appointment_for_application($pdo, (int) $app['application_id'], true);
        if (!$appt) {
            fail('You do not have an appointment to re-queue.', 404, 'no_appointment');
        }
        if ($appt['appointment_status'] !== 'LATE') {
            fail('Only an appointment marked LATE can be re-queued.', 409, 'not_late');
        }

        $sched = fetch_schedule($pdo, (int) $appt['schedule_id'], true);
        if (!$sched) {
            fail('The appointment schedule row is missing.', 500, 'schedule_missing');
        }

        $today = $now->format('Y-m-d');
        if ($sched['schedule_date'] !== $today) {
            fail('Re-queueing is only available on your scheduled appointment date.', 400, 'wrong_date');
        }

        $window = $sched['time_window'];

        // PM-late (≥5:00 PM): the operational day is over — same-day re-queue is
        // impossible. The client MUST reschedule for the next available working
        // day; the appointment stays LATE (nothing is faked to CHECKED_IN).
        if ($window === 'PM') {
            fail(
                'The office day has concluded and same-day re-queueing is no longer possible. Please reschedule your appointment for the next available working day.',
                409,
                'must_reschedule_tomorrow'
            );
        }

        // AM-late → the new ticket belongs to the SAME-DAY PM session, appended
        // strictly at the tail. The PM session must still be open.
        $endAt = minutes_of(session_bounds('PM')['end']);
        if (now_minutes($now) >= $endAt) {
            fail('This appointment session is already closed. Please reschedule your appointment according to the available schedule.', 400, 'closed');
        }

        // Re-queue capacity (documented assumption): the PM session still has at
        // least one of its 30 slots unbooked. When full, NO queue number is
        // generated and the appointment stays LATE (master prompt §15).
        $targetSched = fetch_schedule_by_date_window($pdo, $sched['schedule_date'], 'PM', true);
        if (!$targetSched) {
            fail('The PM session schedule row is missing for this date.', 500, 'schedule_missing');
        }
        if ((int) $targetSched['is_locked'] === 1) {
            fail('The PM session is locked by the office. Please reschedule your appointment according to the available schedule.', 409, 'locked');
        }
        $capacity = effective_capacity($targetSched);
        if ((int) $targetSched['booked_slots'] >= $capacity) {
            fail(
                'No remaining queue capacity is available for this session. Please reschedule your appointment according to the system\'s available schedule.',
                409,
                'no_capacity'
            );
        }

        // Strict queue-ordering rule: invalidate the old OV-### ticket(s),
        // transfer the booking AM → PM, and append a NEW RQ-### strictly at the
        // tail of the PM queue. next_queue_number() returns MAX+1 per
        // (queue_date, time_window, prefix) — no queue jumping.
        invalidate_open_queue_tickets($pdo, (int) $app['application_id']);

        $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots - 1 WHERE schedule_id = ? AND booked_slots > 0');
        $stmt->execute([(int) $sched['schedule_id']]);
        $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots + 1 WHERE schedule_id = ?');
        $stmt->execute([(int) $targetSched['schedule_id']]);

        // Per master prompt §14: appointment moves to CHECKED_IN after a
        // successful re-queue; control number and application are untouched.
        $stmt = $pdo->prepare("UPDATE appointments SET schedule_id = ?, appointment_status = 'CHECKED_IN' WHERE appointment_id = ?");
        $stmt->execute([(int) $targetSched['schedule_id'], (int) $appt['appointment_id']]);

        $queueNumber = next_queue_number($pdo, $sched['schedule_date'], 'PM', QUEUE_PREFIX_REQUEUE);
        $stmt = $pdo->prepare(
            "INSERT INTO queues (application_id, queue_number, queue_type, queue_date, time_window, queue_status, called_at)
             VALUES (?, ?, 'RE_QUEUE', ?, 'PM', 'WAITING', NULL)"
        );
        $stmt->execute([(int) $app['application_id'], $queueNumber, $sched['schedule_date']]);

        notify(
            $pdo,
            (int) $clientUserId,
            'Re-queued into the PM session',
            'Your late AM appointment was re-queued into the same-day PM session. New queue number: ' . $queueNumber . ' (end of the PM line). Control number ' . $app['control_number'] . ' stays the same.'
        );

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }

    $appt = fetch_appointment_for_application($pdo, (int) $app['application_id']);
    $queue = fetch_latest_queue($pdo, (int) $app['application_id']);
    $sched = fetch_schedule($pdo, (int) $appt['schedule_id']);

    json_ok([
        'message'        => 'You have been re-queued. Your temporary queue number is ' . $queue['queue_number'] . ' — end of the PM session line. Please wait until your number is called.',
        'control_number' => $app['control_number'],
        'appointment'    => public_appointment($appt),
        'schedule'       => public_schedule($sched, $now),
        'queue'          => public_queue($queue),
    ]);
}

function action_reschedule(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    [$user, $profile] = require_client();

    $body = read_json_body();
    $date = validate_date($body['date'] ?? null);
    $window = validate_window($body['window'] ?? null);

    $pdo->beginTransaction();
    try {
        $app = fetch_eligible_application($pdo, (int) $profile['client_id'], true);
        if (!$app) {
            fail('No eligible ONLINE application was found for your account.', 403, 'no_application');
        }

        $appt = fetch_appointment_for_application($pdo, (int) $app['application_id'], true);
        if (!$appt) {
            fail('You do not have an appointment to reschedule.', 404, 'no_appointment');
        }
        if ($appt['appointment_status'] === 'CHECKED_IN') {
            fail('A checked-in appointment cannot be rescheduled. Please see the counter staff.', 409, 'checked_in');
        }
        if ($appt['appointment_status'] === 'CANCELLED') {
            fail('This appointment was cancelled. Please book a new appointment.', 409, 'cancelled');
        }
        if (!in_array($appt['appointment_status'], ['SCHEDULED', 'RESCHEDULED', 'LATE'], true)) {
            fail('This appointment cannot be rescheduled.', 409, 'bad_status');
        }

        $oldSched = fetch_schedule($pdo, (int) $appt['schedule_id'], true);

        // Validate the NEW session completely before releasing the old slot.
        validate_booking_slot($date, $window, $now);
        ensure_schedule_rows($pdo, $date);
        $newSched = fetch_schedule_by_date_window($pdo, $date, $window, true);
        if (!$newSched) {
            fail('The requested schedule could not be created.', 500, 'schedule_missing');
        }
        if ((int) $newSched['is_locked'] === 1) {
            fail('The new session is locked by the office.', 409, 'locked');
        }
        if ((int) $newSched['schedule_id'] === (int) $appt['schedule_id']) {
            fail('The appointment is already booked into this session.', 400, 'same_session');
        }
        $capacity = effective_capacity($newSched);
        if ((int) $newSched['booked_slots'] >= $capacity) {
            fail('This time slot is already full. Please select another available session.', 409, 'full');
        }

        // Validate-then-mutate: move the slot counters, then the appointment.
        if ($oldSched && (int) $oldSched['booked_slots'] > 0) {
            $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots - 1 WHERE schedule_id = ?');
            $stmt->execute([(int) $oldSched['schedule_id']]);
        }
        $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots + 1 WHERE schedule_id = ?');
        $stmt->execute([(int) $newSched['schedule_id']]);

        $stmt = $pdo->prepare(
            "UPDATE appointments SET schedule_id = ?, appointment_status = 'RESCHEDULED' WHERE appointment_id = ?"
        );
        $stmt->execute([(int) $newSched['schedule_id'], (int) $appt['appointment_id']]);

        notify(
            $pdo,
            (int) $user['user_id'],
            'Appointment rescheduled',
            'Your appointment was moved to ' . $date . ' (' . $window . ' session). Control number ' . $app['control_number'] . ' stays the same.'
        );

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }

    $appt = fetch_appointment_for_application($pdo, (int) $app['application_id']);
    $sched = fetch_schedule($pdo, (int) $appt['schedule_id']);

    json_ok([
        'message'        => 'Appointment rescheduled. Your temporary queue number will only be generated after you check in on the new appointment date.',
        'control_number' => $app['control_number'],
        'appointment'    => public_appointment($appt),
        'schedule'       => public_schedule($sched, $now),
    ]);
}

function action_cancel(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    [$user, $profile] = require_client();

    $pdo->beginTransaction();
    try {
        $app = fetch_eligible_application($pdo, (int) $profile['client_id'], true);
        if (!$app) {
            fail('No eligible ONLINE application was found for your account.', 403, 'no_application');
        }

        $appt = fetch_appointment_for_application($pdo, (int) $app['application_id'], true);
        if (!$appt) {
            fail('You do not have an appointment to cancel.', 404, 'no_appointment');
        }
        if ($appt['appointment_status'] === 'CHECKED_IN') {
            fail('A checked-in appointment cannot be cancelled. Please see the counter staff.', 409, 'checked_in');
        }
        if ($appt['appointment_status'] === 'CANCELLED') {
            fail('This appointment is already cancelled.', 409, 'cancelled');
        }

        $sched = fetch_schedule($pdo, (int) $appt['schedule_id'], true);

        $stmt = $pdo->prepare("UPDATE appointments SET appointment_status = 'CANCELLED' WHERE appointment_id = ?");
        $stmt->execute([(int) $appt['appointment_id']]);

        if ($sched && (int) $sched['booked_slots'] > 0) {
            $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots - 1 WHERE schedule_id = ?');
            $stmt->execute([(int) $sched['schedule_id']]);
        }

        notify(
            $pdo,
            (int) $user['user_id'],
            'Appointment cancelled',
            'Your appointment for ' . ($sched ? $sched['schedule_date'] : '') . ' was cancelled and the slot was released. Control number ' . $app['control_number'] . ' stays the same.'
        );

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }

    $appt = fetch_appointment_for_application($pdo, (int) $app['application_id']);

    json_ok([
        'message'        => 'Appointment cancelled. The slot has been released.',
        'control_number' => $app['control_number'],
        'appointment'    => public_appointment($appt),
    ]);
}

/* ==========================================================================
   EMPLOYEE PORTAL ENDPOINTS
   --------------------------------------------------------------------------
   Every action below requires an EMPLOYEE session (require_employee()).
   They reuse the exact client-facing business cores (perform_checkin /
   perform_late_requeue) so the office terminal can never do anything the
   client API cannot: same windows, same capacity rules, same strict queue
   ordering. Identity is enforced server-side; the portal only renders.
   ========================================================================== */

// One joined appointment row for the office dashboard tables.
function fetch_office_appointments(PDO $pdo, string $date): array
{
    $stmt = $pdo->prepare(
        "SELECT a.appointment_id, a.appointment_status, a.schedule_id, a.created_at,
                ap.application_id, ap.control_number, ap.current_status AS application_status,
                ap.requested_output_type,
                cp.client_id, cp.first_name, cp.last_name, u.contact_number,
                at_.service_name AS assistance_type,
                s.schedule_date, s.time_window, s.max_slots, s.booked_slots, s.is_locked,
                q.queue_id, q.queue_number, q.queue_type, q.queue_status, q.called_at
         FROM appointments a
         JOIN applications ap        ON ap.application_id = a.application_id
         JOIN client_profiles cp     ON cp.client_id = ap.client_id
         JOIN users u                ON u.user_id = cp.user_id
         JOIN assistance_types at_   ON at_.assistance_type_id = ap.assistance_type_id
         JOIN schedule_capacities s  ON s.schedule_id = a.schedule_id
         LEFT JOIN queues q          ON q.application_id = ap.application_id
                                    AND q.queue_date = s.schedule_date
         WHERE s.schedule_date = ?
         ORDER BY s.time_window ASC, a.appointment_id ASC, q.queue_id ASC"
    );
    $stmt->execute([$date]);
    return $stmt->fetchAll();
}

// Collapse joined rows (an application can hold several queue rows over the
// day: an invalidated NO_SHOW OV ticket plus the live RQ ticket) into one
// row per appointment, keeping the ACTIVE ticket and the invalidation count.
function collapse_office_rows(array $rows): array
{
    $byAppointment = [];
    foreach ($rows as $row) {
        $id = (int) $row['appointment_id'];
        if (!isset($byAppointment[$id])) {
            $byAppointment[$id] = $row;
            $byAppointment[$id]['queue_invalidated'] = 0;
        }
        if ($row['queue_id'] !== null) {
            if (in_array($row['queue_status'], ['WAITING', 'CALLED', 'SERVING'], true)) {
                $byAppointment[$id]['queue_id'] = $row['queue_id'];
                $byAppointment[$id]['queue_number'] = $row['queue_number'];
                $byAppointment[$id]['queue_type'] = $row['queue_type'];
                $byAppointment[$id]['queue_status'] = $row['queue_status'];
                $byAppointment[$id]['called_at'] = $row['called_at'];
            } elseif ($row['queue_status'] === 'NO_SHOW') {
                $byAppointment[$id]['queue_invalidated']++;
            }
        }
    }
    return array_values($byAppointment);
}

function office_appointment_row(array $row, DateTimeImmutable $now): array
{
    $win = $row['time_window'];
    $sched = [
        'schedule_id'   => (int) $row['schedule_id'],
        'schedule_date' => $row['schedule_date'],
        'time_window'   => $win,
        'booked_slots'  => (int) $row['booked_slots'],
        'max_slots'     => (int) $row['max_slots'],
        'is_locked'     => (int) $row['is_locked'],
        'state'         => session_window_state($win, $row['schedule_date'], $now),
    ];

    return [
        'appointment_id'     => (int) $row['appointment_id'],
        'appointment_status' => $row['appointment_status'],
        'created_at'         => $row['created_at'],
        'application_id'     => (int) $row['application_id'],
        'control_number'     => $row['control_number'],
        'application_status' => $row['application_status'],
        'assistance_type'    => $row['assistance_type'],
        'client_id'          => (int) $row['client_id'],
        'client_name'        => trim($row['first_name'] . ' ' . $row['last_name']),
        'contact_number'     => $row['contact_number'] ?? null,
        'schedule'           => $sched,
        'queue_id'           => $row['queue_id'] !== null ? (int) $row['queue_id'] : null,
        'queue_number'       => $row['queue_number'],
        'queue_type'         => $row['queue_type'],
        'queue_status'       => $row['queue_status'],
        'queue_invalidated'  => (int) $row['queue_invalidated'],
        'called_at'          => $row['called_at'],
        'checkin'            => checkin_state(
            ['appointment_status' => $row['appointment_status']],
            ['schedule_date' => $row['schedule_date'], 'time_window' => $win],
            $now
        ),
    ];
}

// Open / late-lane / closed state of one session window for the dashboard.
function session_window_state(string $window, string $date, DateTimeImmutable $now): string
{
    $today = $now->format('Y-m-d');
    if ($date > $today) {
        return 'UPCOMING';
    }
    if ($date < $today) {
        return 'PAST';
    }
    $win = checkin_window($window);
    $nowMin = now_minutes($now);
    if ($nowMin < $win['open']) {
        return 'PRE_OPEN';
    }
    if ($nowMin < $win['ontime_end']) {
        return 'OPEN';
    }
    if ($window === 'PM') {
        // PM on-time end == session end: at/after 5:00 PM the operational day
        // is concluded (PM-late → mandatory reschedule).
        return 'DAY_CONCLUDED';
    }
    if ($nowMin < $win['end']) {
        return 'LATE_LANE'; // AM 11:00–12:00: late clients may still roll to PM
    }
    return 'CLOSED';
}

function action_dashboard(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $date = isset($_GET['date']) ? validate_date($_GET['date']) : $now->format('Y-m-d');

    $rows = collapse_office_rows(fetch_office_appointments($pdo, $date));
    $appointments = array_map(fn ($row) => office_appointment_row($row, $now), $rows);

    $summary = [
        'date'        => $date,
        'scheduled'   => 0,
        'checked_in'  => 0,
        'late'        => 0,
        'rescheduled' => 0,
        'cancelled'   => 0,
    ];
    foreach ($appointments as $row) {
        switch ($row['appointment_status']) {
            case 'SCHEDULED':  $summary['scheduled']++;   break;
            case 'CHECKED_IN': $summary['checked_in']++;  break;
            case 'LATE':       $summary['late']++;        break;
            case 'RESCHEDULED': $summary['rescheduled']++; break;
            case 'CANCELLED':  $summary['cancelled']++;   break;
        }
    }

    // Slot counters straight from schedule_capacities (booked_slots is the
    // single source of truth — never recomputed client-side).
    $stmt = $pdo->prepare(
        'SELECT schedule_id, time_window, max_slots, booked_slots, is_locked FROM schedule_capacities WHERE schedule_date = ?'
    );
    $stmt->execute([$date]);
    $slots = ['AM' => null, 'PM' => null];
    foreach ($stmt->fetchAll() as $s) {
        $capacity = effective_capacity($s);
        $slots[$s['time_window']] = [
            'schedule_id'   => (int) $s['schedule_id'],
            'max_slots'     => $capacity,
            'booked_slots'  => (int) $s['booked_slots'],
            'remaining'     => max(0, $capacity - (int) $s['booked_slots']),
            'is_locked'     => (int) $s['is_locked'],
            'state'         => session_window_state($s['time_window'], $date, $now),
        ];
    }

    json_ok([
        'summary'      => $summary,
        'slots'        => $slots,
        'appointments' => $appointments,
        'total'        => count($appointments),
    ]);
}

function action_queue(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $date = isset($_GET['date']) ? validate_date($_GET['date']) : $now->format('Y-m-d');

    $stmt = $pdo->prepare(
        "SELECT q.*, ap.control_number, cp.first_name, cp.last_name
         FROM queues q
         JOIN applications ap    ON ap.application_id = q.application_id
         JOIN client_profiles cp ON cp.client_id = ap.client_id
         WHERE q.queue_date = ?
         ORDER BY q.queue_id ASC"
    );
    $stmt->execute([$date]);

    $tickets = [];
    foreach ($stmt->fetchAll() as $row) {
        $tickets[] = [
            'queue_id'       => (int) $row['queue_id'],
            'queue_number'   => $row['queue_number'],
            'queue_type'     => $row['queue_type'],
            'queue_status'   => $row['queue_status'],
            'time_window'    => $row['time_window'],
            'called_at'      => $row['called_at'],
            'control_number' => $row['control_number'],
            'client_name'    => trim($row['first_name'] . ' ' . $row['last_name']),
            'is_requeue'     => $row['queue_type'] === 'RE_QUEUE',
            'end_of_line'    => $row['queue_type'] === 'RE_QUEUE',
        ];
    }

    json_ok(['date' => $date, 'tickets' => $tickets]);
}

function action_capacities(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $year = (int) ($_GET['year'] ?? $now->format('Y'));
    $month = (int) ($_GET['month'] ?? $now->format('n'));
    if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
        fail('Please provide a valid year and month.', 400, 'bad_date');
    }

    $stmt = $pdo->prepare(
        'SELECT schedule_id, schedule_date, time_window, max_slots, booked_slots, is_locked
         FROM schedule_capacities
         WHERE schedule_date LIKE ?
         ORDER BY schedule_date ASC, time_window ASC'
    );
    $stmt->execute([sprintf('%04d-%02d-%%', $year, $month)]);

    $days = [];
    foreach ($stmt->fetchAll() as $row) {
        $date = $row['schedule_date'];
        if (!isset($days[$date])) {
            $days[$date] = [
                'date'     => $date,
                'weekday'  => (int) DateTimeImmutable::createFromFormat('Y-m-d', $date)->format('N'),
                'sessions' => [],
            ];
        }
        $capacity = effective_capacity($row);
        $booked = (int) $row['booked_slots'];
        $days[$date]['sessions'][$row['time_window']] = [
            'schedule_id'  => (int) $row['schedule_id'],
            'booked_slots' => $booked,
            'max_slots'    => $capacity,
            'remaining'    => max(0, $capacity - $booked),
            'is_locked'    => (int) $row['is_locked'],
            'state'        => session_window_state($row['time_window'], $date, $now),
        ];
    }

    json_ok(['year' => $year, 'month' => $month, 'days' => array_values($days)]);
}

// Resolve an application by its permanent control number for office actions.
function fetch_application_by_control_number(PDO $pdo, string $controlNumber): ?array
{
    $stmt = $pdo->prepare(
        "SELECT * FROM applications
         WHERE control_number = ? AND application_type = 'ONLINE'
         LIMIT 1"
    );
    $stmt->execute([strtoupper(trim($controlNumber))]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function action_employee_checkin(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $body = read_json_body();
    $controlNumber = trim((string) ($body['control_number'] ?? ''));
    if ($controlNumber === '') {
        fail('Please provide the client control number (e.g. OL-2026-0001).', 400, 'missing_control_number');
    }

    $app = fetch_application_by_control_number($pdo, $controlNumber);
    if (!$app) {
        fail('No ONLINE application was found for control number ' . strtoupper($controlNumber) . '.', 404, 'unknown_control_number');
    }

    perform_checkin($pdo, $app, $now);
}

function action_employee_requeue(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $body = read_json_body();
    $controlNumber = trim((string) ($body['control_number'] ?? ''));
    if ($controlNumber === '') {
        fail('Please provide the client control number (e.g. OL-2026-0001).', 400, 'missing_control_number');
    }

    $app = fetch_application_by_control_number($pdo, $controlNumber);
    if (!$app) {
        fail('No ONLINE application was found for control number ' . strtoupper($controlNumber) . '.', 404, 'unknown_control_number');
    }

    perform_late_requeue($pdo, $app, $now);
}

// Call & serve: WAITING/CALLED → COMPLETED. `called_at` is stamped when the
// ticket first leaves WAITING. The appointment itself stays CHECKED_IN —
// queue completion is a QUEUE status (schema enum), not an appointment one.
function action_serve(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $body = read_json_body();
    $queueId = (int) ($body['queue_id'] ?? 0);
    if ($queueId <= 0) {
        fail('Please provide the queue ticket to serve.', 400, 'missing_queue_id');
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM queues WHERE queue_id = ? FOR UPDATE');
        $stmt->execute([$queueId]);
        $queue = $stmt->fetch();
        if (!$queue) {
            fail('Queue ticket not found.', 404, 'unknown_queue');
        }
        if (!in_array($queue['queue_status'], ['WAITING', 'CALLED', 'SERVING'], true)) {
            fail('This queue ticket is already completed or invalidated.', 409, 'not_active');
        }

        $calledAt = $queue['called_at'] ?? null;
        if ($calledAt === null) {
            $calledAt = $now->format('Y-m-d H:i:s');
        }
        $stmt = $pdo->prepare("UPDATE queues SET queue_status = 'COMPLETED', called_at = ? WHERE queue_id = ?");
        $stmt->execute([$calledAt, $queueId]);

        $stmt = $pdo->prepare('SELECT application_id FROM queues WHERE queue_id = ?');
        $stmt->execute([$queueId]);
        $applicationId = (int) $stmt->fetchColumn();

        $notifyUserId = client_user_id_for_application($pdo, $applicationId);
        if ($notifyUserId > 0) {
            notify(
                $pdo,
                $notifyUserId,
                'Queue ticket served',
                'Queue ticket ' . $queue['queue_number'] . ' has been served. Thank you for visiting the CSWDO Pasig office.'
            );
        }

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }

    $stmt = $pdo->prepare('SELECT * FROM queues WHERE queue_id = ?');
    $stmt->execute([$queueId]);

    json_ok([
        'message' => 'Queue ticket ' . $queue['queue_number'] . ' marked as served.',
        'queue'   => public_queue($stmt->fetch()),
    ]);
}

// Office-side status correction with the same slot-hygiene rules as the
// client cancel path: releasing a booking frees its slot; nothing else
// changes slot counters (checked-in clients keep their slot until served).
function action_set_appointment_status(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $body = read_json_body();
    $appointmentId = (int) ($body['appointment_id'] ?? 0);
    $status = strtoupper(trim((string) ($body['status'] ?? '')));

    if ($appointmentId <= 0) {
        fail('Please provide the appointment to update.', 400, 'missing_appointment_id');
    }
    if (!in_array($status, ['SCHEDULED', 'CANCELLED'], true)) {
        fail('Office status updates support SCHEDULED or CANCELLED only. Check-in and re-queue run through their own procedures.', 400, 'bad_status');
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM appointments WHERE appointment_id = ? FOR UPDATE');
        $stmt->execute([$appointmentId]);
        $appt = $stmt->fetch();
        if (!$appt) {
            fail('Appointment not found.', 404, 'unknown_appointment');
        }
        if ($appt['appointment_status'] === $status) {
            fail('This appointment is already ' . strtolower($status) . '.', 409, 'same_status');
        }

        $sched = fetch_schedule($pdo, (int) $appt['schedule_id'], true);

        if ($status === 'CANCELLED') {
            if (in_array($appt['appointment_status'], ['CANCELLED'], true)) {
                fail('This appointment is already cancelled.', 409, 'cancelled');
            }
            if ($appt['appointment_status'] === 'CHECKED_IN') {
                fail('A checked-in client must be served through the queue, not cancelled. Use the queue manager.', 409, 'checked_in');
            }
            $stmt = $pdo->prepare("UPDATE appointments SET appointment_status = 'CANCELLED' WHERE appointment_id = ?");
            $stmt->execute([$appointmentId]);
            if ($sched && (int) $sched['booked_slots'] > 0) {
                $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots - 1 WHERE schedule_id = ?');
                $stmt->execute([(int) $sched['schedule_id']]);
            }
        } else { // SCHEDULED (re-activate a cancelled appointment)
            if ($appt['appointment_status'] !== 'CANCELLED') {
                fail('Only a cancelled appointment can be set back to SCHEDULED.', 409, 'bad_status');
            }
            if (!$sched) {
                fail('The appointment schedule row is missing.', 500, 'schedule_missing');
            }
            if ((int) $sched['is_locked'] === 1) {
                fail('The session is locked by the office.', 409, 'locked');
            }
            $capacity = effective_capacity($sched);
            if ((int) $sched['booked_slots'] >= $capacity) {
                fail('The session is already full. Choose another session to re-activate this appointment.', 409, 'no_capacity');
            }
            $stmt = $pdo->prepare("UPDATE appointments SET appointment_status = 'SCHEDULED' WHERE appointment_id = ?");
            $stmt->execute([$appointmentId]);
            $stmt = $pdo->prepare('UPDATE schedule_capacities SET booked_slots = booked_slots + 1 WHERE schedule_id = ?');
            $stmt->execute([(int) $sched['schedule_id']]);
        }

        $notifyUserId = client_user_id_for_application($pdo, (int) $appt['application_id']);
        if ($notifyUserId > 0) {
            notify(
                $pdo,
                $notifyUserId,
                'Appointment updated by the office',
                'Your appointment status was updated to ' . $status . ' by CSWDO staff. Your control number stays the same.'
            );
        }

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }

    $stmt = $pdo->prepare('SELECT * FROM appointments WHERE appointment_id = ?');
    $stmt->execute([$appointmentId]);
    $appt = $stmt->fetch();

    json_ok([
        'message'     => 'Appointment status updated to ' . $status . '.',
        'appointment' => public_appointment($appt),
    ]);
}

// Office closure control: flip is_locked on one session row (a locked window
// refuses booking, check-in re-queue targets and re-activation).
function action_toggle_lock(): void
{
    $pdo = cswdo_db();
    $now = now_dt();
    require_employee();

    $body = read_json_body();
    $scheduleId = (int) ($body['schedule_id'] ?? 0);
    if ($scheduleId <= 0) {
        fail('Please provide the schedule session to lock or unlock.', 400, 'missing_schedule_id');
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM schedule_capacities WHERE schedule_id = ? FOR UPDATE');
        $stmt->execute([$scheduleId]);
        $sched = $stmt->fetch();
        if (!$sched) {
            fail('Schedule session not found.', 404, 'unknown_schedule');
        }

        $newLocked = ((int) $sched['is_locked'] === 1) ? 0 : 1;
        $stmt = $pdo->prepare('UPDATE schedule_capacities SET is_locked = ? WHERE schedule_id = ?');
        $stmt->execute([$newLocked, $scheduleId]);

        $pdo->commit();
    } catch (ApiException $e) {
        $pdo->rollBack();
        throw $e;
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_ok([
        'message'   => ($newLocked === 1 ? 'Session locked — clients can no longer book into it.' : 'Session unlocked — clients can book into it again.'),
        'schedule'  => public_schedule(array_merge($sched, ['is_locked' => $newLocked]), $now),
    ]);
}

// Resolve the notification target (client_profiles.user_id) for an application.
function client_user_id_for_application(PDO $pdo, int $applicationId): int
{
    $stmt = $pdo->prepare(
        'SELECT cp.user_id FROM applications ap JOIN client_profiles cp ON cp.client_id = ap.client_id WHERE ap.application_id = ?'
    );
    $stmt->execute([$applicationId]);
    return (int) ($stmt->fetchColumn() ?: 0);
}
