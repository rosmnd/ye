<?php
// Admin decision: APPROVED or RETURNED_FOR_CORRECTION. Saved to admin_reviews, applications,
// application_status_history, and a notification row for the assigned social worker.
require_once __DIR__ . '/bootstrap.php';
$admin    = require_admin();
$in       = read_json();
$appId    = (int)($in['application_id'] ?? 0);
$decision = $in['decision'] ?? '';
$remarks  = trim((string)($in['remarks'] ?? ''));

if ($appId < 1) fail('application_id is required.', 422);
if (!in_array($decision, ['APPROVED', 'RETURNED_FOR_CORRECTION'], true)) fail('Invalid decision.', 422);
if ($decision === 'RETURNED_FOR_CORRECTION' && $remarks === '') fail('Add remarks so staff know what to fix.', 422);
if ($decision === 'APPROVED' && $remarks === '') $remarks = 'Approved after admin review.';

$pdo = db();
$pdo->beginTransaction();
try {
    $st = $pdo->prepare("SELECT control_number, current_status FROM applications WHERE application_id = ? FOR UPDATE");
    $st->execute([$appId]);
    $app = $st->fetch();
    if (!$app) { $pdo->rollBack(); fail('Application not found.', 404); }
    if (!in_array($app['current_status'], ['FOR_ADMIN_REVIEW', 'ADMIN_REVIEWING'], true)) {
        $pdo->rollBack();
        fail('This application was already decided or is not ready for admin review.', 409);
    }

    // Use the open review row, or create one if the admin decided without a prior open_case call
    $st = $pdo->prepare("SELECT review_id FROM admin_reviews WHERE application_id = ? AND decision IS NULL ORDER BY review_id DESC LIMIT 1 FOR UPDATE");
    $st->execute([$appId]);
    $reviewId = $st->fetchColumn();
    if ($reviewId) {
        $pdo->prepare("UPDATE admin_reviews SET admin_id = ?, review_end_time = NOW(), decision = ?, admin_remarks = ? WHERE review_id = ?")
            ->execute([$admin['employee_id'], $decision, $remarks, $reviewId]);
    } else {
        $pdo->prepare(
            "INSERT INTO admin_reviews (application_id, admin_id, review_start_time, review_end_time, decision, admin_remarks)
             VALUES (?, ?, NOW(), NOW(), ?, ?)"
        )->execute([$appId, $admin['employee_id'], $decision, $remarks]);
    }

    $pdo->prepare("UPDATE applications SET current_status = ? WHERE application_id = ?")->execute([$decision, $appId]);

    $label = $decision === 'APPROVED' ? 'Approved. ' : 'Returned for correction. ';
    $pdo->prepare(
        "INSERT INTO application_status_history (application_id, status_from, status_to, changed_by_user_id, remarks)
         VALUES (?, ?, ?, ?, ?)"
    )->execute([$appId, $app['current_status'], $decision, $admin['user_id'], $label . $remarks]);

    // Notify the social worker who wrote the report
    $st = $pdo->prepare(
        "SELECT e.user_id FROM social_case_study_reports r
           JOIN employees e ON e.employee_id = r.assigned_social_worker_id
          WHERE r.application_id = ?"
    );
    $st->execute([$appId]);
    $workerUser = $st->fetchColumn();
    if ($workerUser) {
        $title = $decision === 'APPROVED' ? 'Application approved' : 'Report returned for correction';
        $msg   = $app['control_number'] . ': ' . $label . $remarks;
        $pdo->prepare("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)")
            ->execute([$workerUser, $title, $msg]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('Could not save the decision.', 500);
}
json_out(['ok' => true]);
