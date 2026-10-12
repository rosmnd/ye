<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');

if (session_status() !== PHP_SESSION_ACTIVE) {
    $isHttps = isset($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
    session_name('CSWDO_MIS');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

$_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

function json_response(
    int $status,
    bool $success,
    string $message,
    array $data = []
): never {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function require_method(string $expected): void
{
    $actual = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($actual !== strtoupper($expected)) {
        header('Allow: ' . strtoupper($expected));
        json_response(405, false, 'This request method is not allowed.');
    }
}

function request_payload(): array
{
    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_contains($contentType, 'application/json')) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode($raw ?: '', true);
        if (!is_array($decoded)) {
            json_response(400, false, 'The request body must contain valid JSON.');
        }
        return $decoded;
    }

    return is_array($_POST ?? null) ? $_POST : [];
}

function require_csrf_token(): void
{
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') {
        $originParts = parse_url($origin);
        $requestHost = (string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
        $requestParts = parse_url('http://' . $requestHost);
        $requestIsHttps = isset($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
        $requestScheme = $requestIsHttps ? 'https' : 'http';
        $originScheme = strtolower((string)($originParts['scheme'] ?? ''));
        $originHost = strtolower((string)($originParts['host'] ?? ''));
        $requestHostName = strtolower((string)($requestParts['host'] ?? ''));
        $originPort = (int)($originParts['port'] ?? ($originScheme === 'https' ? 443 : 80));
        $requestPort = (int)($requestParts['port'] ?? ($requestIsHttps ? 443 : 80));

        if (
            !is_array($originParts) ||
            $originScheme !== $requestScheme ||
            $originHost === '' ||
            $originHost !== $requestHostName ||
            $originPort !== $requestPort
        ) {
            json_response(403, false, 'The request origin could not be verified.');
        }
    }

    $provided = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $expected = (string)($_SESSION['csrf_token'] ?? '');
    if ($provided === '' || $expected === '' || !hash_equals($expected, $provided)) {
        json_response(419, false, 'Your session has expired. Refresh the page and try again.');
    }
}
