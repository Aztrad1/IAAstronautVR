<?php
declare(strict_types=1);

/* ═══════════════════════════════════════════════
   IA Astronaut VR — Bootstrap MVC
═══════════════════════════════════════════════ */

define('PROJECT_ROOT', realpath(__DIR__ . '/..'));
define('APP_PATH',     PROJECT_ROOT . '/app');
define('PUBLIC_PATH',  PROJECT_ROOT . '/public');

date_default_timezone_set('UTC');

function detectar_base_publica(): string
{
    foreach ([
        $_SERVER['SCRIPT_NAME']  ?? '',
        $_SERVER['PHP_SELF']     ?? '',
        $_SERVER['REQUEST_URI']  ?? '',
    ] as $value) {
        if (!is_string($value) || $value === '') continue;
        $path = (string) parse_url(str_replace('\\', '/', $value), PHP_URL_PATH);
        if ($path === '') continue;
        $pos = strpos($path, '/public/');
        if ($pos !== false) {
            $base = substr($path, 0, $pos + 7);
            return $base === '/public' ? '/public' : rtrim($base, '/');
        }
        if (preg_match('#/public$#', $path) === 1) {
            return $path === '/public' ? '/public' : rtrim($path, '/');
        }
    }
    return '';
}

define('BASE_PATH', detectar_base_publica());

// ── Autoloader PSR-4 ──────────────────────────────────────────────────────
// App\Controllers\X  → app/controllers/X.php
// App\Models\X       → app/models/X.php
spl_autoload_register(function (string $class): void {
    $map = [
        'App\\Controllers\\' => APP_PATH . '/controllers/',
        'App\\Models\\'      => APP_PATH . '/models/',
    ];
    foreach ($map as $prefix => $dir) {
        if (str_starts_with($class, $prefix)) {
            $file = $dir . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($file)) require_once $file;
            return;
        }
    }
});

require_once APP_PATH . '/helpers/functions.php';
