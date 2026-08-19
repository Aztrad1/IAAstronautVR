<?php
declare(strict_types=1);
namespace App\Controllers;

use App\Models\ChatModel;

/**
 * Controlador — IA Astronaut VR
 *
 * Responsabilidad única: recibir la petición HTTP,
 * validarla, delegar al Modelo y devolver la respuesta JSON.
 * No contiene lógica de negocio ni HTML.
 */
class ChatController
{
    private ChatModel $model;

    // Crea el controlador con su modelo.
    public function __construct()
    {
        $this->model = new ChatModel();
    }

    /** Punto de entrada: POST /actions/chat */
    public function handleChat(): void
    {
        header('Content-Type: application/json; charset=utf-8');

        // Solo POST
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->error(405, 'Method not allowed');
        }

        // cURL disponible
        if (!function_exists('curl_init')) {
            $this->error(500, 'cURL no está habilitado en PHP');
        }

        // API key presente
        if (!$this->model->hasApiKey()) {
            $this->error(500, 'Missing OpenAI API key');
        }

        // Aplicar configuración del frontend (voz, idioma)
        $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
        $isVoice = stripos($contentType, 'multipart/form-data') !== false && isset($_FILES['audio']);

        if (!$isVoice) {
            $raw  = (string)file_get_contents('php://input');
            $data = json_decode($raw ?: '{}', true) ?: [];
            if (isset($data['voice']))    $this->model->setVoice((string)$data['voice']);
            if (isset($data['language'])) $this->model->setLanguage((string)$data['language']);
        }

        // ── Modo voz ──────────────────────────────────────────────────────
        if ($isVoice) {
            $this->handleVoiceMode();
            return;
        }

        // ── Modo texto ────────────────────────────────────────────────────
        $this->handleTextMode($data ?? []);
    }

    // ── Privados ──────────────────────────────────────────────────────────

    // Procesa un mensaje enviado por voz.
    private function handleVoiceMode(): void
    {
        $tmp  = $_FILES['audio']['tmp_name'] ?? '';
        $name = $_FILES['audio']['name']     ?? 'audio.webm';
        $mime = $_FILES['audio']['type']     ?? 'audio/webm';

        if (!$tmp || !is_uploaded_file($tmp)) {
            $this->error(400, 'Invalid audio upload');
        }

        // STT
        // Contexto del planeta seleccionado
        $planetTopic = trim((string)($_POST['planet_topic'] ?? ''));
        if ($planetTopic !== '') $this->model->setPlanetTopic($planetTopic);

        $stt = $this->model->transcribeAudio($tmp, $name, $mime);
        if (!$stt['ok']) $this->error(500, $stt['error']);
        if (trim($stt['text']) === '') $this->error(400, 'Empty transcription');

        $userText = $stt['text'];

        // Chat
        $chat = $this->model->chat($userText);
        if (!$chat['ok']) $this->error(500, $chat['error']);

        // TTS
        $tts = $this->model->textToSpeech($chat['reply']);

        $this->success([
            'mode'         => 'voice',
            'transcript'   => $userText,
            'reply'        => $chat['reply'],
            'images'       => $chat['images'],
            'audio_base64' => $tts['ok'] ? $tts['audio_base64'] : null,
        ]);
    }

    // Procesa un mensaje enviado por texto.
    private function handleTextMode(array $data): void
    {
        $userText    = trim((string)($data['message']      ?? ''));
        $wantAudio   = (bool)($data['want_audio'] ?? false);
        $planetTopic = trim((string)($data['planet_topic'] ?? ''));
        $allowImages = !(bool)($data['no_images'] ?? false);
        if ($planetTopic !== '') $this->model->setPlanetTopic($planetTopic);

        if ($userText === '') $this->error(400, 'Empty message');

        // Chat
        $chat = $this->model->chat($userText, $allowImages);
        if (!$chat['ok']) $this->error(500, $chat['error']);

        // TTS opcional
        $audioBase64 = null;
        if ($wantAudio && $chat['reply'] !== '') {
            $tts = $this->model->textToSpeech($chat['reply']);
            if ($tts['ok']) $audioBase64 = $tts['audio_base64'];
        }

        $this->success([
            'mode'         => 'text',
            'transcript'   => null,
            'reply'        => $chat['reply'],
            'images'       => $chat['images'],
            'audio_base64' => $audioBase64,
        ]);
    }

    // Responde con éxito en formato JSON.
    private function success(array $data): never
    {
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Responde con un error en formato JSON.
    private function error(int $code, string $message): never
    {
        http_response_code($code);
        echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
