<?php
declare(strict_types=1);

function database_connection(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) {
        return $connection;
    }

    $localConfig = __DIR__ . '/database.local.php';
    $config = is_file($localConfig)
        ? require $localConfig
        : require __DIR__ . '/database.example.php';

    if (!is_array($config)) {
        throw new RuntimeException('Database configuration must return an array.');
    }

    $host = (string)($config['host'] ?? '127.0.0.1');
    $port = (int)($config['port'] ?? 3306);
    $database = (string)($config['database'] ?? 'cswdo_db');
    $username = (string)($config['username'] ?? 'root');
    $password = (string)($config['password'] ?? '');

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $host,
        $port,
        $database
    );

    $connection = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $connection;
}
