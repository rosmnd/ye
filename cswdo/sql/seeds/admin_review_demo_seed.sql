-- DEMO DATA for testing the Admin Review & Approval page (admin.html).
-- Run AFTER importing cswdo_db.sql, on an empty database. All demo passwords are "password".
USE cswdo_db;

INSERT INTO users (user_id, username, password_hash, email, contact_number, role) VALUES
 (1, 'admin.reyes',  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin.reyes@example.com',  '09170000001', 'ADMIN'),
 (2, 'r.villanueva', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'r.villanueva@example.com', '09170000002', 'EMPLOYEE'),
 (3, 'm.santos',     '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'm.santos@example.com',     '09170000003', 'EMPLOYEE'),
 (4, 'msantos',      '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'maria.santos@example.com',  '09171000004', 'CLIENT'),
 (5, 'jramirez',     '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'jose.ramirez@example.com',  '09171000005', 'CLIENT'),
 (6, 'ecruz',        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'elena.cruz@example.com',    '09171000006', 'CLIENT'),
 (7, 'rdiaz',        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ramon.diaz@example.com',    '09171000007', 'CLIENT'),
 (8, 'lnavarro',     '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'liza.navarro@example.com',  '09171000008', 'CLIENT');

INSERT INTO employees (employee_id, user_id, employee_number, first_name, last_name, position) VALUES
 (1, 1, 'ADM-001', 'Angela', 'Reyes',      'City Social Welfare Officer'),
 (2, 2, 'EMP-101', 'Rosa',   'Villanueva', 'Social Worker'),
 (3, 3, 'EMP-102', 'Mark',   'Santos',     'Social Worker');

INSERT INTO assistance_types (assistance_type_id, service_name) VALUES
 (1, 'Medical Assistance'), (2, 'Financial Assistance'), (3, 'Burial / Funeral Assistance'),
 (4, 'Transportation Assistance'), (5, 'Balik Probinsya Assistance');

INSERT INTO assistance_requirements (requirement_id, assistance_type_id, document_name) VALUES
 (1, 1, 'Valid ID'), (2, 1, 'Medical Certificate'), (3, 1, 'Hospital Bill'),
 (4, 2, 'Valid ID'), (5, 2, 'Barangay Certificate of Indigency'), (6, 2, 'Letter of Request'),
 (7, 3, 'Valid ID'), (8, 3, 'Death Certificate'), (9, 3, 'Funeral Contract'),
 (10, 4, 'Valid ID'), (11, 4, 'Travel Document'),
 (12, 5, 'Valid ID'), (13, 5, 'Barangay Certificate'), (14, 5, 'Provincial Address Proof');

INSERT INTO client_profiles
 (client_id, user_id, first_name, last_name, birth_date, birth_place, age, sex, civil_status, full_address, housing_status) VALUES
 (1, 4, 'Maria', 'Santos',  '1985-03-12', 'Pasig City', 41, 'Female', 'Married',   'Brgy. Kapitolyo, Pasig City',  'Renter'),
 (2, 5, 'Jose',  'Ramirez', '1980-07-02', 'Pasig City', 46, 'Male',   'Married',   'Brgy. Rosario, Pasig City',    'Renter'),
 (3, 6, 'Elena', 'Cruz',    '1990-11-21', 'Pasig City', 35, 'Female', 'Single',    'Brgy. Manggahan, Pasig City',  'Owned'),
 (4, 7, 'Ramon', 'Diaz',    '1972-01-30', 'Pasig City', 54, 'Male',   'Married',   'Brgy. Sagad, Pasig City',      'Sharer/Relative'),
 (5, 8, 'Liza',  'Navarro', '1988-09-09', 'Pasig City', 38, 'Female', 'Widowed',   'Brgy. Pineda, Pasig City',     'Renter');

INSERT INTO applications (application_id, control_number, client_id, assistance_type_id, application_type, current_status) VALUES
 (1, 'ON-2026-00125', 1, 1, 'ONLINE',  'FOR_ADMIN_REVIEW'),
 (2, 'ON-2026-00126', 2, 2, 'ONLINE',  'FOR_ADMIN_REVIEW'),
 (3, 'WI-2026-00451', 3, 3, 'WALK_IN', 'FOR_ADMIN_REVIEW'),
 (4, 'ON-2026-00120', 4, 4, 'ONLINE',  'APPROVED'),
 (5, 'ON-2026-00118', 5, 5, 'ONLINE',  'RETURNED_FOR_CORRECTION');

INSERT INTO application_documents (application_id, requirement_id, file_path, verification_status, verified_by_employee_id, verified_at) VALUES
 (1, 1, 'uploads/demo/1-id.pdf', 'VALIDATED', 2, NOW()), (1, 2, 'uploads/demo/1-medcert.pdf', 'VALIDATED', 2, NOW()), (1, 3, 'uploads/demo/1-bill.pdf', 'VALIDATED', 2, NOW()),
 (2, 4, 'uploads/demo/2-id.pdf', 'VALIDATED', 3, NOW()), (2, 5, 'uploads/demo/2-brgy.pdf', 'VALIDATED', 3, NOW()), (2, 6, 'uploads/demo/2-letter.pdf', 'VALIDATED', 3, NOW()),
 (3, 7, 'uploads/demo/3-id.pdf', 'VALIDATED', 2, NOW()), (3, 8, 'uploads/demo/3-death.pdf', 'VALIDATED', 2, NOW()), (3, 9, 'uploads/demo/3-contract.pdf', 'VALIDATED', 2, NOW()),
 (4, 10, 'uploads/demo/4-id.pdf', 'VALIDATED', 3, NOW()), (4, 11, 'uploads/demo/4-travel.pdf', 'VALIDATED', 3, NOW()),
 (5, 12, 'uploads/demo/5-id.pdf', 'VALIDATED', 2, NOW()), (5, 13, 'uploads/demo/5-brgy.pdf', 'VALIDATED', 2, NOW()), (5, 14, 'uploads/demo/5-address.pdf', 'VALIDATED', 2, NOW());

INSERT INTO social_case_study_reports
 (application_id, assigned_social_worker_id, problem_presented, brief_findings, socio_economic_evaluation, evaluation_recommendation) VALUES
 (1, 2, 'Applicant requests medical assistance for hospitalization expenses of her mother.',
        'Hospital bill matches the medical certificate. Household has one working member.',
        'Monthly income falls below the city''s assistance threshold. No other assistance received in the last 3 months.',
        'Recommended for Medical Assistance.'),
 (2, 3, 'Applicant lost income after his employer''s workplace closed.',
        'Documents are complete and consistent with the interview.',
        'Family of five. Spouse is unemployed. Barangay certificate confirms indigency.',
        'Recommended for Financial Assistance.'),
 (3, 2, 'Walk-in applicant requests burial assistance for her father.',
        'Death certificate and funeral contract were checked against the records.',
        'Applicant is the eldest child and is paying the funeral expenses alone.',
        'Recommended for Burial / Funeral Assistance.'),
 (4, 3, 'Needs transport to attend a hospital referral outside the city.',
        'Requirements are complete.', 'No concerns raised.',
        'Recommended for Transportation Assistance.'),
 (5, 2, 'Family is returning to their province of origin.',
        'Report is mostly complete.', 'Interview notes are unsigned.',
        'Recommended for Balik Probinsya Assistance, pending signature.');

-- Status history. The row ending in FOR_ADMIN_REVIEW sets "waiting since" (3 / 7 / 12 minutes ago).
INSERT INTO application_status_history (application_id, status_from, status_to, changed_by_user_id, remarks, changed_at) VALUES
 (1, 'FOR_REVIEW',         'FOR_INTERVIEW',       2, 'Requirements validated.',               NOW() - INTERVAL 2 DAY),
 (1, 'FOR_INTERVIEW',      'INTERVIEW_COMPLETED', 2, 'Interview completed.',                  NOW() - INTERVAL 1 DAY),
 (1, 'INTERVIEW_COMPLETED','FOR_ADMIN_REVIEW',    2, 'Social case study report submitted.',   NOW() - INTERVAL 3 MINUTE),
 (2, 'FOR_REVIEW',         'FOR_INTERVIEW',       3, 'Requirements validated.',               NOW() - INTERVAL 2 DAY),
 (2, 'FOR_INTERVIEW',      'INTERVIEW_COMPLETED', 3, 'Interview completed.',                  NOW() - INTERVAL 1 DAY),
 (2, 'INTERVIEW_COMPLETED','FOR_ADMIN_REVIEW',    3, 'Social case study report submitted.',   NOW() - INTERVAL 7 MINUTE),
 (3, 'APPLICATION_SUBMITTED','FOR_REVIEW',        2, 'Walk-in application encoded.',          NOW() - INTERVAL 3 DAY),
 (3, 'FOR_REVIEW',         'FOR_INTERVIEW',       2, 'Requirements validated.',               NOW() - INTERVAL 2 DAY),
 (3, 'FOR_INTERVIEW',      'INTERVIEW_COMPLETED', 2, 'Interview completed.',                  NOW() - INTERVAL 1 DAY),
 (3, 'INTERVIEW_COMPLETED','FOR_ADMIN_REVIEW',    2, 'Social case study report submitted.',   NOW() - INTERVAL 12 MINUTE),
 (4, 'INTERVIEW_COMPLETED','FOR_ADMIN_REVIEW',    3, 'Social case study report submitted.',   NOW() - INTERVAL 100 MINUTE),
 (4, 'ADMIN_REVIEWING',    'APPROVED',            1, 'Approved. Application is complete.',    NOW() - INTERVAL 90 MINUTE),
 (5, 'INTERVIEW_COMPLETED','FOR_ADMIN_REVIEW',    2, 'Social case study report submitted.',   NOW() - INTERVAL 130 MINUTE),
 (5, 'ADMIN_REVIEWING',    'RETURNED_FOR_CORRECTION', 1, 'Returned for correction. Add the interviewer''s signature and re-submit.', NOW() - INTERVAL 120 MINUTE);

INSERT INTO admin_reviews (application_id, admin_id, review_start_time, review_end_time, decision, admin_remarks, priority_level) VALUES
 (4, 1, NOW() - INTERVAL 95 MINUTE,  NOW() - INTERVAL 90 MINUTE,  'APPROVED', 'Application is complete.', 'OVERDUE'),
 (5, 1, NOW() - INTERVAL 125 MINUTE, NOW() - INTERVAL 120 MINUTE, 'RETURNED_FOR_CORRECTION', 'Add the interviewer''s signature and re-submit.', 'OVERDUE');
