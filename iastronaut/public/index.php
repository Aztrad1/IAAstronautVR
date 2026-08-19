<?php
/**
 * IA Astronaut VR — Router principal
 *
 * Todo (lobby + misión) vive en una sola vista/sesión; el lobby cambia de
 * "escena" internamente (JS), sin recargar la página.
 */
require __DIR__ . '/../app/bootstrap.php';

view('lobby');
