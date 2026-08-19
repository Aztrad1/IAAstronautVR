# IA Astronaut VR

Aplicación educativa de realidad virtual sobre el sistema solar. El usuario explora una nave espacial, elige un planeta desde una mesa holográfica y conversa por voz o texto con un astronauta con IA sobre ese planeta — con misiones interactivas de mantenimiento de nave y expediciones de exploración.

Funciona en escritorio, celular y visores de VR (probado en Meta Quest).

## Características

- **Mesa holográfica del sistema solar** — 9 planetas orbitando, seleccionables con un click, un toque o apuntando y disparando en VR.
- **Chat con un astronauta con IA** — texto o voz, con detección automática de voz (manos libres) y síntesis de voz.
- **Panel de misiones de nave** — 4 mecánicas de puzzle distintas (cables, secuencia, diales, memoria), con dificultad creciente y desbloqueo planeta por planeta.
- **Expediciones** — al completar las misiones de un planeta, se puede mandar una sonda a extraer muestras y recibir un reporte de hallazgos del astronauta.
- **VR nativo (WebXR)** — mandos y manos con hand-tracking, retículas de puntería, una sola sesión inmersiva persistente sin recargas de página.
- **Responsive** — controles táctiles en celular, mouse/teclado en escritorio, mandos/manos en VR.

## Requisitos

- PHP 8.1 o superior, con la extensión cURL habilitada.
- Servidor Apache con `mod_headers` habilitado (evita que el navegador se quede con versiones viejas de los archivos JS/CSS).
- Una clave de API de OpenAI ([platform.openai.com/api-keys](https://platform.openai.com/api-keys)) con facturación activa. Se usa para el chat (GPT), la transcripción de voz (STT, `gpt-4o-mini-transcribe`) y la síntesis de voz (TTS, `gpt-4o-mini-tts`).
- Para probar la parte de VR hace falta HTTPS (WebXR lo exige) — en desarrollo local se puede exponer el servidor con algo como [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) o [ngrok](https://ngrok.com/).

## Instalación

1. Descargá o cloná este repositorio en la carpeta pública de tu servidor (por ejemplo, `htdocs` de XAMPP).

2. Creá el archivo `.env` en la raíz del proyecto con tu clave de OpenAI:

   ```
   OPENAI_API_KEY=sk-proj-tu-clave-aca
   ```

   Ese archivo ya está en `.gitignore` — nunca se sube al repositorio.

3. Verificá que `mod_headers` esté habilitado en Apache (en XAMPP suele venir activo). Si no lo está:

   ```
   a2enmod headers
   sudo systemctl restart apache2
   ```

4. Abrí `http://localhost/<carpeta-del-proyecto>/public/` en el navegador.

## Estructura del proyecto

```
app/
  controllers/       Controladores — reciben la petición HTTP y llaman al modelo
  models/            Lógica de negocio — habla con la API de OpenAI, busca imágenes
  views/             Vista principal (lobby.php)
  helpers/           Funciones globales (rutas, assets con caché-busting)
  bootstrap.php      Arranque de la app (autoload, constantes de rutas)

public/
  index.php          Punto de entrada — siempre renderiza la vista del lobby
  actions/           Endpoint HTTP del chat
  assets/
    css/             Estilos del lobby y del HUD de VR
    js/
      lobby/         Escena principal: nave, mesa holográfica, panel de misiones
      astronauta/    Panel de chat con el astronauta, entrada de voz/texto/VR
    img/planets/     Fotos de los planetas
```

## Controles

| Acción                  | Escritorio                  | Celular                        | VR                              |
|--------------------------|------------------------------|----------------------------------|-----------------------------------|
| Elegir un planeta         | Click                        | Toque                            | Apuntar + gatillo o pellizco       |
| Mirar alrededor            | Click derecho + arrastrar     | Arrastrar con un dedo             | Movimiento natural del casco        |
| Scroll en el chat          | Rueda del mouse               | Arrastrar en el área del chat      | Apuntar al chat + gatillo y arrastrar |
| Escribir en el chat        | Teclado físico                 | Toque en la caja de texto          | No disponible — usar el micrófono   |
| Hablar con el astronauta   | Botón "Iniciar transmisión"    | Botón "Iniciar transmisión"        | Botón "Iniciar transmisión"         |

## Notas

- El endpoint de chat (`public/actions/chat-astronauta.php`) es el único punto que habla con la API de OpenAI — el frontend nunca ve la clave de API.
- El progreso de las misiones de nave se guarda en el navegador (`localStorage`), no en un servidor — es por dispositivo/navegador, no por cuenta de usuario.
- `public/assets/vendor/` trae una librería sin usar (phpdotenv) que quedó de una versión anterior; el proyecto no depende de Composer para funcionar.
