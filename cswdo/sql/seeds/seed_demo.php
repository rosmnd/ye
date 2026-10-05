<?php
/**
 * CSWDO Pasig — demo seeder for the Online Appointment & Scheduling module.
 *
 * Usage (from the project root):
 *   C:\xampp\php\php.exe seed\seed_demo.php          # first-time / additive
 *   C:\xampp\php\php.exe seed\seed_demo.php --reset  # wipe demo rows + re-seed
 *
 * The schema itself comes from sql/cswdo_db.sql (import it first — no tables are
 * created here). Existing rows are never modified unless --reset is passed.
 *
 * Seeds (matching test_api.sh):
 *   users            juandelacruz / mariasantos / pedroramos / rosareyes (CLIENT, password "client123")
 *   client_profiles  one per user
 *   applications     OL-2026-0001 (juan), OL-2026-0002 (maria), OL-2026-0003 (rosa),
 *                    OL-2026-0004 (pedro) — all ONLINE; plus WI-2026-0001 WALK_IN (juan)
 *                    to prove the module only processes ONLINE applications
 *   history/notify   one status-history row per application, one welcome notification per user
 *   schedule rows    today + the next 14 working days: AM/PM, max_slots = 30, booked 0
 *                    (demo variety: today AM 6 / PM 12; next working AM 24 / PM 3;
 *                    next+1 AM 30 = FULL; 5th working day locked)
 */

require_once __DIR__ . '/../../api/config.php';

$isReset = in_array('--reset', $argv, true);

function seed_out(string $message): void
{
    echo $message . PHP_EOL;
}

