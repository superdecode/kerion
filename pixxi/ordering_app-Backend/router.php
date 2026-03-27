<?php
/**
 * Router for PHP built-in server
 * Simulates Apache mod_rewrite / .htaccess behavior
 * Usage: php -S localhost:8000 router.php
 */

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// Serve existing static files directly (css, js, images, fonts, etc.)
$static_extensions = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'svg', 'map', 'swf', 'pdf', 'webp'];
$ext = strtolower(pathinfo($uri, PATHINFO_EXTENSION));

if ($ext && in_array($ext, $static_extensions)) {
    $file = __DIR__ . $uri;
    if (file_exists($file)) {
        return false; // serve directly
    }
}

// Serve existing directories with index files
if (is_dir(__DIR__ . $uri)) {
    $index = rtrim(__DIR__ . $uri, '/') . '/index.php';
    if (file_exists($index)) {
        return false;
    }
}

// Set CI_ENV to development
$_SERVER['CI_ENV'] = 'development';

// Route everything through CodeIgniter's index.php
// Adjust URI for CodeIgniter's expected base path
if (strpos($uri, '/ordering_app') !== 0 && $uri !== '/' && $uri !== '') {
    $uri = '/ordering_app' . $uri;
}

$_SERVER['SCRIPT_NAME'] = '/ordering_app/index.php';
$_SERVER['PHP_SELF'] = '/ordering_app/index.php' . (strpos($uri, '/ordering_app') === 0 ? substr($uri, 12) : $uri);
$_SERVER['REQUEST_URI'] = $uri;

require_once __DIR__ . '/index.php';
