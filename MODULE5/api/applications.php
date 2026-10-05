<?php
require_once __DIR__ . '/bootstrap.php';
require_admin();
$pdo = db();

$apps = $pdo->query(
    "SELECT a.application_id, a.control_number, a.application_type, a.current_status,
            CONCAT_WS(' ', cp.first_name, cp.last_name) AS client_name,
            cp.full_address AS address,
            t.service_name AS assistance_type,
            CONCAT(LEFT(sw.first_name, 1), '. ', sw.last_name) AS assigned_social_worker,
            r.problem_presented, r.brief_findings,
            r.socio_economic_evaluation, r.evaluation_recommendation,
            COALESCE(
              (SELECT UNIX_TIMESTAMP(MAX(h.changed_at))
                 FROM application_status_history h
                WHERE h.application_id = a.application_id AND h.status_to = 'FOR_ADMIN_REVIEW'),
              UNIX_TIMESTAMP(a.submission_date)
            ) * 1000 AS entered_review_at
       FROM applications a
       JOIN client_profiles cp ON cp.client_id = a.client_id
       JOIN assistance_types t ON t.assistance_type_id = a.assistance_type_id
       LEFT JOIN social_case_study_reports r ON r.application_id = a.application_id
       LEFT JOIN employees sw ON sw.employee_id = r.assigned_social_worker_id
      WHERE a.current_status IN ('FOR_ADMIN_REVIEW','ADMIN_REVIEWING','APPROVED','RETURNED_FOR_CORRECTION')
      ORDER BY entered_review_at"
)->fetchAll();

$serverNow = (int)$pdo->query("SELECT UNIX_TIMESTAMP() * 1000")->fetchColumn();

$byId = [];
foreach ($apps as $a) {
    $id = (int)$a['application_id'];
    $byId[$id] = [
        'application_id'            => $id,
        'control_number'            => $a['control_number'],
        'client_name'               => $a['client_name'],
        'assistance_type'           => $a['assistance_type'],
        'application_type'          => $a['application_type'],
        'address'                   => $a['address'],
        'assigned_social_worker'    => $a['assigned_social_worker'] ?? '—',
        'current_status'            => $a['current_status'],
        'entered_review_at'         => (int)$a['entered_review_at'],
        'requirements'              => [],
        'problem_presented'         => $a['problem_presented'] ?? '—',
        'brief_findings'            => $a['brief_findings'] ?? '—',
        'socio_economic_evaluation' => $a['socio_economic_evaluation'] ?? '—',
        'evaluation_recommendation' => $a['evaluation_recommendation'] ?? '—',
        'status_history'            => [],
    ];
}

if ($byId) {
    $ids = array_keys($byId);
    $in  = implode(',', array_fill(0, count($ids), '?'));

    // Requirements and their verification status
    $st = $pdo->prepare(
        "SELECT d.application_id, req.document_name, d.verification_status
           FROM application_documents d
           JOIN assistance_requirements req ON req.requirement_id = d.requirement_id
          WHERE d.application_id IN ($in)
          ORDER BY d.document_id"
    );
    $st->execute($ids);
    foreach ($st as $row) {
        $byId[(int)$row['application_id']]['requirements'][] = [$row['document_name'], $row['verification_status']];
    }

    // Status history -> timeline entries [actor, text, kind]
    $st = $pdo->prepare(
        "SELECT h.application_id, h.status_to, h.remarks, u.role
           FROM application_status_history h
           JOIN users u ON u.user_id = h.changed_by_user_id
          WHERE h.application_id IN ($in)
          ORDER BY h.changed_at, h.history_id"
    );
    $st->execute($ids);
    foreach ($st as $row) {
        $actor = ['ADMIN' => 'Admin', 'EMPLOYEE' => 'Staff', 'CLIENT' => 'Client'][$row['role']] ?? 'System';
        $text  = $row['remarks'] ?: ucfirst(strtolower(str_replace('_', ' ', $row['status_to']))) . '.';
        $kind  = $row['status_to'] === 'APPROVED' ? 'a' : ($row['status_to'] === 'RETURNED_FOR_CORRECTION' ? 'r' : 's');
        $byId[(int)$row['application_id']]['status_history'][] = [$actor, $text, $kind];
    }

    // Latest recorded decision (only shown while the case is in a decided state)
    $st = $pdo->prepare(
        "SELECT application_id, decision, admin_remarks
           FROM admin_reviews
          WHERE decision IS NOT NULL AND application_id IN ($in)
          ORDER BY review_id"
    );
    $st->execute($ids);
    foreach ($st as $row) {
        $app =& $byId[(int)$row['application_id']];
        if (in_array($app['current_status'], ['APPROVED', 'RETURNED_FOR_CORRECTION'], true)) {
            $app['admin_review'] = ['decision' => $row['decision'], 'admin_remarks' => $row['admin_remarks'] ?? ''];
        }
        unset($app);
    }
}

json_out(['server_now' => $serverNow, 'applications' => array_values($byId)]);
