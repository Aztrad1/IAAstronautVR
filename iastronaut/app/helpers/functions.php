<?php
declare(strict_types=1);

/* ═══════════════════════════════════════════════
   Helpers globales — IA Astronaut VR (MVC)
═══════════════════════════════════════════════ */

/** Escapa HTML (previene XSS) */
function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

/** Ruta base pública (sin slash final) */
function app_base_path(): string
{
    $base = defined('BASE_PATH') ? (string) BASE_PATH : '';
    $base = rtrim(str_replace('\\', '/', $base), '/');
    return $base === '/' ? '' : $base;
}

/** Construye una URL relativa al public/ */
function url(string $path = ''): string
{
    $base = app_base_path();
    $path = trim($path);
    if ($path === '') return $base === '' ? '/' : $base . '/';
    return $base . '/' . ltrim($path, '/');
}

/** Construye la URL de un asset (js, img, css…), con caché-busting. */
function asset(string $path): string
{
    $rel  = 'assets/' . ltrim($path, '/');
    $file = PUBLIC_PATH . '/' . $rel;
    $v    = is_file($file) ? filemtime($file) : null;
    return url($rel) . ($v ? '?v=' . $v : '');
}

/** Renderiza una Vista pasándole variables */
function view(string $viewFile, array $data = []): void
{
    $file = APP_PATH . '/views/' . $viewFile . '.php';
    if (!is_file($file)) {
        http_response_code(500);
        exit("Vista no encontrada: $viewFile");
    }
    extract($data, EXTR_SKIP);
    require $file;
}
