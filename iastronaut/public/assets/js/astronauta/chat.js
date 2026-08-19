import { ENDPOINT } from "./config.js";
import {
  addBubble,
  addImagesBubble,
  setListening,
  setAISpeaking,
  canRecord,
  enforceMaxBubbles,
} from "./uiPanel.js";

// Crea el reproductor de audio de la voz del astronauta.
export function createTTSPlayer() {
  let currentAudio = null;
  let onSpeakingChange = null;

  // Avisa si el astronauta está hablando o no.
  function notifySpeaking(v) {
    try {
      onSpeakingChange?.(!!v);
    } catch (_) {}
  }

  // Registra qué hacer cuando cambia si el astronauta está hablando.
  function setSpeakingChangeHandler(fn) {
    onSpeakingChange = typeof fn === "function" ? fn : null;
  }

  // Reproduce un audio MP3 codificado en base64.
  function playBase64Mp3(audioBase64) {
    if (!audioBase64) return Promise.resolve();

    return new Promise((resolve) => {
      try {
        if (currentAudio) {
          try {
            currentAudio.pause();
          } catch (_) {}
          currentAudio = null;
        }

        const bin = atob(audioBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

        const a = new Audio(url);
        currentAudio = a;

        const finish = () => {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {}
          if (currentAudio === a) currentAudio = null;
          notifySpeaking(false);
          resolve();
        };

        a.onended = finish;
        a.onerror = finish;

        notifySpeaking(true);
        a.play().catch((e) => {
          console.warn("Audio play blocked:", e);
          finish();
        });
      } catch (e) {
        console.error("playBase64Mp3 error:", e);
        notifySpeaking(false);
        resolve();
      }
    });
  }

  // Detiene el audio que esté sonando.
  function stop() {
    try {
      currentAudio?.pause();
    } catch (_) {}
    currentAudio = null;
    notifySpeaking(false);
  }

  return { playBase64Mp3, stop, setSpeakingChangeHandler };
}

// Crea el controlador del micrófono: detecta voz, graba y manda el audio.
export function createMicChatController({ state, drawPanel, ttsPlayer }) {
  let mediaRecorder = null;
  let micStream = null;
  let chunks = [];
  let recording = false;
  let requestInFlight = false;
  let shouldResumeAfterReply = false;

  // Activación de voz por detección automática (manos libres).
  let armed = false;
  let audioCtx = null;
  let analyser = null;
  let micRearmInProgress = false;
  let micNeedsRearm = false;
  let vadRAF = 0;
  let vadIntervalId = 0;
  const VAD_INTERVAL_MS = 33; // ~30fps

  // Ajustes (ruido/ganancia del microfono)
  const VAD_THRESHOLD = 0.02; // energía RMS aprox (0..1)
  const MIN_SPEECH_MS = 120; // evita disparos por clicks
  const SILENCE_MS = 650; // cuánto silencio antes de cortar grabación
  const COOLDOWN_MS = 250; // evita retriggers inmediatos
  const AUTO_DISARM_MS = 120000; // 120s de silencio -> apagar micrófono completo
  // --- Pre-roll para no cortar las primeras palabras ---
  const TIMESLICE_MS = 200; // cada cuánto llega un chunk (ms)
  const PRE_ROLL_MS = 800; // cuánto audio previo guardar (ms)
  const PRE_ROLL_SLICES = Math.ceil(PRE_ROLL_MS / TIMESLICE_MS);

  let hotRecorder = null; // MediaRecorder (solo en modo armado)
  let preRollChunks = []; // buffer circular (últimos N chunks)
  let captureChunks = []; // chunks que se enviarán (pre-roll + voz)
  let capturing = false; // captura en curso
  let hotInitChunk = null; // primer chunk

  let aboveSince = 0;
  let belowSince = 0;
  let lastStopAt = 0;
  let idleSilenceSince = 0; // contador de silencio prolongado

  ttsPlayer?.setSpeakingChangeHandler?.((isSpeaking) => {
    setAISpeaking(state, drawPanel, isSpeaking || requestInFlight);
  });

  // Elige el mejor formato de audio que soporte el navegador.
  function preferredMediaRecorderOptions() {
    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    for (const t of preferredTypes) {
      if (MediaRecorder.isTypeSupported?.(t)) return { mimeType: t };
    }
    return {};
  }

  // Mide qué tan fuerte es el sonido que capta el micrófono ahora.
  function rmsFromAnalyser(a) {
    const buf = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128; // -1..1
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  // Frena el chequeo continuo de detección de voz.
  function stopVADLoop() {
    // Fix para fallo de microfono en Quest/WebXR
    if (vadIntervalId) {
      try {
        clearInterval(vadIntervalId);
      } catch (_) {}
      vadIntervalId = 0;
    }
    try {
      cancelAnimationFrame(vadRAF);
    } catch (_) {}
    vadRAF = 0;
  }

  // Deja de escuchar los eventos del micrófono.
  function detachTrackWatchers() {
    try {
      const track = micStream?.getAudioTracks?.()?.[0];
      if (!track) return;
      track.onended = null;
      track.onmute = null;
      track.onunmute = null;
    } catch (_) {}
  }

  // Reinicia el estado de grabación en modo manos libres.
  function resetHotCaptureState() {
    try {
      if (hotRecorder && hotRecorder.state !== "inactive") hotRecorder.stop();
    } catch (_) {}
    hotRecorder = null;
    preRollChunks = [];
    captureChunks = [];
    capturing = false;
    hotInitChunk = null;
    recording = false;
    aboveSince = 0;
    belowSince = 0;
    lastStopAt = 0;
    idleSilenceSince = 0;
    setListening(state, drawPanel, false);
  }

  // Pausa el modo manos libres sin apagar el micrófono del todo.
  function pauseArmedMode() {
    stopVADLoop();
    resetHotCaptureState();
  }

  // Apaga el micrófono por completo y libera sus recursos.
  function cleanupArmedMode() {
    pauseArmedMode();

    detachTrackWatchers();

    try {
      audioCtx?.close?.();
    } catch (_) {}
    audioCtx = null;
    analyser = null;

    try {
      micStream?.getTracks()?.forEach((t) => t.stop());
    } catch (_) {}
    micStream = null;

    armed = false;
    micNeedsRearm = false;
  }

  // Reacciona si el micrófono se corta o se silencia solo.
  function attachTrackWatchers() {
    try {
      const track = micStream?.getAudioTracks?.()?.[0];
      if (!track) return;
      track.onended = () => {
        rearmMicBestEffort("track ended");
      };
      track.onmute = () => {
        if (!requestInFlight && !state.aiSpeaking) {
          rearmMicBestEffort("track muted");
        }
      };
      track.onunmute = null;
    } catch (_) {}
  }

  // Arranca la grabación continua del modo manos libres.
  function startHotRecorder() {
    if (!micStream) return;
    if (hotRecorder && hotRecorder.state !== "inactive") return;

    // Reinicia buffers
    preRollChunks = [];
    captureChunks = [];
    capturing = false;
    hotInitChunk = null;

    const options = preferredMediaRecorderOptions();
    hotRecorder = new MediaRecorder(micStream, options);

    hotRecorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;

      if (!hotInitChunk) hotInitChunk = e.data;

      // buffer circular pre-roll
      preRollChunks.push(e.data);
      if (preRollChunks.length > PRE_ROLL_SLICES) preRollChunks.shift();

      // si ya estamos capturando, guardamos para envío
      if (capturing) captureChunks.push(e.data);
    };

    hotRecorder.onstop = () => {};
    hotRecorder.start(TIMESLICE_MS);
  }

  // Manda el audio grabado al backend y muestra la respuesta.
  async function sendAudioBlob(blob, mime) {
    addBubble(state, drawPanel, "Astronauta IA está escribiendo…", "bot");
    let placeholderIndex = state.bubbles.length - 1;

    requestInFlight = true;
    setAISpeaking(state, drawPanel, true);

    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      // Preferencias del menú de configuración
      if (window.ASTRO_CONFIG?.voice)
        fd.append("voice", window.ASTRO_CONFIG.voice);
      if (window.ASTRO_CONFIG?.lang)
        fd.append("language", window.ASTRO_CONFIG.lang);
      // Contexto del planeta seleccionado en el lobby
      if (window.ASTRO_CONFIG?.selectedPlanet?.topic)
        fd.append("planet_topic", window.ASTRO_CONFIG.selectedPlanet.topic);

      const res = await fetch(ENDPOINT, { method: "POST", body: fd });
      if (!res.ok)
        throw new Error("HTTP " + res.status + ": " + (await res.text()));
      const data = await res.json();

      const transcriptText = (data.transcript || "").trim();
      if (transcriptText) {
        state.bubbles.splice(placeholderIndex, 0, {
          kind: "text",
          text: transcriptText,
          who: "user",
        });
        placeholderIndex += 1;
        enforceMaxBubbles(state);
      }

      const reply = (data.reply || "No pude responder en este momento.").trim();
      state.bubbles[placeholderIndex] = {
        kind: "text",
        text: reply,
        who: "bot",
      };
      state.autoScroll = true;
      drawPanel();

      if (Array.isArray(data.images) && data.images.length > 0)
        addImagesBubble(state, drawPanel, data.images);

      requestInFlight = false;
      setAISpeaking(state, drawPanel, true);

      if (data.audio_base64) {
        await ttsPlayer?.playBase64Mp3?.(data.audio_base64);
      }
    } catch (e) {
      console.error("sendAudioBlob failed:", e);
      state.bubbles[placeholderIndex] = {
        kind: "text",
        text: "No pude procesar tu voz. Intenta de nuevo. (Revisa la consola para ver el error exacto.)",
        who: "bot",
      };
      state.autoScroll = true;
      drawPanel();
    } finally {
      requestInFlight = false;
      setAISpeaking(state, drawPanel, false);

      if (shouldResumeAfterReply && armed) {
        shouldResumeAfterReply = false;
        try {
          await ensureMicArmed();
        } catch (e) {
          console.error("No pude reactivar el micrófono:", e);
        }
      } else {
        shouldResumeAfterReply = false;
      }
    }
  }

  // Corta la captura de voz actual y manda lo grabado.
  function finalizeHotCaptureAndSend() {
    capturing = false;
    recording = false;

    if (!captureChunks || captureChunks.length === 0) {
      setListening(state, drawPanel, false);
      return;
    }

    const mime = hotRecorder?.mimeType || "audio/webm";
    const blob = new Blob(captureChunks, { type: mime });
    captureChunks = [];

    shouldResumeAfterReply = armed;
    pauseArmedMode();
    sendAudioBlob(blob, mime);
  }

  // Empieza a grabar reutilizando el micrófono ya activo.
  function startRecordingUsingExistingStream() {
    chunks = [];

    const options = preferredMediaRecorderOptions();
    mediaRecorder = new MediaRecorder(micStream, options);
    const mime = mediaRecorder.mimeType || options.mimeType || "audio/webm";

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // En modo armado, no paramos para seguir escuchando.
      // Si no estamos armados, liberamos el microfono.
      if (!armed) {
        detachTrackWatchers();
        try {
          micStream?.getTracks()?.forEach((t) => t.stop());
        } catch (_) {}
        micStream = null;
      }

      const blob = new Blob(chunks, { type: mime });
      chunks = [];

      await sendAudioBlob(blob, mime);
    };

    mediaRecorder.start();
    recording = true;

    idleSilenceSince = 0;
  }

  // Chequea si hay voz ahora mismo (se llama muchas veces por segundo).
  function vadTick() {
    if (!armed || !analyser || requestInFlight || state.aiSpeaking) return;

    // Si el AudioContext se suspende, el analyser entrega "silencio".
    // Intentamos reanudarlo
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    const now = performance.now();
    const e = rmsFromAnalyser(analyser);
    const isVoice = e >= VAD_THRESHOLD;

    if (!recording && now - lastStopAt < COOLDOWN_MS) return;

    // Si no hay voz por AUTO_DISARM_MS, apagamos el micrófono por completo.
    if (armed && !recording) {
      if (!isVoice) {
        if (!idleSilenceSince) idleSilenceSince = now;
        if (now - idleSilenceSince >= AUTO_DISARM_MS) {
          cleanupArmedMode();
          return;
        }
      } else {
        idleSilenceSince = 0;
      }
    } else if (recording) {
      idleSilenceSince = 0;
    }

    if (!recording) {
      if (isVoice) {
        if (!aboveSince) aboveSince = now;
        if (now - aboveSince >= MIN_SPEECH_MS) {
          // Inicia captura lógica e incluye pre-roll para no cortar el inicio
          capturing = true;
          captureChunks = hotInitChunk
            ? [hotInitChunk, ...preRollChunks]
            : preRollChunks.slice();
          recording = true;
          setListening(state, drawPanel, true);
          aboveSince = 0;
        }
      } else {
        aboveSince = 0;
      }
    } else {
      // Grabando: detener tras SILENCE_MS de silencio
      if (!isVoice) {
        if (!belowSince) belowSince = now;
        if (now - belowSince >= SILENCE_MS) {
          // Termina captura lógica y envía
          finalizeHotCaptureAndSend();
          belowSince = 0;
          lastStopAt = now;
        }
      } else {
        belowSince = 0;
      }
    }
  }

  // Prende el chequeo continuo de detección de voz.
  function startVADLoop() {
    stopVADLoop();
    vadIntervalId = setInterval(vadTick, VAD_INTERVAL_MS);
  }

  // Intenta reactivar el micrófono si se cortó solo.
  async function rearmMicBestEffort(reason) {
    if (micRearmInProgress) return;
    micRearmInProgress = true;
    try {
      micNeedsRearm = false;
      // Cerramos cualquier estado previo y tratamos de re-activar el micrófono.
      try {
        cleanupArmedMode();
      } catch (_) {}
      await ensureMicArmed();
    } catch (err) {
      // Por si se vuelven a pedir permisos en Quest/WebXR.
      const msg =
        err && (err.name || err.message)
          ? `${err.name || ""} ${err.message || ""}`.trim()
          : String(err);
      addBubble(
        state,
        drawPanel,
        `🎤 Se perdió el audio del micrófono (${reason}).\n\nSi estás en VR, pulsa el botón de micrófono nuevamente para reactivarlo.\n\nDetalle: ${msg}`,
        "bot",
      );
      try {
        cleanupArmedMode();
      } catch (_) {}
      micNeedsRearm = true;
    } finally {
      micRearmInProgress = false;
    }
  }

  // Reanuda el audio si el navegador lo pausó.
  async function resumeAudioContextBestEffort() {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch (_) {}
    }
  }

  // Reactiva el micrófono al entrar a una sesión VR.
  async function onXRSessionStart() {
    await resumeAudioContextBestEffort();

    // Si el track quedó inválido/muted/ended, rearmamos.
    const track = micStream?.getAudioTracks?.()?.[0];
    if (armed && track && (track.readyState === "ended" || track.muted)) {
      await rearmMicBestEffort(
        track.readyState === "ended" ? "track ended" : "track muted",
      );
      return;
    }

    // Asegura que el loop del VAD esté corriendo
    if (armed) startVADLoop();
  }

  // Pide permiso de micrófono y lo deja listo para escuchar.
  async function ensureMicArmed() {
    if (!window.isSecureContext) {
      addBubble(
        state,
        drawPanel,
        "⚠️ El micrófono requiere HTTPS (secure context).",
        "bot",
      );
      return false;
    }
    if (!canRecord()) {
      addBubble(
        state,
        drawPanel,
        "🎤 Este navegador no soporta grabación de audio (MediaRecorder).",
        "bot",
      );
      return false;
    }

    const existingTrack = micStream?.getAudioTracks?.()?.[0] || null;
    const hasLiveTrack = !!existingTrack && existingTrack.readyState === "live";

    if (!hasLiveTrack) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        const msg =
          err && (err.name || err.message)
            ? `${err.name || ""} ${err.message || ""}`.trim()
            : String(err);
        addBubble(
          state,
          drawPanel,
          `🎤 No se pudo acceder al micrófono.\n\nDetalle: ${msg}`,
          "bot",
        );
        return false;
      }
    }

    attachTrackWatchers();

    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
    } else if (!analyser) {
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
    }

    await resumeAudioContextBestEffort();

    // Arranca el recorder para pre-roll (evita cortar las primeras palabras)
    startHotRecorder();

    armed = true;
    aboveSince = 0;
    belowSince = 0;
    lastStopAt = 0;
    idleSilenceSince = 0;

    setListening(state, drawPanel, true);
    startVADLoop();
    return true;
  }

  // Empieza a grabar audio desde cero (pide el micrófono).
  async function startRecording() {
    if (!window.isSecureContext) {
      addBubble(
        state,
        drawPanel,
        "⚠️ El micrófono requiere HTTPS (secure context).",
        "bot",
      );
      return;
    }
    if (!canRecord()) {
      addBubble(
        state,
        drawPanel,
        "🎤 Este navegador no soporta grabación de audio (MediaRecorder).",
        "bot",
      );
      return;
    }

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    attachTrackWatchers();

    chunks = [];
    mediaRecorder = new MediaRecorder(
      micStream,
      preferredMediaRecorderOptions(),
    );

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      detachTrackWatchers();
      try {
        micStream?.getTracks()?.forEach((t) => t.stop());
      } catch (_) {}
      micStream = null;

      const blob = new Blob(chunks, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      chunks = [];

      await sendAudioBlob(blob, mediaRecorder.mimeType || "audio/webm");
    };

    mediaRecorder.start();
    recording = true;
    setListening(state, drawPanel, true);
  }

  // Corta la grabación actual.
  function stopRecording() {
    if (armed && hotRecorder && (capturing || recording)) {
      finalizeHotCaptureAndSend();
      return;
    }

    // Modo manual
    try {
      mediaRecorder?.stop();
    } catch (_) {}
    recording = false;
    // En modo armado, seguimos escuchando aunque la grabación se detenga.
    if (!armed) setListening(state, drawPanel, false);
  }

  // Prende o apaga el micrófono (botón de hablar).
  async function toggleMic() {
    if (state.aiSpeaking || requestInFlight) return;

    if (!canRecord()) {
      addBubble(
        state,
        drawPanel,
        "🎤 Este navegador no soporta grabación de audio (MediaRecorder).",
        "bot",
      );
      return;
    }

    // Modo manos libres: 1er toque arma, 2do toque apaga.
    if (armed || recording) {
      try {
        if (recording) stopRecording();
      } catch (_) {}
      cleanupArmedMode();
      return;
    }

    try {
      await ensureMicArmed();
    } catch (e) {
      console.error("ensureMicArmed error:", e);
      cleanupArmedMode();

      const name = e?.name || "";
      const msg =
        name === "NotAllowedError"
          ? "Permiso de micrófono denegado."
          : name === "NotFoundError"
            ? "No se encontró micrófono."
            : "No pude iniciar el micrófono.";
      addBubble(state, drawPanel, "🎤 " + msg, "bot");
    }
  }

  return {
    toggleMic,
    isRecording: () => recording,
    stop: () => {
      shouldResumeAfterReply = false;
      requestInFlight = false;
      setAISpeaking(state, drawPanel, false);
      try {
        ttsPlayer?.stop?.();
      } catch (_) {}
      try {
        if (recording) stopRecording();
      } catch (_) {}
      try {
        cleanupArmedMode();
      } catch (_) {}
    },
    startRecording,
    startRecordingUsingExistingStream,
    onXRSessionStart,
  };
}