function seed_fail(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

// ---------------------------------------------------------------------------
// Connect.
// ---------------------------------------------------------------------------
$dsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', CSWDO_DB_HOST, CSWDO_DB_PORT);
try {
    $pdo = new PDO($dsn, CSWDO_DB_USER, CSWDO_DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    seed_fail('[X] Cannot reach MariaDB. Start it from the XAMPP Control Panel, then re-run this script.');
}

// ---------------------------------------------------------------------------
// Schema check (import sql/cswdo_db.sql first — this script never creates tables).
// ---------------------------------------------------------------------------
$hasSchema = $pdo->query("SHOW TABLES FROM `" . CSWDO_DB_NAME . "` LIKE 'applications'")->fetchColumn();
if (!$hasSchema) {
    seed_fail(
        "[X] The cswdo_db schema is missing.\n" .
        "    Import the dump first:\n" .
        '    mysql -u root -e "CREATE DATABASE IF NOT EXISTS cswdo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"' . "\n" .
        '    mysql -u root cswdo_db < sql/cswdo_db.sql' . "\n" .
        '    (XAMPP client: C:\\xampp\\mysql\\bin\\mysql.exe)'
    );
}
$pdo->exec('USE `' . CSWDO_DB_NAME . '`');

// ---------------------------------------------------------------------------
// Idempotency / reset.
// ---------------------------------------------------------------------------
$userCount = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'CLIENT'")->fetchColumn();
if ($userCount > 0 && !$isReset) {
    seed_out("[i] Demo data already present ({$userCount} CLIENT users). Use --reset to wipe and re-seed.");
    exit(0);
}

// FK-safe wipe (autocommit — DDL below cannot run inside a transaction).
$pdo->exec('DELETE FROM queues');
$pdo->exec('DELETE FROM application_status_history');
$pdo->exec('DELETE FROM appointments');
$pdo->exec('DELETE FROM notifications');
$pdo->exec('DELETE FROM applications');
$pdo->exec('DELETE FROM client_profiles');
$pdo->exec('DELETE FROM employees');
$pdo->exec("DELETE FROM users WHERE role = 'CLIENT'");
$pdo->exec("DELETE FROM users WHERE role = 'EMPLOYEE'");
$pdo->exec('DELETE FROM assistance_types');
$pdo->exec("UPDATE schedule_capacities SET booked_slots = 0, is_locked = 0");

// Restart identity counters so a --reset seed always lands on the same
// deterministic IDs (application_id 1-4 = OL-2026-0001..0004) that the
// test harness and documentation reference. DDL auto-commits in MariaDB,
// so these run BEFORE the transactional insert block below.
foreach (
    ['users', 'client_profiles', 'employees', 'applications', 'application_status_history',
     'notifications', 'queues', 'appointments', 'assistance_types'] as $counterTable
) {
    $pdo->exec("ALTER TABLE `{$counterTable}` AUTO_INCREMENT = 1");
}

$pdo->beginTransaction();
try {

    // ---------------------------------------------------------------
    // assistance_types
    // ---------------------------------------------------------------
    $assistanceTypes = [
        ['Medical Assistance', 'Medical / hospitalization support for indigent patients.', 3],
        ['Burial Assistance', 'Funeral and burial support for deceased family members.', 3],
        ['Educational Assistance', 'Educational support for qualified students.', 6],
        ['Solo Parent Services', 'Support programs for solo parents.', 3],
        ['PWD Welfare Services', 'Programs and assistance for persons with disabilities.', 3],
        ['Senior Citizen Pension Intake', 'Intake and scheduling for senior citizen pension applicants.', 3],
    ];
    $stmtType = $pdo->prepare('INSERT INTO assistance_types (service_name, description, cooldown_months) VALUES (?, ?, ?)');
    $typeIds = [];
    foreach ($assistanceTypes as [$name, $desc, $cooldown]) {
        $stmtType->execute([$name, $desc, $cooldown]);
        $typeIds[] = (int) $pdo->lastInsertId();
    }

    // ---------------------------------------------------------------
    // users + client_profiles
    // ---------------------------------------------------------------
    $passwordHash = password_hash('client123', PASSWORD_DEFAULT);
    $clients = [
        ['juandelacruz', 'juan.delacruz@example.com',  '09171000001', 'PP-2026-0001', 'Juan',    'Dela Cruz', '1988-04-12', '34', 'Male',   'Married', 'Santo Rosario - Studio'],
        ['mariasantos',  'maria.santos@example.com',   '09171000002', 'PP-2026-0002', 'Maria',   'Santos',    '1992-09-03', '34', 'Female', 'Single',  'Malinao - Studio'],
        ['pedroramos',   'pedro.ramos@example.com',    '09171000003', 'PP-2026-0003', 'Pedro',   'Ramos',     '1975-01-20', '51', 'Male',   'Widowed', 'Pineda - Studio'],
        ['rosareyes',    'rosa.reyes@example.com',     '09171000004', 'PP-2026-0004', 'Rosa',    'Reyes',     '2000-11-30', '25', 'Female', 'Single',  'Kasilag - Studio'],
    ];

    $stmtUser = $pdo->prepare(
        'INSERT INTO users (username, password_hash, email, contact_number, role, pasig_pass_id)
         VALUES (?, ?, ?, ?, "CLIENT", ?)'
    );
    $stmtProfile = $pdo->prepare(
        'INSERT INTO client_profiles
            (user_id, first_name, last_name, birth_date, birth_place, age, sex, civil_status,
             full_address, housing_status, monthly_income, occupation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "Renter", 12000.00, "Utility Staff")'
    );

    $clientIds = [];
    foreach ($clients as [$username, $email, $contact, $pasigPass, $first, $last, $birth, $age, $sex, $civil, $street]) {
        $stmtUser->execute([$username, $passwordHash, $email, $contact, $pasigPass]);
        $userId = (int) $pdo->lastInsertId();
        $fullAddress = $street . ', Barangay ' . rand(1, 30) . ', Pasig City';
        $stmtProfile->execute([
            $userId, $first, $last, $birth, 'Pasig City', $age, $sex, $civil, $fullAddress,
        ]);
        $clientIds[$username] = [
            'client_id' => (int) $pdo->lastInsertId(),
            'user_id'   => $userId,
            'name'      => $first . ' ' . $last,
        ];
    }

    // ---------------------------------------------------------------
    // applications (ONLINE with permanent OL-YYYY-#### control numbers
    // + one WALK_IN that this module must ignore).
    // ---------------------------------------------------------------
    $applications = [
        ['OL-2026-0001', $clientIds['juandelacruz'], $typeIds[0], 'Direct Financial Assistance', 'FOR_REVIEW',             '2026-09-24 09:15:00'],
        ['OL-2026-0002', $clientIds['mariasantos'],  $typeIds[1], 'Social Case Study Report',     'FOR_REVIEW',             '2026-09-25 10:40:00'],
        ['OL-2026-0003', $clientIds['rosareyes'],    $typeIds[2], 'Certificate of Indigency',     'APPLICATION_SUBMITTED',  '2026-09-28 14:05:00'],
        ['OL-2026-0004', $clientIds['pedroramos'],   $typeIds[0], 'Direct Financial Assistance',  'FOR_REVIEW',             '2026-09-29 08:30:00'],
        ['WI-2026-0001', $clientIds['juandelacruz'], $typeIds[3], 'Other',                        'FOR_REVIEW',             '2026-09-30 11:20:00'],
    ];
    $stmtApp = $pdo->prepare(
        'INSERT INTO applications
            (control_number, client_id, assistance_type_id, requested_output_type, application_type, current_status, submission_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmtHist = $pdo->prepare(
        'INSERT INTO application_status_history (application_id, status_from, status_to, changed_by_user_id, remarks)
         VALUES (?, ?, ?, ?, ?)'
    );

    $appIds = [];
    foreach ($applications as $i => [$control, $client, $typeId, $output, $status, $submitted]) {
        $appType = str_starts_with($control, 'WI-') ? 'WALK_IN' : 'ONLINE';
        $stmtApp->execute([$control, $client['client_id'], $typeId, $output, $appType, $status, $submitted]);
        $appId = (int) $pdo->lastInsertId();
        $appIds[$control] = $appId;

        // Exactly one history row per application (status_from = submitted,
        // status_to = current). The appointment module itself never rewrites
        // the application status — it only maintains what already exists.
        $stmtHist->execute([
            $appId,
            'APPLICATION_SUBMITTED',
            $status,
            $client['user_id'],
            'Application ' . $control . ' received (' . $appType . ').',
        ]);
    }

    // ---------------------------------------------------------------
    // notifications (one welcome notice per demo client).
    // ---------------------------------------------------------------
    $stmtNotify = $pdo->prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)');
    foreach ($clientIds as $username => $info) {
        $stmtNotify->execute([
            $info['user_id'],
            'Welcome to CSWDO Pasig Online Appointments',
            'You can now schedule your interview/verification session online. Your permanent control number follows the OL-YYYY-#### format and never changes; temporary queue numbers are issued only after check-in.',
        ]);
    }

    // ---------------------------------------------------------------
    // schedule_capacities: today + the next 14 working days, always
    // max_slots = 30 (the dump default of 50 is never used). Rows are
    // created with INSERT IGNORE so UNIQUE(schedule_date, time_window)
    // prevents duplicates. Demo variety shows the Almost Full / Full /
    // Locked card states in the UI.
    // ---------------------------------------------------------------
    date_default_timezone_set(CSWDO_TIMEZONE);
    $workingDays = [];
    $cursor = new DateTimeImmutable('today');
    while (count($workingDays) < 15) {
        if ((int) $cursor->format('N') <= 5) {
            $workingDays[] = $cursor->format('Y-m-d');
        }
        $cursor = $cursor->modify('+1 day');
    }

    $variety = [
        0 => ['AM' => 6,  'PM' => 12],  // today: available
        1 => ['AM' => 24, 'PM' => 3],   // next working day: AM almost full
        2 => ['AM' => 30, 'PM' => 0],   // next+1: AM full (30/30)
    ];
    $lockIndex = 5; // 5th working day from today: locked by the office (demo)

    $stmtSched = $pdo->prepare(
        'INSERT IGNORE INTO schedule_capacities (schedule_date, time_window, max_slots, booked_slots, is_locked)
         VALUES (?, ?, 30, ?, ?)'
    );
    foreach ($workingDays as $index => $date) {
        foreach (['AM', 'PM'] as $window) {
            $booked = $variety[$index][$window] ?? 0;
            $locked = ($index === $lockIndex) ? 1 : 0;
            $stmtSched->execute([$date, $window, $booked, $locked]);
        }
    }

    // ---------------------------------------------------------------
    // employees (staff identity for the employee portal). The appointment
    // module's employee endpoints require this role via auth.php login.
    // ---------------------------------------------------------------
    $stmtEmpUser = $pdo->prepare(
        'INSERT INTO users (username, password_hash, email, contact_number, role, pasig_pass_id)
         VALUES (?, ?, ?, ?, "EMPLOYEE", ?)'
    );
    $stmtEmpUser->execute([
        'cswdostaff',
        password_hash('staff123', PASSWORD_DEFAULT),
        'cswdo.staff@example.com',
        '09171000090',
        'PP-EMP-0001',
    ]);
    $empUserId = (int) $pdo->lastInsertId();
    $pdo->prepare(
        'INSERT INTO employees (user_id, employee_number, first_name, last_name, position)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([$empUserId, 'CSWDO-E-0001', 'Maria', 'Santos', 'Welfare Officer']);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    seed_fail('[X] Seeding failed: ' . $e->getMessage());
}

seed_out('[OK] Demo data seeded successfully.');
seed_out('     users:            juandelacruz / mariasantos / pedroramos / rosareyes (CLIENT, password "client123")');
seed_out('     employees:        cswdostaff (EMPLOYEE, password "staff123") — Welfare Officer Maria Santos');
seed_out('     applications:     OL-2026-0001 (juan) · OL-2026-0002 (maria) · OL-2026-0003 (rosa) · OL-2026-0004 (pedro) · WI-2026-0001 (walk-in)');
seed_out('     schedules:        today + next 14 working days, AM/PM, max_slots = 30 (variety + one locked day)');
seed_out('');
seed_out('Next steps:');
seed_out('  1. Serve the module:  C:\\xampp\\php\\php.exe -S 127.0.0.1:8792   (from this folder)');
seed_out('  2. Open:              http://127.0.0.1:8792/cswdo_client_appointment_module.html');
seed_out('  3. Employee portal:  http://127.0.0.1:8792/cswdo_employee_appointment_module.html (no login screen)');
seed_out('  4. Run the tests:    TEST_MODE=true in api/config.php, then bash test_api.sh');
