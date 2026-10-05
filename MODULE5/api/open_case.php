<?php
// Admin opens a report: FOR_ADMIN_REVIEW -> ADMIN_REVIEWING and an admin_reviews row is started.
require_once __DIR__ . '/bootstrap.php';
$admin = require_admin();
$in    = read_json();
$appId = (int)($in['application_id'] ?? 0);
if ($appId < 1) fail('application_id is required.', 422);

$pdo = db();
$pdo->beginTransaction();
try {
    $st = $pdo->prepare("SELECT current_status FROM applications WHERE application_id = ? FOR UPDATE");
    $st->execute([$appId]);
    $status = $st->fetchColumn();
    if ($status === false) { $pdo->rollBack(); fail('Application not found.', 404); }

    if ($status === 'FOR_ADMIN_REVIEW') {
        // How long has the report been waiting? (drives priority_level)
        $st = $pdo->prepare(
            "SELECT UNIX_TIMESTAMP() - COALESCE(UNIX_TIMESTAMP(MAX(changed_at)), UNIX_TIMESTAMP())
               FROM application_status_history
              WHERE application_id = ? AND status_to = 'FOR_ADMIN_REVIEW'"
        );
        $st->execute([$appId]);
        $waitMin = (int)floor(((int)$st->fetchColumn()) / 60);

        $pdo->prepare("UPDATE applications SET current_status = 'ADMIN_REVIEWING' WHERE application_id = ?")
            ->execute([$appId]);
        $pdo->prepare(
            "INSERT INTO application_status_history (application_id, status_from, status_to, changed_by_user_id, remarks)
             VALUES (?, 'FOR_ADMIN_REVIEW', 'ADMIN_REVIEWING', ?, 'Admin started review.')"
        )->execute([$appId, $admin['user_id']]);

        $st = $pdo->prepare("SELECT 1 FROM admin_reviews WHERE application_id = ? AND decision IS NULL LIMIT 1");
        $st->execute([$appId]);
        if (!$st->fetchColumn()) {
            $pdo->prepare(
                "INSERT INTO admin_reviews (application_id, admin_id, review_start_time, priority_level)
                 VALUES (?, ?, NOW(), ?)"
            )->execute([$appId, $admin['employee_id'], priority_for_wait($waitMin)]);
        }
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('Could not start the review.', 500);
}
json_out(['ok' => true]);
