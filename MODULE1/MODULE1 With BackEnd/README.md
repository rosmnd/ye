# Pasig City CSWDO Assistance Module

This package keeps the supplied HTML/CSS/JavaScript pages and connects the existing client registration, sign-in, session display, and sign-out flows to PHP and MariaDB. It is intended to run locally through Apache in XAMPP.

The supplied interface does not include an applicant dashboard or an application-submission form. Those workflows are not added here. The Pasig Pass QR picker remains visible as a placeholder; selected files are neither previewed nor sent to the backend or saved.

## A. Prerequisites

- Windows 10 or 11
- XAMPP with Apache, MariaDB/MySQL, PHP 8.2 or later, and phpMyAdmin
- Visual Studio Code
- A current browser

From Command Prompt, verify the XAMPP PHP version:

```bat
C:\xampp\php\php.exe -v
C:\xampp\php\php.exe -m
```

The module list must include `PDO`, `pdo_mysql`, `session`, and `mbstring`. XAMPP normally includes these extensions; enable them in `C:\xampp\php\php.ini` and restart Apache if any are missing.

## B. Project Installation

1. Extract the delivered ZIP. It contains a `MODULE1` folder.
2. Copy `MODULE1` into XAMPP's web directory, normally:

   ```text
   C:\xampp\htdocs\MODULE1\
   ```

3. Open `C:\xampp\htdocs\MODULE1` in Visual Studio Code.
4. The provided local database settings work with the common XAMPP defaults (`127.0.0.1:3306`, database `cswdo_db`, user `root`, blank password). If your MySQL/MariaDB installation uses a different password or port, copy:

   ```text
   backend\config\database.example.php
   ```

   to:

   ```text
   backend\config\database.local.php
   ```

   Edit only `database.local.php` with your local settings. That file is excluded from version control and direct web access.

## C. Database Setup

> **Important:** The supplied `cswdo_db.sql` is a database export containing `DROP TABLE IF EXISTS` statements. Import it only into a newly created, empty development database. Importing it into a database that already has these tables can erase their records.

1. Open the XAMPP Control Panel.
2. Start **Apache** and **MySQL**.
3. Open `http://localhost/phpmyadmin/`.
4. Create a new, empty database named `cswdo_db` using `utf8mb4` if prompted.
5. Select that new database, choose **Import**, and select `cswdo_db.sql` from the extracted `MODULE1` folder.
6. Confirm that the 18 tables were created. The supplied dump has no sample records.
7. If your database credentials differ from the XAMPP defaults, create `backend/config/database.local.php` from the example file and update the host, port, database name, username, and password.

> **Important:** Do not import the dump again after registration data has been created. To reset development data, first export a backup from phpMyAdmin. Only then, if you intend to erase the test data, drop the development database, create a fresh empty `cswdo_db`, and import the dump again. Dropping the database deletes all records in it.

## D. Running the Application

With Apache and MySQL running, open:

```text
http://localhost/MODULE1/
```

The root page forwards to the existing public homepage. The main pages are:

- Homepage: `http://localhost/MODULE1/html/homepage.html`
- Registration: `http://localhost/MODULE1/html/register.html`
- Sign in: `http://localhost/MODULE1/html/login_draft.html`

Use the site through Apache. Do not open the HTML files directly from File Explorer; PHP API requests and session cookies require the web server.

Register a client account, then sign in with its username or email and password. Registration saves a password hash in `users` and the supplied profile fields in `client_profiles` in a single transaction. Sign-in creates a server-side PHP session; the homepage and service-page account controls read that session from the API. Sign-out invalidates the PHP session.

There are no seeded administrator or client credentials. The previous browser-only `admin/admin` and `client/client` demo credentials have been retired.

## E. API Documentation

All endpoints return JSON with this envelope:

```json
{
  "success": true,
  "message": "Operation completed.",
  "data": {}
}
```

Errors use the same envelope with `success: false`. State-changing requests must include the `X-CSRF-Token` header. Obtain the token from `GET /MODULE1/backend/auth/me.php`; it is returned as `data.csrfToken`.

### `GET /backend/auth/me.php`

- **Purpose:** Return the current authenticated user's public account information (or `null`) and a CSRF token.
- **Authentication:** Not required.
- **Request body:** None.
- **Success:** HTTP 200.

Example:

```json
{
  "success": true,
  "message": "Session status retrieved.",
  "data": {
    "user": null,
    "csrfToken": "the-token-returned-by-this-request"
  }
}
```

### `POST /backend/auth/login.php`

- **Purpose:** Authenticate a registered user and start a PHP session.
- **Authentication:** Not required; a valid CSRF token is required.
- **Request:** JSON with `username` (username or email address) and `password`.
- **Success:** HTTP 200; returns public user information and a rotated CSRF token.
- **Common errors:** HTTP 401 for invalid/locked/disabled credentials; HTTP 419 for missing or expired CSRF token; HTTP 422 for missing fields.

Example request:

```http
POST /MODULE1/backend/auth/login.php
Content-Type: application/json
X-CSRF-Token: <token from /backend/auth/me.php>
```

```json
{
  "username": "sample.client",
  "password": "your-password"
}
```

### `POST /backend/auth/logout.php`

- **Purpose:** Clear the server-side session and expire its cookie.
- **Authentication:** A valid CSRF token from the current session is required.
- **Request body:** None.
- **Success:** HTTP 200.
- **Common errors:** HTTP 419 for missing or expired CSRF token.

### `POST /backend/register.php`

