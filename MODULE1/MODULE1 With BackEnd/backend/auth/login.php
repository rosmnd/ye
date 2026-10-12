<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth.php';

require_method('POST');
require_csrf_token();
$input = request_payload();

$identity = trim((string)($input['username'] ?? ''));
$password = (string)($input['password'] ?? '');
if ($identity === '' || $password === '' || strlen($identity) > 100 || strlen($password) > 1024) {
    json_response(422, false, 'Enter your username or email address and password.');
}

try {
    $pdo = database_connection();
    $query = $pdo->prepare(
        'SELECT user_id, username, password_hash, role, is_active,
                failed_login_attempts, lockout_until
         FROM users
         WHERE username = :username OR email = :email
         LIMIT 1'
    );
    $query->execute(['username' => $identity, 'email' => $identity]);
    $user = $query->fetch();

    // Perform a password-hash check for unknown accounts as well, without
    // revealing whether the submitted username or email exists.
    $hashToCheck = $user
        ? (string)$user['password_hash']
        : password_hash('cswdo-dummy-login-check', PASSWORD_DEFAULT);
    $passwordMatches = password_verify($password, $hashToCheck);

    $isLocked = false;
    if ($user && !empty($user['lockout_until'])) {
        $lockout = new DateTimeImmutable((string)$user['lockout_until'], new DateTimeZone('UTC'));
        $isLocked = $lockout > new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    if (!$user || !$passwordMatches || (int)$user['is_active'] !== 1 || $isLocked) {
        if ($user && (int)$user['is_active'] === 1 && !$isLocked) {
            $attempts = (int)$user['failed_login_attempts'] + 1;
            if ($attempts >= 5) {
                $update = $pdo->prepare(
                    'UPDATE users
                     SET failed_login_attempts = :attempts,
                         lockout_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
                     WHERE user_id = :user_id'
                );
                $update->execute(['attempts' => $attempts, 'user_id' => $user['user_id']]);
            } else {
                $update = $pdo->prepare(
                    'UPDATE users
                     SET failed_login_attempts = :attempts, lockout_until = NULL
                     WHERE user_id = :user_id'
                );
                $update->execute(['attempts' => $attempts, 'user_id' => $user['user_id']]);
            }
        }

        json_response(401, false, 'Invalid username/email or password.');
    }

    $reset = $pdo->prepare(
        'UPDATE users
         SET failed_login_attempts = 0, lockout_until = NULL
         WHERE user_id = :user_id'
    );
    $reset->execute(['user_id' => $user['user_id']]);

    session_regenerate_id(true);
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    $_SESSION['user_id'] = (int)$user['user_id'];

    $publicUser = current_session_user($pdo);
    json_response(200, true, 'Signed in successfully.', [
        'user' => $publicUser,
        'csrfToken' => (string)$_SESSION['csrf_token'],
    ]);
} catch (Throwable $error) {
    error_log('[CSWDO] Login failed: ' . $error->getMessage());
    json_response(500, false, 'Sign-in is temporarily unavailable. Check the database configuration and try again.');
}