// Manda un mensaje de texto escrito por el jugador.
export async function sendTextMessage({ text, state, drawPanel, ttsPlayer }) {
  text = (text || "").trim();
  if (!text) return;

  addBubble(state, drawPanel, text, "user");
  setAISpeaking(state, drawPanel, true);

  try {
    const body = {
      message: text,
      want_audio: true,
      voice: window.ASTRO_CONFIG?.voice || "nova",
      language: window.ASTRO_CONFIG?.lang || "es",
      planet_topic: window.ASTRO_CONFIG?.selectedPlanet?.topic || "",
    };
    await deliverReply(body, { state, drawPanel, ttsPlayer });
  } catch (err) {
    addBubble(state, drawPanel, "Error al enviar el mensaje: " + (err?.message || "intentá de nuevo."), "bot");
    console.error("sendTextMessage error:", err);
  } finally {
    setAISpeaking(state, drawPanel, false);
  }
}

// Dispara el saludo automático del astronauta al llegar a un planeta.
export async function sendAutoGreeting({ state, drawPanel, ttsPlayer, planetName }) {
  setAISpeaking(state, drawPanel, true);
  try {
    const body = {
      message: `Preséntate en una sola frase y de inmediato comparte un dato curioso y poco conocido sobre ${planetName || "este lugar"}, como si acabaras de notar que alguien llegó.`,
      want_audio: true,
      voice: window.ASTRO_CONFIG?.voice || "nova",
      language: window.ASTRO_CONFIG?.lang || "es",
      planet_topic: window.ASTRO_CONFIG?.selectedPlanet?.topic || "",
      no_images: true,
    };
    await deliverReply(body, { state, drawPanel, ttsPlayer });
  } catch (err) {
    console.error("sendAutoGreeting error:", err);
  } finally {
    setAISpeaking(state, drawPanel, false);
  }
}