- **Purpose:** Create a `CLIENT` account and its `client_profiles` record in one transaction.
- **Authentication:** Not required; a valid CSRF token is required.
- **Request:** `multipart/form-data` containing the existing registration fields: `firstName`, `middleName`, `lastName`, `birthDate`, `birthPlace`, `sex`, `civilStatus`, `sectoralCategory`, `isPwd`, `pwdIdNo`, `educationalAttainment`, `occupation`, `monthlyIncome`, `unitNumber`, `houseNumber`, `streetSubdivision`, `permanentAddress`, `barangay`, `housingStatus`, `monthlyRent`, `monthlyExpensesElectricity`, `monthlyExpensesWater`, `monthlyExpensesFood`, `otherSourcesOfHelp`, `username`, `email`, `confirmEmail`, `contactNumber`, `password`, `confirmPassword`, `agreeTerms`, and `agreePrivacy`.
- **Success:** HTTP 201.
- **Common errors:** HTTP 409 for a duplicate username/email; HTTP 419 for missing or expired CSRF token; HTTP 422 for invalid fields; HTTP 500 for database/setup errors.
- **File input:** `pasigPassAttachment` is intentionally ignored. The frontend removes it from the submitted form, and the backend does not save uploaded files.

Example success response:

```json
{
  "success": true,
  "message": "Account created successfully. You can now sign in.",
  "data": {
    "userId": 1
  }
}
```

The API checks the HTTP method and request values, uses prepared statements, hashes passwords with `password_hash()`, and verifies them with `password_verify()`. After five failed sign-in attempts for an active account, sign-in is locked for 15 minutes. Database exceptions are written to the server error log; SQL details and credentials are not returned to the browser.

Registration passwords must be at least 8 characters, include an uppercase letter, a lowercase letter, a number, and a non-space special character, and fit within 72 UTF-8 bytes. The byte limit avoids truncation by PHP's default bcrypt password hashing.

## F. Configuration and Sessions

- Database settings: `backend/config/database.example.php` or the ignored local file `backend/config/database.local.php`
- Database driver: PDO MySQL (`pdo_mysql`)
- Default database: `cswdo_db`
- PHP session cookie: HTTP-only, `SameSite=Lax`, and marked `Secure` when served over HTTPS
- CSRF: A session token is required on registration, login, and logout
- Session and database secrets are not stored in the frontend

The example config uses the standard local XAMPP root account with a blank password. For a shared or internet-accessible server, use an appropriately restricted database account and configure HTTPS; these local-development settings are not a production deployment configuration.

## G. Troubleshooting

- **Apache does not start:** Check for another service using port 80 or 443 in the XAMPP Control Panel.
- **MySQL does not start:** Check whether another MySQL/MariaDB service is using port 3306. If you change the port, update `database.local.php`.
- **Database connection failed:** Confirm MySQL is running, the database is named `cswdo_db`, and the local host, port, username, and password are correct.
- **Access denied:** Check the credentials in `database.local.php`. XAMPP installations may set a root password.
- **Missing tables:** Select the `cswdo_db` database in phpMyAdmin and import the supplied SQL into that empty database.
- **Registration or sign-in reports a database problem:** Confirm `pdo_mysql` is enabled for XAMPP's PHP, then restart Apache.
- **CSRF/session error:** Use the same `localhost` host for all pages and API requests, enable browser cookies, and refresh the page before submitting again.
- **404 or broken assets:** Confirm the extracted folder is `C:\xampp\htdocs\MODULE1` and browse through `http://localhost/MODULE1/`, not a `file:///` URL.
- **Empty dashboard or application list:** The supplied frontend has no dashboard or application-submission interface. The included database tables alone do not implement those pages or workflows.
- **MySQL port or database changed:** Update `backend/config/database.local.php`; do not edit credentials into frontend JavaScript.

## H. Testing and Resetting

After setup, use these repeatable checks:

1. Open the homepage through Apache and confirm its images, styles, navigation, and language controls load.
2. Register a valid client account and confirm a success message appears.
3. In phpMyAdmin, verify that a `users` row and a related `client_profiles` row were created.
4. Confirm the `users.password_hash` value is a hash and not the submitted password.
5. Try registering the same username or email again and confirm it is rejected.
6. Sign in with the new account; confirm the profile control appears on the homepage and service pages.
7. Sign out and confirm the profile control returns to the sign-in link. Reload and confirm the server session is gone.
8. Try invalid credentials and confirm the response does not say whether the username or email exists.
9. For a reset, export a backup first. Dropping the development database and importing the SQL again deletes its records.

## I. Limitations and Remaining Work

- The source ZIP has no dashboard page, application form, or workflow for reading/updating applications. The backend only connects the existing registration and authentication interface.
- The Terms of Service, Privacy Policy, and Forgot Password pages are not included in the supplied ZIP; their existing links are preserved and remain unresolved.
- The homepage's “All Modules” link points to a `modules.html` page outside this module and is preserved as supplied.
- The Pasig Pass QR upload is a placeholder and is not previewed, transmitted, or stored pending a separate decision about retention and database support.
- The old demo credentials have been removed from the client-side authentication flow.
- The supplied database dump can drop tables if imported into a populated database. Use a fresh, empty database only.
- This implementation provides baseline application security controls, not a security or privacy compliance certification. Review local government privacy, retention, access, and deployment requirements before handling real applicant records.
- XAMPP/MariaDB/browser integration tests must be run on the target Windows computer after installation. This package does not include production data or seeded accounts.
