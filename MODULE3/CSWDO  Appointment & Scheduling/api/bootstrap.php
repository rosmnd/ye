<?php
/**
 * CSWDO Pasig — Online Appointment & Scheduling
 * Bootstrap: session, PDO connection, JSON envelope helpers, demo identity.
 *
 * Every api/*.php entry point requires this file first.
 * All responses use the envelope { ok: true, ...fields } or
 * { ok: false, message: "...", error: "code" } with a proper HTTP status.
 */

require_once __DIR__ . '/config.php';

date_default_timezone_set(CSWDO_TIMEZONE);

// ---------------------------------------------------------------------------
// Session (PHP-native; the real CSWDO login module will set the same keys).
// ---------------------------------------------------------------------------
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// ---------------------------------------------------------------------------
// PDO connection to the existing cswdo_db.
// ---------------------------------------------------------------------------
function cswdo_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        CSWDO_DB_HOST,
        CSWDO_DB_PORT,
        CSWDO_DB_NAME
    );

    try {
        $pdo = new PDO($dsn, CSWDO_DB_USER, CSWDO_DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        throw new ApiException(
            'Cannot connect to the cswdo_db database. Start MariaDB and import cswdoDB.sql, then run php seed/seed_demo.php.',
            503,
            'db_unavailable'
        );
    }

    return $pdo;
}

// ---------------------------------------------------------------------------
// API exception + JSON envelope.
// ---------------------------------------------------------------------------
class ApiException extends RuntimeException
{
    private int $httpStatus;
    private string $errorCode;
    private array $extra;

    public function __construct(string $message, int $httpStatus = 400, string $errorCode = 'bad_request', array $extra = [])
    {
        parent::__construct($message);
        $this->httpStatus = $httpStatus;
        $this->errorCode  = $errorCode;
        $this->extra      = $extra;
    }

    public function httpStatus(): int { return $this->httpStatus; }
    public function errorCode(): string { return $this->errorCode; }
    public function extra(): array { return $this->extra; }
}

function json_ok(array $fields, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['ok' => true], $fields), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function json_fail(string $message, int $status = 400, string $errorCode = 'bad_request', array $extra = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(
        array_merge(['ok' => false, 'error' => $errorCode, 'message' => $message], $extra),
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

// Throws ApiException instead of exiting so transactions are rolled back by
// the central handler in each entry point.
function fail(string $message, int $status = 400, string $errorCode = 'bad_request', array $extra = []): void
{
    throw new ApiException($message, $status, $errorCode, $extra);
}

// ---------------------------------------------------------------------------
// Request body (JSON) + server clock.
// ---------------------------------------------------------------------------
function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        fail('Request body must be valid JSON.', 400, 'bad_json');
    }
    return $decoded;
}

// Server "now". Honors the X-CSWDO-Test-Now header ONLY while TEST_MODE is on
// (used by test_api.sh to simulate 7:00 AM, 9:00 AM, after-5-PM, ...).
function now_dt(): DateTimeImmutable
{
    if (CSWDO_TEST_MODE) {
        $override = $_SERVER['HTTP_X_CSWDO_TEST_NOW'] ?? null;
        if (is_string($override) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/', $override)) {
            return new DateTimeImmutable($override);
        }
    }
    return new DateTimeImmutable('now');
}

// ---------------------------------------------------------------------------
// Identity. Interim demo auto-session: every request without a session is
// bound to CSWDO_DEMO_USERNAME. Replace this block with the real CSWDO
// authentication when it is available — business endpoints only ever read
// the identity from here (never from request bodies).
// ---------------------------------------------------------------------------
function resolve_current_user(): array
{
    $pdo = cswdo_db();

    $userId = $_SESSION['cswdo_user_id'] ?? null;
    if ($userId !== null) {
        $stmt = $pdo->prepare(
            "SELECT * FROM users WHERE user_id = ? AND role = 'CLIENT' AND is_active = 1 LIMIT 1"
        );
        $stmt->execute([(int) $userId]);
        $user = $stmt->fetch();
        if ($user) {
            return [$user, load_client_profile($pdo, (int) $user['user_id'])];
        }
        unset($_SESSION['cswdo_user_id']); // stale session — fall through to demo identity
    }

    // Demo auto-session (documented assumption; swap for real login later).
    $stmt = $pdo->prepare(
        "SELECT * FROM users WHERE username = ? AND role = 'CLIENT' AND is_active = 1 LIMIT 1"
    );
    $stmt->execute([CSWDO_DEMO_USERNAME]);
    $user = $stmt->fetch();
    if (!$user) {
        fail(
            'No demo CLIENT user found. Import cswdoDB.sql and run php seed/seed_demo.php first.',
            503,
            'not_seeded'
        );
    }
    $_SESSION['cswdo_user_id'] = (int) $user['user_id'];

    return [$user, load_client_profile($pdo, (int) $user['user_id'])];
}