// Manda una expedición al planeta y pide el reporte de hallazgos.
export async function sendExpeditionFindings({ state, drawPanel, ttsPlayer, planetName }) {
  addBubble(state, drawPanel, "🛰️ Expedición enviada — extrayendo muestras y recuperando el vehículo…", "user");
  setAISpeaking(state, drawPanel, true);
  try {
    const body = {
      message: `Actuá como si acabaras de recuperar un vehículo de exploración que extrajo muestras de la superficie de ${planetName || "el planeta"}. Contá con entusiasmo, en 2 o 3 datos concretos, qué encontró la expedición (composición del suelo, algún hallazgo geológico o dato curioso real).`,
      want_audio: true,
      voice: window.ASTRO_CONFIG?.voice || "nova",
      language: window.ASTRO_CONFIG?.lang || "es",
      planet_topic: window.ASTRO_CONFIG?.selectedPlanet?.topic || "",
      no_images: true,
    };
    await deliverReply(body, { state, drawPanel, ttsPlayer });
  } catch (err) {
    addBubble(state, drawPanel, "Error al recuperar los datos de la expedición: " + (err?.message || "intentá de nuevo."), "bot");
    console.error("sendExpeditionFindings error:", err);
  } finally {
    setAISpeaking(state, drawPanel, false);
  }
}

