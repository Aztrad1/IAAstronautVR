// Panel de chat 3D del astronauta: se monta sobre el renderer/escena que
// ya trae lobbyScene.js. initMission() arma todo una vez y devuelve
// funciones para reutilizarlo en cada misión (setPlanet, show, hide, tick).

import {
  PLANET_ENVIRONMENTS,
  ASTRONAUT_SPRITE,
  ASTRONAUT_SIDE_OFFSET,
  ASTRONAUT_SCALE_MULT,
  PANEL_DISTANCE_DEFAULT,
  HIT_ZONES,
  SETTINGS_ZONES,
  VOICES,
} from "./config.js";

import {
  createUIState,
  createPanel,
  drawPanelFactory,
  addBubble,
} from "./uiPanel.js";

import { createTTSPlayer, createMicChatController, sendTextMessage, sendAutoGreeting, sendExpeditionFindings, setupKeyboardInput } from "./chat.js";
import { setupDesktopMobileInput } from "./inputDesktopMobile.js";
import { setupXRInput } from "./inputXR.js";

// Dice si el navegador es de celular.
function isMobileUA() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

// Muestra el cartel de ayuda de controles en escritorio.
function createDesktopHelp(renderer) {
  if (renderer.xr.isPresenting) return;
  if (isMobileUA()) return;
  if (localStorage.getItem("astronauta_help_dismissed") === "1") return;
  if (document.getElementById("vrDesktopHelp")) return;

  const wrap = document.createElement("div");
  wrap.id = "vrDesktopHelp";
  wrap.style.position = "fixed";
  wrap.style.left = "16px";
  wrap.style.bottom = "16px";
  wrap.style.maxWidth = "460px";
  wrap.style.background = "rgba(11, 18, 32, 0.92)";
  wrap.style.color = "#fff";
  wrap.style.border = "1px solid rgba(255,255,255,0.18)";
  wrap.style.borderRadius = "14px";
  wrap.style.padding = "12px 14px";
  wrap.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
  wrap.style.zIndex = "9999";
  wrap.style.backdropFilter = "blur(6px)";
  wrap.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
  wrap.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <div style="font-weight:700; font-size:14px;">Controles (Escritorio)</div>
      <button id="vrHelpClose"
        style="cursor:pointer; border:0; background:rgba(255,255,255,0.12); color:#fff;
              border-radius:10px; padding:6px 10px; font-weight:700;">
        ✕
      </button>
    </div>
    <div style="margin-top:8px; font-size:13px; line-height:1.35; color:rgba(255,255,255,0.92);">
      <div>🖱️ <b>Mover panel:</b> Arrastra desde el botón con flechas</div>
      <div>🧾 <b>Scroll chat:</b> Rueda del mouse sobre el chat</div>
      <div>🔎 <b>Zoom panel:</b> <b>Shift</b> + rueda</div>
      <div>🧭 <b>Mirar alrededor:</b> Click derecho + arrastrar <i>o</i> <b>Shift</b> + arrastrar</div>
      <div style="margin-top:6px; opacity:0.85;">En Quest: apunta al chat y usa el thumbstick para hacer scroll.</div>
      <div style="margin-top:6px; opacity:0.85;">Con manos: haz <b>pinch</b> y arrastra dentro del chat.</div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector("#vrHelpClose")?.addEventListener("click", () => {
    localStorage.setItem("astronauta_help_dismissed", "1");
    wrap.remove();
  });
}

/**
 * Monta el sistema de misión (astronauta + panel de chat) UNA sola vez
 * dentro del renderer/escena/cámara que ya trae el lobby.
 */
