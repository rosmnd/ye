<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth.php';

require_method('GET');

try {
    $user = isset($_SESSION['user_id'])
        ? current_session_user(database_connection())
        : null;

    json_response(200, true, 'Session status retrieved.', [
        'user' => $user,
        'csrfToken' => (string)$_SESSION['csrf_token'],
    ]);
} catch (Throwable $error) {
    error_log('[CSWDO] Session lookup failed: ' . $error->getMessage());
    json_response(
        500,
        false,
        'The session could not be checked. Verify the database configuration and try again.'
    );
}