function load_client_profile(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT * FROM client_profiles WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $profile = $stmt->fetch();
    if (!$profile) {
        fail('No client profile is linked to this account.', 403, 'profile_missing');
    }
    return $profile;
}

// Authenticated CLIENT + profile, or a 401 error.
function require_client(): array
{
    [$user, $profile] = resolve_current_user();
    if (!$user || !$profile) {
        fail('You are not authorized to access this appointment.', 401, 'unauthorized');
    }
    return [$user, $profile];
}

function public_user(array $user, array $profile): array
{
    return [
        'user_id'   => (int) $user['user_id'],
        'username'  => $user['username'],
        'full_name' => trim($profile['first_name'] . ' ' . $profile['last_name']),
        'role'      => $user['role'],
        'client_id' => (int) $profile['client_id'],
    ];
}

// ---------------------------------------------------------------------------
// EMPLOYEE identity (employee portal). Session first (explicit staff sign-in
// via auth.php?action=staff_login, the production path), otherwise the demo
// officer auto-session — exactly mirroring resolve_current_user() for CLIENTs
// so the employee portal opens straight into the officer workspace with no
// login screen (interim assumption; the real CSWDO staff login plugs in here).
// The CLIENT session key is deliberately NOT touched, so both portals keep
// working side by side in the same browser.
// ---------------------------------------------------------------------------
function resolve_current_employee(): array
{
    $pdo = cswdo_db();

    $userId = $_SESSION['cswdo_user_id'] ?? null;
    if ($userId !== null) {
        $stmt = $pdo->prepare(
            "SELECT u.*, e.employee_id, e.employee_number, e.first_name, e.last_name, e.position
             FROM users u
             JOIN employees e ON e.user_id = u.user_id
             WHERE u.user_id = ? AND u.role IN ('EMPLOYEE', 'ADMIN') AND u.is_active = 1
             LIMIT 1"
        );
        $stmt->execute([(int) $userId]);
        $row = $stmt->fetch();
        if ($row) {
            return [$row, $row];
        }
    }

    // Demo auto-session for staff (documented assumption; swap for the real
    // CSWDO authentication at this exact point).
    $stmt = $pdo->prepare(
        "SELECT u.*, e.employee_id, e.employee_number, e.first_name, e.last_name, e.position
         FROM users u
         JOIN employees e ON e.user_id = u.user_id
         WHERE u.username = ? AND u.role IN ('EMPLOYEE', 'ADMIN') AND u.is_active = 1
         LIMIT 1"
    );
    $stmt->execute([CSWDO_DEMO_EMPLOYEE_USERNAME]);
    $row = $stmt->fetch();
    if (!$row) {
        fail(
            'No demo EMPLOYEE user found. Run php seed/seed_demo.php to create the officer account.',
            503,
            'not_seeded'
        );
    }

    return [$row, $row];
}

// Authenticated EMPLOYEE, or a 401/403 error.
function require_employee(): array
{
    [$user, $employee] = resolve_current_employee();
    if (!$user) {
        fail('You are not authorized to access this endpoint.', 401, 'unauthorized');
    }
    return [$user, $employee];
}

function public_employee(array $employee): array
{
    return [
        'user_id'         => (int) $employee['user_id'],
        'username'        => $employee['username'],
        'employee_id'     => (int) $employee['employee_id'],
        'employee_number' => $employee['employee_number'],
        'full_name'       => trim($employee['first_name'] . ' ' . $employee['last_name']),
        'position'        => $employee['position'],
        'role'            => $employee['role'],
    ];
}
