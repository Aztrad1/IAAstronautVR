<?php
declare(strict_types=1);
namespace App\Models;

/**
 * Modelo — IA Astronaut VR
 *
 * Responsabilidad única: lógica de negocio.
 *   - Carga el .env y la API key
 *   - Se comunica con OpenAI (chat, STT, TTS)
 *   - Busca imágenes en Wikimedia Commons
 *
 * El Controlador nunca toca curl ni OpenAI directamente.
 */
class ChatModel
{
    private string $apiKey    = '';
    private string $chatModel = 'gpt-4o-mini';
    private string $sttModel  = 'gpt-4o-mini-transcribe';
    private string $ttsModel  = 'gpt-4o-mini-tts';
    private string $ttsVoice  = 'nova';
    private string $systemPrompt = '';

    // Crea el modelo: carga la clave de API y arma el prompt del sistema.
    public function __construct()
    {
        $this->loadEnv();
        $this->apiKey = (string)($_ENV['OPENAI_API_KEY'] ?? getenv('OPENAI_API_KEY') ?? '');
        $this->buildSystemPrompt();
    }

    // Cambia la voz de la síntesis de audio.
    public function setVoice(string $voice): void
    {
        $allowed = ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'];
        if (in_array($voice, $allowed, true)) {
            $this->ttsVoice = $voice;
        }
    }

    // Cambia el idioma de las respuestas.
    public function setLanguage(string $lang): void
    {
        $langs = ['es' => 'español', 'en' => 'English', 'fr' => 'français', 'pt' => 'português'];
        $this->buildSystemPrompt($langs[$lang] ?? 'español');
    }

    // Enfoca el prompt del sistema en el planeta elegido.
    public function setPlanetTopic(string $topic): void
    {
        if ($topic !== '') {
            $this->buildSystemPrompt('español', $topic);
        }
    }

    // Dice si hay una clave de API cargada.
    public function hasApiKey(): bool
    {
        return $this->apiKey !== '';
    }

    // ── Métodos principales ───────────────────────────────────────────────

    /** Transcribe audio a texto (STT) */
    public function transcribeAudio(string $tmpPath, string $fileName, string $mimeType): array
    {
        $res = $this->curlMultipart('https://api.openai.com/v1/audio/transcriptions', [
            'file'     => new \CURLFile($tmpPath, $mimeType, $fileName),
            'model'    => $this->sttModel,
            'language' => 'es',
        ]);
        if (!$res['ok']) return ['ok' => false, 'error' => 'STT error ' . $res['code']];
        $text = trim((string)($res['json']['text'] ?? ''));
        return ['ok' => true, 'text' => $text];
    }

    /** Envía texto al chat de OpenAI y devuelve reply + imágenes.
     *  $allowImageSearch en false hace que la respuesta sea siempre texto,
     *  sin importar lo que diga el mensaje — se usa para los mensajes que
     *  arma la propia app (el saludo al llegar a un planeta, el reporte de
     *  una expedición), que no deben poder disparar una búsqueda de
     *  imágenes por accidente. */
    public function chat(string $userText, bool $allowImageSearch = true): array
    {
        $payload = [
            'model'       => $this->chatModel,
            'messages'    => [
                ['role' => 'system', 'content' => $this->systemPrompt],
                ['role' => 'user',   'content' => $userText],
            ],
            'tools'       => $allowImageSearch ? $this->buildTools() : [],
            'tool_choice' => $allowImageSearch ? 'auto' : 'none',
            'temperature' => 0.7,
        ];

        $r1 = $this->curlJson('https://api.openai.com/v1/chat/completions', $payload);
        if (!$r1['ok']) return ['ok' => false, 'error' => 'Chat error ' . $r1['code']];

        $msg1      = $r1['json']['choices'][0]['message'] ?? [];
        $toolCalls = $allowImageSearch ? ($msg1['tool_calls'] ?? []) : [];
        $reply     = (string)($msg1['content'] ?? '');
        $images    = [];

        // Tool call: buscar imágenes
        foreach ((array)$toolCalls as $tc) {
            if (($tc['function']['name'] ?? '') !== 'search_images') continue;
            $args   = json_decode((string)($tc['function']['arguments'] ?? '{}'), true);
            $images = $this->searchWikimediaImages(trim((string)($args['query'] ?? $userText)), (int)($args['limit'] ?? 4));

            $r2 = $this->curlJson('https://api.openai.com/v1/chat/completions', [
                'model'    => $this->chatModel,
                'messages' => [
                    ['role' => 'system', 'content' => $this->systemPrompt],
                    ['role' => 'user',   'content' => $userText],
                    $msg1,
                    ['role' => 'tool', 'tool_call_id' => $tc['id'] ?? '', 'content' => json_encode(['images' => $images])],
                ],
                'temperature' => 0.7,
            ]);
            if ($r2['ok']) $reply = (string)($r2['json']['choices'][0]['message']['content'] ?? $reply);
            break;
        }

        // Fallback imágenes (solo si esta petición puede pedir imágenes)
        if ($allowImageSearch) {
            $wantsImages = (bool)preg_match('/\b(imagen(?:es)?|foto(?:s)?|muestr[ae](?:me)?|ver|enseñ[ae](?:me)?)\b/i', $userText);
            if ($wantsImages && !$images) {
                $images = $this->searchWikimediaImages($userText, 4);
                if (!$images) $reply = 'Intenté buscar imágenes pero no encontré resultados. Prueba con un término más específico.';
            }
            if ($images) $reply = '¿Quieres que te explique qué estás viendo o prefieres hablar sobre otro tema?';
        }

        return ['ok' => true, 'reply' => $reply ?: 'No pude responder en este momento.', 'images' => $images];
    }

