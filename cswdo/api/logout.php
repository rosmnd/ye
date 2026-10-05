<?php
require_once __DIR__ . '/bootstrap.php';
read_json();
$_SESSION = [];
session_destroy();
json_out(['ok' => true, 'redirect' => LOGIN_URL]);
