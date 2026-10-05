<?php
/**
 * CSWDO Pasig — Online Appointment & Scheduling
 * Identity endpoints.
 *
 *   GET/POST ?action=me      → active demo identity (auto-session) + profile
*                              (?scope=employee → staff identity instead)
 *   POST     ?action=login   → TEST_MODE-only identity switch (test_api.sh);
 *                              username is read from the JSON body. Password
 *                              is accepted but ignored in the demo build —
 *                              the real CSWDO login replaces this action.
 *   POST     ?action=set     → alias of login
 *   POST     ?action=staff_login → employee-portal sign-in. Always available
 *                              (TEST_MODE or not): verifies the real
 *                              password_hash, applies the users table
 *                              failed_login_attempts / lockout_until columns,
 *                              and binds an EMPLOYEE/ADMIN session. Staff
 *                              actions are never auto-bound.
 *   POST     ?action=logout  → clears the session
 *
 * No credentials live in the frontend; identity switching is refused unless
 * TEST_MODE is enabled in api/config.php.
 */

require_once __DIR__ . '/bootstrap.php';

// Resolve whichever role the current session carries — CLIENT first (demo
// auto-session), then EMPLOYEE (explicit staff login). Used by action=me and
// by login, so the caller gets their identity back without a role parameter
// (roles are always determined server-side from the users table).
function resolve_active_identity(): array
{
    $pdo = cswdo_db();

    $userId = $_SESSION['cswdo_user_id'] ?? null;
    if ($userId === null) {
        // No session: fall through to the CLIENT demo auto-session.
        [$user, $profile] = require_client();
        return ['client', public_user($user, $profile)];
    }

    $stmt = $pdo->prepare('SELECT role FROM users WHERE user_id = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([(int) $userId]);
    $role = $stmt->fetchColumn();

    if ($role === 'EMPLOYEE') {
        [$employeeUser, $employee] = require_employee();
        return ['employee', public_employee($employee)];
    }

    [$user, $profile] = require_client();
    return ['client', public_user($user, $profile)];
}

$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'me':
            // ?scope=employee → resolve the staff identity (explicit staff
            // session or the demo officer auto-session). The employee portal
            // uses this so it can open directly in the officer workspace.
            if (($_GET['scope'] ?? '') === 'employee') {
                [$employeeUser, $employee] = require_employee();
                json_ok([
                    'identity_kind' => 'employee',
                    'user'          => public_employee($employee),
                    'test_mode'     => CSWDO_TEST_MODE,
                ]);
                // no break — json_ok exits
            }
            [$kind, $identity] = resolve_active_identity();
            json_ok([
                'identity_kind' => $kind,
                'user'          => $identity,
                'test_mode'     => CSWDO_TEST_MODE,
            ]);
            // no break — json_ok exits

        case 'login':
        case 'set':
            if (!CSWDO_TEST_MODE) {
                fail(
                    'Identity switching is disabled. Enable TEST_MODE in api/config.php (or use the demo auto-session).',
                    403,
                    'test_mode_off'
                );
            }
            $body = read_json_body();
            $username = trim((string) ($body['username'] ?? ''));
            if ($username === '') {
                fail('Username is required.', 400, 'missing_username');
            }

            $pdo = cswdo_db();
            $stmt = $pdo->prepare(
                "SELECT * FROM users WHERE username = ? AND is_active = 1 LIMIT 1"
            );
            $stmt->execute([$username]);
            $user = $stmt->fetch();
            if (!$user) {
                fail('Unknown username. Run php seed/seed_demo.php to create the demo accounts.', 404, 'unknown_user');
            }

            // NOTE: demo build intentionally skips password verification here;
            // the real CSWDO login module (password_hash / lockout fields in
            // the users table) plugs in at this exact point.
            session_regenerate_id(true);
            $_SESSION['cswdo_user_id'] = (int) $user['user_id'];

            if ($user['role'] === 'EMPLOYEE') {
                [$empUser, $employee] = require_employee();
                json_ok([
                    'identity_kind' => 'employee',
                    'user'          => public_employee($employee),
                    'test_mode'     => CSWDO_TEST_MODE,
                ]);
            }

            $profile = load_client_profile($pdo, (int) $user['user_id']);
            json_ok([
                'identity_kind' => 'client',
                'user'          => public_user($user, $profile),
                'test_mode'     => CSWDO_TEST_MODE,
            ]);
            // no break — json_ok exits

        // ---- Staff sign-in (production path, TEST_MODE independent) ----
        case 'staff_login':
            $body = read_json_body();
            $username = trim((string) ($body['username'] ?? ''));
            $password = (string) ($body['password'] ?? '');
            if ($username === '' || $password === '') {
                fail('Staff username and password are required.', 400, 'missing_credentials');
            }

            $pdo = cswdo_db();
            $stmt = $pdo->prepare(
                "SELECT * FROM users
                 WHERE username = ? AND role IN ('EMPLOYEE', 'ADMIN') AND is_active = 1
                 LIMIT 1"
            );
            $stmt->execute([$username]);
            $staff = $stmt->fetch();
            if (!$staff) {
                // Never reveal whether the username exists.
                fail('Invalid staff credentials.', 401, 'invalid_credentials');
            }

            $nowStamp = new DateTimeImmutable('now');
            if ($staff['lockout_until'] !== null) {
                $lockUntil = new DateTimeImmutable($staff['lockout_until']);
                if ($lockUntil > $nowStamp) {
                    $minutesLeft = max(1, (int) ceil(($lockUntil->getTimestamp() - $nowStamp->getTimestamp()) / 60));
                    fail(
                        sprintf(
                            'Too many failed sign-in attempts. This staff account is locked for another %d minute(s).',
                            $minutesLeft
                        ),
                        429,
                        'account_locked'
                    );
                }
            }

            if (!password_verify($password, $staff['password_hash'])) {
                $attempts = (int) $staff['failed_login_attempts'] + 1;
                $lockUntil = null;
                if ($attempts >= CSWDO_STAFF_MAX_ATTEMPTS) {
                    $lockUntil = $nowStamp
                        ->modify('+' . CSWDO_STAFF_LOCKOUT_MINUTES . ' minutes')
                        ->format('Y-m-d H:i:s');
                    $attempts = 0; // fresh window once the lockout is served
                }
                $stmt = $pdo->prepare('UPDATE users SET failed_login_attempts = ?, lockout_until = ? WHERE user_id = ?');
                $stmt->execute([$attempts, $lockUntil, (int) $staff['user_id']]);

                fail('Invalid staff credentials.', 401, 'invalid_credentials');
            }

            // Successful sign-in clears the lockout state.
            $stmt = $pdo->prepare('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE user_id = ?');
            $stmt->execute([(int) $staff['user_id']]);

            session_regenerate_id(true);
            $_SESSION['cswdo_user_id'] = (int) $staff['user_id'];

            [, $employee] = require_employee();
            json_ok([
                'identity_kind' => 'employee',
                'user'          => public_employee($employee),
                'test_mode'     => CSWDO_TEST_MODE,
            ]);
            // no break — json_ok exits

        case 'logout':
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $p = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], (bool) $p['secure'], (bool) $p['httponly']);
            }
            session_destroy();
            json_ok(['message' => 'Signed out of the demo session.']);
            // no break — json_ok exits

        default:
            fail('Unknown auth action.', 400, 'unknown_action');
    }
} catch (ApiException $e) {
    json_fail($e->getMessage(), $e->httpStatus(), $e->errorCode(), $e->extra());
} catch (Throwable $e) {
    json_fail('Unexpected server error: ' . $e->getMessage(), 500, 'server_error');
}