    /** Convierte texto a MP3 en base64 (TTS) */
    public function textToSpeech(string $text): array
    {
        $clean = $this->ttsClean($text);
        if ($clean === '') return ['ok' => false, 'error' => 'empty text'];

        $ch = curl_init('https://api.openai.com/v1/audio/speech');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $this->apiKey, 'Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => json_encode(['model' => $this->ttsModel, 'voice' => $this->ttsVoice, 'input' => $clean, 'format' => 'mp3']),
        ]);
        $bin  = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($bin === false || $code < 200 || $code >= 300) return ['ok' => false, 'error' => $err ?: "TTS HTTP $code"];
        return ['ok' => true, 'audio_base64' => base64_encode($bin)];
    }

    /** Busca imágenes en Wikimedia Commons */
    public function searchWikimediaImages(string $query, int $limit = 4): array
    {
        $query = trim($query);
        if ($query === '') return [];
        $limit = max(1, min($limit, 8));

        $doSearch = function (string $q) use ($limit): array {
            $json = $this->curlGet('https://commons.wikimedia.org/w/api.php?' . http_build_query([
                'action' => 'query', 'format' => 'json', 'origin' => '*',
                'generator' => 'search', 'gsrsearch' => $q, 'gsrlimit' => $limit,
                'gsrnamespace' => 6, 'prop' => 'imageinfo|info', 'inprop' => 'url',
                'iiprop' => 'url|extmetadata', 'iiurlwidth' => 1200,
            ]));
            if (!$json) return [];
            $out = [];
            foreach ($json['query']['pages'] ?? [] as $p) {
                $ii = $p['imageinfo'][0] ?? null;
                if (!$ii) continue;
                $imgUrl = $ii['thumburl'] ?? $ii['url'] ?? null;
                if (!$imgUrl) continue;
                $meta  = $ii['extmetadata'] ?? [];
                $out[] = [
                    'url'     => (string)$imgUrl,
                    'page'    => (string)($p['canonicalurl'] ?? $p['fullurl'] ?? ''),
                    'alt'     => (string)($p['title'] ?? $q),
                    'license' => strip_tags((string)($meta['LicenseShortName']['value'] ?? '')),
                    'author'  => strip_tags((string)($meta['Artist']['value'] ?? '')),
                    'source'  => 'Wikimedia Commons',
                ];
            }
            return $out;
        };

        $images = $doSearch($query);
        if ($images) return $images;
        foreach (["ISS $query", "$query International Space Station", "$query space"] as $fb) {
            $images = $doSearch($fb);
            if ($images) return $images;
        }
        return [];
    }

    // ── Privados ──────────────────────────────────────────────────────────

    // Carga las variables del archivo .env.
    private function loadEnv(): void
    {
        $path = PROJECT_ROOT . '/.env';
        if (!is_file($path)) return;
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k); $v = trim(trim($v), "\"'");
            if ($k !== '' && getenv($k) === false) { $_ENV[$k] = $v; putenv("$k=$v"); }
        }
    }

    // Arma el prompt del sistema para el astronauta.
    private function buildSystemPrompt(string $lang = 'español', string $planetTopic = ''): void
    {
        if ($planetTopic !== '') {
            // Modo enfocado en un planeta específico
            $this->systemPrompt =
                "Eres una astronauta experta actualmente en misión de exploración cerca de $planetTopic. " .
                "Tu misión es responder ÚNICAMENTE sobre $planetTopic: su composición, atmósfera, temperatura, lunas, anillos, " .
                "misiones espaciales enviadas allí, datos científicos, curiosidades y comparativas con la Tierra. " .
                "Si el usuario pregunta sobre otro planeta o tema ajeno, redirige amablemente hacia $planetTopic. " .
                "Usa un tono emocionado, educativo y científico basado en datos reales de NASA, ESA o JAXA. " .
                "Responde siempre en $lang. Máximo 50 palabras por respuesta. Sin emojis.";
        } else {
            $this->systemPrompt =
                "Eres una astronauta mujer en la Estación Espacial Internacional (ISS). Tu misión es educar e inspirar sobre el espacio. " .
                "Puedes hablar sobre planetas, estrellas, galaxias, agujeros negros, el Sistema Solar, misiones espaciales, " .
                "tecnología espacial, telescopios, astronomía y futuros viajes al espacio. " .
                "Comparte datos interesantes, curiosidades científicas y experiencias de la vida en la ISS. " .
                "Usa un tono claro, motivador y educativo, basado en datos reales de NASA, ESA o JAXA. " .
                "Responde siempre en $lang. Limita cada respuesta a máximo 50 palabras. Sin emojis. " .
                "Si preguntan algo fuera del espacio, aclara tu rol amablemente.";
        }
    }

    // Define las herramientas (funciones) que puede usar el modelo de IA.
    private function buildTools(): array
    {
        return [[
            'type' => 'function',
            'function' => [
                'name'        => 'search_images',
                'description' => 'Busca imágenes en Wikimedia Commons para ilustrar la respuesta.',
                'parameters'  => [
                    'type'       => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'description' => 'Búsqueda en inglés.'],
                        'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 8],
                    ],
                    'required' => ['query'],
                ],
            ],
        ]];
    }

    // Limpia el texto antes de mandarlo a síntesis de voz.
    private function ttsClean(string $text): string
    {
        $text = preg_replace('/!\[([^\]]*)\]\([^)]+\)/u', '$1', $text) ?? $text;
        $text = preg_replace('/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/u', '$1', $text) ?? $text;
        $text = preg_replace('/https?:\/\/\S+/u', '', $text) ?? $text;
        $text = str_replace(['**', '__', '*', '_', '`', '#', '>'], '', $text);
        $text = preg_replace('/^\s*\d+\.\s*/m', '', $text) ?? $text;
        return trim(preg_replace('/\s{2,}/u', ' ', $text) ?? $text);
    }

    // Manda una petición POST en formato JSON.
    private function curlJson(string $url, array $payload): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $this->apiKey, 'Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);
        $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
        return ['ok' => ($raw !== false && $code >= 200 && $code < 300), 'code' => $code, 'err' => $err, 'json' => $raw ? json_decode($raw, true) : null];
    }

    // Manda una petición POST con archivos adjuntos.
    private function curlMultipart(string $url, array $fields): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $this->apiKey],
            CURLOPT_POSTFIELDS => $fields,
        ]);
        $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
        return ['ok' => ($raw !== false && $code >= 200 && $code < 300), 'code' => $code, 'err' => $err, 'json' => $raw ? json_decode($raw, true) : null];
    }

    // Manda una petición GET.
    private function curlGet(string $url, int $timeout = 8): ?array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_CONNECTTIMEOUT => $timeout, CURLOPT_TIMEOUT => $timeout, CURLOPT_HTTPHEADER => ['User-Agent: IAstronautVR/2.0']]);
        $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        if ($raw === false || $code < 200 || $code >= 300) return null;
        $json = json_decode($raw, true);
        return is_array($json) ? $json : null;
    }
}
