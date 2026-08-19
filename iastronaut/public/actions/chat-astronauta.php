<?php
/**
 * IA Astronaut VR — Endpoint de chat
 *
 * M(V)C: Este archivo es solo el punto de entrada HTTP.
 * Toda la lógica está en el Controlador y el Modelo.
 */
require __DIR__ . '/../../app/bootstrap.php';

$controller = new App\Controllers\ChatController();
$controller->handleChat();
