<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

require_method('POST');
require_csrf_token();

$_SESSION = [];
$cookie = session_get_cookie_params();
if (ini_get('session.use_cookies')) {
    $cookieOptions = [
        'expires' => time() - 42000,
        'path' => $cookie['path'] ?: '/',
        'secure' => (bool)$cookie['secure'],
        'httponly' => true,
        'samesite' => 'Lax',
    ];
    if ($cookie['domain'] !== '') {
        $cookieOptions['domain'] = $cookie['domain'];
    }
    setcookie(session_name(), '', $cookieOptions);
}
session_destroy();

json_response(200, true, 'Signed out successfully.');
