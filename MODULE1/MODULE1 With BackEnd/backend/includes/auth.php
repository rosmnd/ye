<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../config/database.php';

function current_session_user(PDO $pdo): ?array
{
    $userId = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$userId) {
        return null;
    }

    $query = $pdo->prepare(
        'SELECT u.user_id, u.username, u.role, u.is_active,
                cp.first_name, cp.last_name
         FROM users u
         LEFT JOIN client_profiles cp ON cp.user_id = u.user_id
         WHERE u.user_id = :user_id
         LIMIT 1'
    );
    $query->execute(['user_id' => $userId]);
    $row = $query->fetch();

    if (!$row || (int)$row['is_active'] !== 1) {
        unset($_SESSION['user_id']);
        return null;
    }

    $displayName = trim(
        (string)($row['first_name'] ?? '') . ' ' . (string)($row['last_name'] ?? '')
    );

    return [
        'userId' => (int)$row['user_id'],
        'username' => (string)$row['username'],
        'displayName' => $displayName !== '' ? $displayName : (string)$row['username'],
        'role' => (string)$row['role'],
        'avatarUrl' => null,
    ];
}
