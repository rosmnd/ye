CSWDO Admin Review & Approval (Module 9) - setup (XAMPP)

1. Copy this folder to  C:\xampp\htdocs\cswdo-admin\
2. phpMyAdmin: create/import cswdo_db.sql, then (for testing) import sql/admin_review_demo_seed.sql
3. Edit api/config.php if your MySQL user/password differ from the XAMPP defaults.
4. Open  http://localhost/cswdo-admin/admin.html
   (opening admin.html as a file:// page will NOT work - it must go through Apache/PHP)
5. api/config.php has DEV_AUTO_LOGIN = true: it signs you in as the first ADMIN user.
   Set it to false once the group's login module sets $_SESSION['user_id'].

Put logo.webp and pasig.webp next to admin.html (same as before).

Layout:  admin.html | css/admin.css | js/admin.js | api/*.php | sql/
