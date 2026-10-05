<?php
// Database settings (XAMPP defaults). Change these to match your setup.
const DB_HOST = 'localhost';
const DB_NAME = 'cswdo_db';
const DB_USER = 'root';
const DB_PASS = '';

// Where to send the browser when the session is missing or after sign out.
const LOGIN_URL = 'login.html';

// DEVELOPMENT ONLY: when true, a missing session is auto-logged-in as the first
// active ADMIN user in `users`. Set to false once the login module is connected.
const DEV_AUTO_LOGIN = true;