/** Envía la petición al backend y muestra/reproduce la respuesta del astronauta. */
// Manda la petición al backend y muestra la respuesta en el panel.
async function deliverReply(body, { state, drawPanel, ttsPlayer }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // El backend manda {error:"..."} en el cuerpo — mostrar ESE mensaje
    // (en vez de un genérico) evita tener que adivinar la causa real
    // (por ejemplo, una clave de API de OpenAI faltante o inválida).
    let detail = "HTTP " + res.status;
    try {
      const errBody = await res.json();
      if (errBody?.error) detail = errBody.error;
    } catch (_) {}
    throw new Error(detail);
  }

  const data = await res.json();

  const reply = (data.reply || "").trim();
  if (reply) addBubble(state, drawPanel, reply, "bot");

  if (data.audio_base64 && ttsPlayer) {
    try {
      const binary = atob(data.audio_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      ttsPlayer.play(url);
    } catch (_) {}
  }

  if (Array.isArray(data.images) && data.images.length > 0) {
    addImagesBubble(state, drawPanel, data.images);
  }
}

// Conecta el teclado físico de escritorio con la caja de texto del panel.
export function setupKeyboardInput({ state, drawPanel, ttsPlayer }) {
  window.addEventListener("keydown", (e) => {
    if (!state.textInputFocused) return;

    // Si hay un <input> real enfocado (el usado en VR/celular para pedirle
    // teclado al sistema), que sea él quien procese la tecla, para no
    // escribir cada carácter dos veces.
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;

    if (e.key === "Enter") {
      e.preventDefault();
      const text = state.textInput.trim();
      if (text) {
        state.textInput = "";
        state.textInputFocused = false;
        drawPanel();
        sendTextMessage({ text, state, drawPanel, ttsPlayer });
      }
      return;
    }

    if (e.key === "Escape") {
      state.textInputFocused = false;
      drawPanel();
      return;
    }

    if (e.key === "Backspace") {
      state.textInput = state.textInput.slice(0, -1);
      drawPanel();
      return;
    }

    // Solo caracteres imprimibles
    if (e.key.length === 1) {
      state.textInput += e.key;
      drawPanel();
    }
  });

  // Cursor parpadeante requiere redibujado continuo mientras está enfocado
  setInterval(() => {
    if (state.textInputFocused) drawPanel();
  }, 500);
}
