<?php
require_once __DIR__ . '/config.php';

session_start();
header('Content-Type: application/json; charset=utf-8');

function json_out(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400): void {
    json_out(['error' => $message], $status);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
            $pdo->exec("SET time_zone = '+00:00'");
        } catch (PDOException $e) {
            fail('Cannot connect to the database.', 500);
        }
    }
    return $pdo;
}

/** Reads the JSON body of a POST. Requires Content-Type: application/json (blocks cross-site form posts). */
function read_json(): array {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== 0) fail('Expected application/json.', 415);
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

/** Returns ['user_id' => int, 'employee_id' => int] for the signed-in admin, or stops with 401/403. */
function require_admin(): array {
    $pdo = db();

    if (empty($_SESSION['user_id']) && DEV_AUTO_LOGIN) {
        $id = $pdo->query("SELECT user_id FROM users WHERE role = 'ADMIN' AND is_active = 1 ORDER BY user_id LIMIT 1")->fetchColumn();
        if ($id) $_SESSION['user_id'] = (int)$id;
    }
    if (empty($_SESSION['user_id'])) {
        json_out(['error' => 'Please sign in.', 'redirect' => LOGIN_URL], 401);
    }

    $st = $pdo->prepare(
        "SELECT u.user_id, e.employee_id
           FROM users u
           LEFT JOIN employees e ON e.user_id = u.user_id
          WHERE u.user_id = ? AND u.role = 'ADMIN' AND u.is_active = 1"
    );
    $st->execute([$_SESSION['user_id']]);
    $row = $st->fetch();
    if (!$row) fail('Administrator access only.', 403);
    if (!$row['employee_id']) fail('This admin account has no employees record (admin_reviews.admin_id needs one).', 403);

    return ['user_id' => (int)$row['user_id'], 'employee_id' => (int)$row['employee_id']];
}

function priority_for_wait(int $minutes): string {
    return $minutes >= 10 ? 'OVERDUE' : ($minutes >= 5 ? 'REMINDER' : 'NORMAL');
}