// Crea el panel de chat completo y devuelve las funciones para usarlo.
export function initMission({ THREE, renderer, scene, camera, cameraRig, onExit }) {
  let _clickAudioCtx = null;
  window.playClickSound = window.playClickSound || function playClickSound() {
    if (window.ASTRO_CONFIG && window.ASTRO_CONFIG.sfx === false) return;
    try {
      _clickAudioCtx = _clickAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (_clickAudioCtx.state === "suspended") _clickAudioCtx.resume();
      const ctx = _clickAudioCtx;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(440, t0 + 0.07);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    } catch (_) { /* WebAudio no disponible: se ignora silenciosamente */ }
  };
  const playClickSound = window.playClickSound;

  const texLoader = new THREE.TextureLoader();

  // Panel UI — se crea una vez
  const state = createUIState();
  const { panelCanvas, ctx, panelTex, panelMesh, uiGroup } = createPanel({ THREE, scene, camera });
  uiGroup.visible = false;

  let panelDistance = PANEL_DISTANCE_DEFAULT;

  // Ajusta el tamaño del panel según la plataforma.
  function applyPanelScale() {
    if (renderer.xr.isPresenting) {
      uiGroup.scale.set(1, 1, 1);
      return;
    }
    if (isMobileUA()) uiGroup.scale.set(0.75, 0.75, 0.75);
    else uiGroup.scale.set(1.00, 1.00, 1.00);
  }
  applyPanelScale();

  const drawPanel = drawPanelFactory({ THREE, panelCanvas, ctx, panelTex, state, isVR: () => renderer.xr.isPresenting });

  // Centra el panel frente a la cámara en escritorio.
  function centerPanelDesktopLikeReload() {
    applyPanelScale();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();

    const scale = uiGroup.scale.x || 1;
    const dist = panelDistance / Math.max(0.65, scale);

    const target = camera.position
      .clone()
      .add(forward.multiplyScalar(dist))
      .add(new THREE.Vector3(0, 0.12, 0));

    uiGroup.position.copy(target);
    uiGroup.lookAt(camera.position);
  }

  // Recentra el panel frente al jugador (botón RECALIBRAR).
  function recenterPanel() {
    const inXR = renderer.xr.isPresenting === true;
    if (!inXR) return centerPanelDesktopLikeReload();

    try {
      applyPanelScale();
      const headPos = new THREE.Vector3();
      const headQuat = new THREE.Quaternion();
      camera.getWorldPosition(headPos);
      camera.getWorldQuaternion(headQuat);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(headQuat).normalize();

      const target = headPos.clone().add(forward.multiplyScalar(panelDistance)).add(up.multiplyScalar(-0.10));

      uiGroup.position.copy(target);
      uiGroup.lookAt(headPos);
    } catch (err) {
      console.error("[missionScene] Error al recalibrar el panel en VR:", err);
    }
  }

  // Avisa al lobby que hay que salir de la misión.
  function exitAndRedirect() {
    if (typeof onExit === "function") onExit();
  }

  // Muestra un mensaje del astronauta una sola vez por texto.
  const shownHints = new Set();
  function addBubbleOnce(text) {
    if (shownHints.has(text)) return;
    shownHints.add(text);
    addBubble(state, drawPanel, text, "bot");
  }

  // Decide qué hacer según qué botón del panel se tocó.
  async function handleActionFromHit(hit) {
    const p = hit?.uv
      ? { x: hit.uv.x * panelCanvas.width, y: (1 - hit.uv.y) * panelCanvas.height }
      : null;
    if (!p) return;

    const inRect = (pt, r) =>
      pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;

    if (inRect(p, HIT_ZONES.exit)) { playClickSound(); return exitAndRedirect(); }

    if (inRect(p, HIT_ZONES.settings)) {
      playClickSound();
      state.showSettings = !state.showSettings;
      drawPanel();
      return;
    }

    if (inRect(p, HIT_ZONES.recenter)) { playClickSound(); return recenterPanel(); }

    if (state.expeditionAvailable && inRect(p, HIT_ZONES.expedition)) {
      playClickSound();
      const planetName = window.ASTRO_CONFIG?.selectedPlanet?.name;
      return sendExpeditionFindings({ state, drawPanel, ttsPlayer: tts, planetName });
    }

    if (state.showSettings) {
      const cfg = window.ASTRO_CONFIG || {};
      if (inRect(p, SETTINGS_ZONES.langEs))  { playClickSound(); cfg.lang = "es"; drawPanel(); return; }
      if (inRect(p, SETTINGS_ZONES.langEn))  { playClickSound(); cfg.lang = "en"; drawPanel(); return; }
      if (inRect(p, SETTINGS_ZONES.sfxOn))   { playClickSound(); cfg.sfx = true; drawPanel(); return; }
      if (inRect(p, SETTINGS_ZONES.sfxOff))  { playClickSound(); cfg.sfx = false; drawPanel(); return; }
      if (inRect(p, SETTINGS_ZONES.voice))   {
        playClickSound();
        const i = VOICES.findIndex(v => v.id === cfg.voice);
        cfg.voice = VOICES[(i + 1 + VOICES.length) % VOICES.length].id;
        drawPanel();
        return;
      }
      if (inRect(p, SETTINGS_ZONES.back))    { playClickSound(); state.showSettings = false; drawPanel(); return; }
      return;
    }

    if (inRect(p, HIT_ZONES.talk)) { playClickSound(); return mic.toggleMic(); }

    // El chat de texto (caja + ENVIAR) no responde en VR — en el casco se
    // usa el micrófono. En escritorio y celular funciona normalmente.
    if (inRect(p, HIT_ZONES.textInput)) {
      playClickSound();
      if (renderer.xr.isPresenting) {
        addBubbleOnce("En VR usá el micrófono para hablar: tocá 'INICIAR TRANSMISIÓN'.");
        return;
      }
      focusHiddenTextInput();
      return;
    }

    if (inRect(p, HIT_ZONES.sendBtn)) {
      if (renderer.xr.isPresenting) return;
      if ((state.textInput || "").trim()) playClickSound();
      sendTypedText();
      return;
    }
  }

  // Input HTML invisible que recibe el foco para pedirle teclado al sistema.
  const hiddenTextInput = document.createElement("input");
  hiddenTextInput.type = "text";
  hiddenTextInput.autocomplete = "off";
  hiddenTextInput.setAttribute("autocapitalize", "sentences");
  hiddenTextInput.spellcheck = false;
  hiddenTextInput.style.cssText =
    "position:fixed;left:-9999px;top:0;width:220px;height:44px;" +
    "font-size:16px;border:0;padding:0;margin:0;opacity:0.01;pointer-events:none;";
  document.body.appendChild(hiddenTextInput);

  // Refleja lo que se escribe en el input oculto en el panel dibujado.
  hiddenTextInput.addEventListener("input", () => {
    state.textInput = hiddenTextInput.value;
    drawPanel();
  });
  hiddenTextInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendTypedText(); }
    else if (e.key === "Escape") { blurHiddenTextInput(); drawPanel(); }
  });

  // Enfoca la caja de texto (no en VR: puede crashear el navegador).
  function focusHiddenTextInput() {
    state.textInputFocused = true;
    hiddenTextInput.value = state.textInput || "";
    drawPanel();
    if (renderer.xr.isPresenting) return;
    hiddenTextInput.focus({ preventScroll: true });
  }
  // Le quita el foco a la caja de texto.
  function blurHiddenTextInput() {
    state.textInputFocused = false;
    hiddenTextInput.blur();
  }
  // Envía el texto escrito en la caja.
  function sendTypedText() {
    const text = (state.textInput || "").trim();
    if (!text) return;
    state.textInput = "";
    hiddenTextInput.value = "";
    blurHiddenTextInput();
    drawPanel();
    sendTextMessage({ text, state, drawPanel, ttsPlayer: tts });
  }

  // Mic/chat — se crea una vez
  const tts = createTTSPlayer();
  const mic = createMicChatController({ state, drawPanel, ttsPlayer: tts });
  setupKeyboardInput({ state, drawPanel, ttsPlayer: tts });

  // Registra los controles de mouse/touch, una sola vez.
  setupDesktopMobileInput({
    THREE,
    renderer,
    camera,
    panelMesh,
    panelCanvas,
    uiGroup,
    state,
    drawPanel,
    recenterPanel,
    setPanelDistance: (v) => { panelDistance = v; },
    getPanelDistance: () => panelDistance,
    handleActionFromHit,
    isActive: () => missionActive,
  });

  // Registra los controles/manos de VR, una sola vez.
  const xr = setupXRInput({
    THREE,
    renderer,
    scene,
    cameraRig,
    camera,
    panelMesh,
    panelCanvas,
    uiGroup,
    state,
    drawPanel,
    handleActionFromHit,
  });

  // El astronauta que flota junto al panel de chat.
  let astronautSprite = null;
  const AOFF = new THREE.Vector3(ASTRONAUT_SIDE_OFFSET.x, ASTRONAUT_SIDE_OFFSET.y, ASTRONAUT_SIDE_OFFSET.z);

  // Crea un sprite 2D a partir de una imagen.
  function makeSprite(url, size, opacity) {
    const tex = texLoader.load(
      url,
      (t) => { t.colorSpace = THREE.SRGBColorSpace; },
      undefined,
      (e) => console.warn("No pude cargar sprite:", url, e)
    );
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: typeof opacity === "number" ? opacity : 1.0,
      depthWrite: false,
      depthTest: true,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(size, size, 1);
    return sp;
  }

  // Quita el astronauta actual de la escena.
  function clearEnvironment() {
    if (astronautSprite) {
      uiGroup.remove(astronautSprite);
      astronautSprite.material?.map?.dispose?.();
      astronautSprite.material?.dispose?.();
      astronautSprite = null;
    }
  }

  // Prepara la misión para el planeta elegido (colores + astronauta).
  function buildEnvironment(planetId) {
    clearEnvironment();

    const ENV = PLANET_ENVIRONMENTS[planetId] || PLANET_ENVIRONMENTS["default"];
    if (window.ASTRO_CONFIG) window.ASTRO_CONFIG._panelColors = ENV.panel || null;

    const sp = makeSprite(ASTRONAUT_SPRITE.url, ASTRONAUT_SPRITE.size, ASTRONAUT_SPRITE.opacity);
    sp.name = "astronaut";
    astronautSprite = sp;
    astronautSprite.position.copy(AOFF);
    astronautSprite.scale.set(ASTRONAUT_SPRITE.size * ASTRONAUT_SCALE_MULT, ASTRONAUT_SPRITE.size * ASTRONAUT_SCALE_MULT, 1);
    astronautSprite.renderOrder = 3;
    astronautSprite.material.depthWrite = false;
    uiGroup.add(astronautSprite);
  }

  // Dispara el saludo automático del astronauta al llegar a un planeta.
  function greet(planetName) {
    sendAutoGreeting({ state, drawPanel, ttsPlayer: tts, planetName });
  }

  // Anima el pequeño balanceo del astronauta cada frame.
  function updateAstronaut(tSec) {
    if (!astronautSprite) return;
    const bobLocal = Math.sin(tSec * 1.15) * 0.05;
    const sway = Math.sin(tSec * 0.85) * 0.03;
    astronautSprite.position.set(AOFF.x + sway, AOFF.y + bobLocal, AOFF.z);
    astronautSprite.material.rotation = Math.sin(tSec * 0.9) * 0.08;
  }

  drawPanel();

  let missionActive = false;

  // Muestra u oculta la retícula/rayo de los mandos VR de la misión.
  function setMissionControllerVisualsVisible(v) {
    [xr.controllers?.controller0, xr.controllers?.controller1].forEach((c) => {
      if (!c) return;
      if (c.userData.missionReticle) c.userData.missionReticle.visible = v;
      if (c.userData.missionRayLine) c.userData.missionRayLine.visible = v;
    });
  }

  // Muestra el panel de chat.
  function show() {
    missionActive = true;
    uiGroup.visible = true;
    setMissionControllerVisualsVisible(true);
    createDesktopHelp(renderer);
    recenterPanel();
  }

  // Oculta el panel de chat.
  function hide() {
    missionActive = false;
    uiGroup.visible = false;
    setMissionControllerVisualsVisible(false);
    document.getElementById("vrDesktopHelp")?.remove();
    document.getElementById("astro-exit-fallback")?.remove();
    blurHiddenTextInput();
    uiGroup.position.set(0, -600, 0);
    state.expeditionAvailable = false;
  }
  hide();

  // Muestra u oculta el banner "Iniciar expedición" del panel.
  function setExpeditionAvailable(v) {
    state.expeditionAvailable = !!v;
    drawPanel();
  }

  // Se llama una vez por frame mientras el panel está visible.
  function tick(tSec) {
    if (!missionActive) return;
    xr.tickXR?.();
    if (Math.abs(state.scrollVel) > 0.01 && state.scrollMax > 0) {
      state.scrollY = THREE.MathUtils.clamp(state.scrollY + state.scrollVel, 0, state.scrollMax);
      state.scrollVel *= 0.86;
      if (state.scrollY <= 0 || state.scrollY >= state.scrollMax) state.scrollVel = 0;
      drawPanel();
    }
    updateAstronaut(tSec);
  }

  // Reacomoda el panel cuando arranca una sesión VR.
  function onXRSessionStart() {
    if (!missionActive) return;
    applyPanelScale();
    setTimeout(recenterPanel, 120);
    try { mic?.onXRSessionStart?.(); } catch (_) {}
  }

  // Reacomoda el panel cuando termina una sesión VR.
  function onXRSessionEnd() {
    if (!missionActive) return;
    applyPanelScale();
    centerPanelDesktopLikeReload();
    createDesktopHelp(renderer);
  }

  // Reacomoda el panel cuando cambia el tamaño de la ventana.
  function resize() {
    applyPanelScale();
    if (!renderer.xr.isPresenting) centerPanelDesktopLikeReload();
  }

  return {
    setPlanet: buildEnvironment,
    show,
    hide,
    tick,
    greet,
    setExpeditionAvailable,
    onXRSessionStart,
    onXRSessionEnd,
    resize,
    recenterPanel,
    isActive: () => missionActive,
    uiGroup,
    panelMesh,
  };
}
