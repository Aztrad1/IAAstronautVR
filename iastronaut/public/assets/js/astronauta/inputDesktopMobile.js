// Controles de mouse, rueda y toques (escritorio y celular) para el panel
// de chat: scroll, arrastrar el panel, mirar alrededor, pinch y botones.
import { HIT_ZONES, PANEL_DISTANCE_MIN, PANEL_DISTANCE_MAX } from "./config.js";

// Dice si el navegador es de celular.
function isMobileUA() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

// Convierte un punto de un raycast a coordenadas del canvas del panel.
function uvToCanvas(hit, panelCanvas) {
  if (!hit?.uv) return null;
  return { x: hit.uv.x * panelCanvas.width, y: (1 - hit.uv.y) * panelCanvas.height };
}
// Dice si un punto cae dentro de un rectángulo.
function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Conecta el mouse, la rueda y los toques con el panel de chat.
export function setupDesktopMobileInput({
  THREE,
  renderer,
  camera,
  panelMesh,
  panelCanvas,
  uiGroup,
  state,
  drawPanel,
  recenterPanel,
  setPanelDistance,
  getPanelDistance,
  handleActionFromHit,
  isActive, // () => boolean — verdadero solo mientras la misión está en pantalla
}) {
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();
  const checkActive = typeof isActive === "function" ? isActive : () => true;

  // Guarda la posición del mouse en coordenadas normalizadas.
  function setMouseFromEvent(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  }

  // Lanza un rayo desde el mouse hacia el panel.
  function mouseRaycast(ev) {
    setMouseFromEvent(ev);
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObject(panelMesh, false);
    return hits.length ? hits[0] : null;
  }

  // Arrastrar el panel o hacer scroll con el mouse.
  const dragPanel = {
    active: false,
    moved: false,
    downTime: 0,
    startX: 0,
    startY: 0,
    plane: new THREE.Plane(),
    intersection: new THREE.Vector3(),
    offset: new THREE.Vector3(),
  };

  const scrollDrag = {
    active: false,
    moved: false,
    lastCanvasY: 0,
  };

  let downHit = null;
  let downWasOnPanel = false;

  // Actualiza el plano imaginario que se usa para arrastrar el panel.
  function updatePanelPlane() {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(uiGroup.quaternion).normalize();
    dragPanel.plane.setFromNormalAndCoplanarPoint(normal, uiGroup.position);
  }

  // Se activa al presionar el mouse/dedo.
  function onPointerDown(ev) {
    // Si la misión no está activa, el panel de chat no existe en pantalla
    // (está escondido lejos del origen) — no hay nada que este manejador
    // deba hacer todavía.
    if (!checkActive()) return;

    downHit = null;
    downWasOnPanel = false;

    const hit = (ev.pointerType === "mouse" || ev.pointerType === "touch") ? mouseRaycast(ev) : null;
    if (!hit) return;

    downHit = hit;
    downWasOnPanel = true;

    scrollDrag.active = false;
    scrollDrag.moved = false;

    const p = uvToCanvas(hit, panelCanvas);
    if (!p) return;

    // Scroll por arrastre dentro del chat
    if (inRect(p, HIT_ZONES.chat)) {
      scrollDrag.active = true;
      scrollDrag.moved = false;
      scrollDrag.lastCanvasY = p.y;

      dragPanel.active = false;
      dragPanel.moved = false;
      dragPanel.downTime = performance.now();
      dragPanel.startX = ev.clientX;
      dragPanel.startY = ev.clientY;
      return;
    }

    // Mover panel solo desde handle grab
    if (!inRect(p, HIT_ZONES.grab)) {
      dragPanel.active = false;
      dragPanel.moved = false;
      dragPanel.downTime = performance.now();
      dragPanel.startX = ev.clientX;
      dragPanel.startY = ev.clientY;
      return;
    }

    dragPanel.active = true;
    dragPanel.moved = false;
    dragPanel.downTime = performance.now();
    dragPanel.startX = ev.clientX;
    dragPanel.startY = ev.clientY;

    updatePanelPlane();
    if (raycaster.ray.intersectPlane(dragPanel.plane, dragPanel.intersection)) {
      dragPanel.offset.copy(uiGroup.position).sub(dragPanel.intersection);
    } else {
      dragPanel.offset.set(0, 0, 0);
    }
  }

  // Se activa al mover el mouse/dedo mientras está presionado.
  function onPointerMove(ev) {
    // Scroll drag dentro del chat
    if (scrollDrag.active) {
      const hit = mouseRaycast(ev);
      if (!hit) return;

      const p = uvToCanvas(hit, panelCanvas);
      if (!p) return;
      if (!inRect(p, HIT_ZONES.chat)) return;

      const dy = p.y - scrollDrag.lastCanvasY;
      scrollDrag.lastCanvasY = p.y;

      if (Math.abs(dy) > 1) scrollDrag.moved = true;

      state.scrollY = THREE.MathUtils.clamp(state.scrollY - dy * 1.15, 0, state.scrollMax);
      state.scrollVel = 0;
      drawPanel();
      return;
    }

    if (!dragPanel.active) return;

    const dx = ev.clientX - dragPanel.startX;
    const dy = ev.clientY - dragPanel.startY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragPanel.moved = true;

    setMouseFromEvent(ev);
    raycaster.setFromCamera(mouseNDC, camera);

    updatePanelPlane();
    if (raycaster.ray.intersectPlane(dragPanel.plane, dragPanel.intersection)) {
      uiGroup.position.copy(dragPanel.intersection).add(dragPanel.offset);
      uiGroup.lookAt(camera.position);
    }
  }

  async function onPointerUp() {
    if (!downWasOnPanel) return;

    const heldMs = performance.now() - (dragPanel.downTime || performance.now());
    const wasPanelDrag = dragPanel.active && (dragPanel.moved || heldMs > 180);
    const wasScrollDrag = scrollDrag.active && scrollDrag.moved;

    dragPanel.active = false;
    scrollDrag.active = false;

    if (!wasPanelDrag && !wasScrollDrag && downHit) {
      await handleActionFromHit(downHit);
    }

    downHit = null;
    downWasOnPanel = false;
  }

  // Cancela cualquier arrastre en curso.
  function cancelDrag() {
    dragPanel.active = false;
    scrollDrag.active = false;
    downHit = null;
    downWasOnPanel = false;
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", cancelDrag);
  renderer.domElement.addEventListener("pointerleave", cancelDrag);

  // Hace scroll o zoom con la rueda del mouse.
  function onWheel(ev) {
    if (!checkActive()) return;
    const hit = mouseRaycast(ev);
    if (!hit) return;

    const p = uvToCanvas(hit, panelCanvas);
    if (!p) return;
    if (!inRect(p, HIT_ZONES.chat)) return;

    if (ev.shiftKey) {
      ev.preventDefault();
      const delta = Math.sign(ev.deltaY);
      const newDist = THREE.MathUtils.clamp(getPanelDistance() + delta * 0.12, PANEL_DISTANCE_MIN, PANEL_DISTANCE_MAX);
      setPanelDistance(newDist);
      recenterPanel();
      return;
    }

    ev.preventDefault();
    const step = 70;
    state.scrollY = THREE.MathUtils.clamp(state.scrollY + Math.sign(ev.deltaY) * step, 0, state.scrollMax);
    state.scrollVel = 0;
    drawPanel();
  }
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  const look = { active: false, yaw: 0, pitch: 0, lastX: 0, lastY: 0 };

  // Empieza a mirar alrededor con el mouse.
  function onLookDown(ev) {
    if (isMobileUA()) return;
    if (!checkActive()) return;
    const useLook = window.ASTRO_CONFIG?.cameraActive || ev.button === 2 || ev.shiftKey;
    if (!useLook) return;

    look.active = true;
    look.lastX = ev.clientX;
    look.lastY = ev.clientY;
    ev.preventDefault();
  }

  // Gira la cámara mientras se mira alrededor con el mouse.
  function onLookMove(ev) {
    if (!look.active) return;

    const dx = ev.clientX - look.lastX;
    const dy = ev.clientY - look.lastY;
    look.lastX = ev.clientX;
    look.lastY = ev.clientY;

    look.yaw -= dx * 0.003;
    look.pitch -= dy * 0.003;
    look.pitch = THREE.MathUtils.clamp(look.pitch, -1.2, 1.2);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, "YXZ"));
    camera.quaternion.copy(q);
    uiGroup.lookAt(camera.position);
  }

  // Termina de mirar alrededor con el mouse.
  function onLookUp() {
    look.active = false;
  }

  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener("mousedown", onLookDown);
  window.addEventListener("mousemove", onLookMove);
  window.addEventListener("mouseup", onLookUp);

  const touchLook = { active: false, lastX: 0, lastY: 0 };
  const pinch = { active: false, startDist: 0, startPanelDistance: 0 };
  const touchScroll = { active: false, lastY: 0 };

  // Calcula la distancia entre dos dedos (para el pinch).
  function dist2Touches(t0, t1) {
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }

  // Lanza un rayo desde un punto de la pantalla hacia el panel.
  function touchRaycastAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObject(panelMesh, false);
    return hits.length ? hits[0] : null;
  }

  // Se activa al tocar la pantalla.
  function onTouchStart(ev) {
    if (!isMobileUA()) return;
    if (renderer.xr.isPresenting) return;
    if (!checkActive()) return;

    if (ev.touches.length === 2) {
      pinch.active = true;
      pinch.startDist = dist2Touches(ev.touches[0], ev.touches[1]);
      pinch.startPanelDistance = getPanelDistance();
      touchLook.active = false;
      touchScroll.active = false;
      ev.preventDefault();
      return;
    }

    if (ev.touches.length === 1) {
      const t = ev.touches[0];
      const hit = touchRaycastAt(t.clientX, t.clientY);
      if (hit) {
        const p = uvToCanvas(hit, panelCanvas);
        if (p && inRect(p, HIT_ZONES.chat)) {
          touchScroll.active = true;
          touchScroll.lastY = t.clientY;
          touchLook.active = false;
          ev.preventDefault();
          return;
        }
        // Tocó el panel pero fuera del área de scroll (la caja de texto, un
        // botón, etc.) — igual se cancela el comportamiento táctil por
        // defecto, para que el navegador no siga procesando el toque por su
        // cuenta después. Sin esto, el foco que pointerup le acababa de dar
        // al input oculto se perdía de inmediato (el teclado se abría y se
        // cerraba en el mismo instante).
        ev.preventDefault();
        return;
      }

      touchLook.active = true;
      touchLook.lastX = t.clientX;
      touchLook.lastY = t.clientY;
      ev.preventDefault();
    }
  }

  // Se activa al arrastrar el dedo por la pantalla.
  function onTouchMove(ev) {
    if (!isMobileUA()) return;
    if (renderer.xr.isPresenting) return;
    if (!checkActive()) return;

    if (pinch.active && ev.touches.length === 2) {
      const d = dist2Touches(ev.touches[0], ev.touches[1]);
      const ratio = d / Math.max(1, pinch.startDist);
      const newDist = pinch.startPanelDistance / ratio;
      setPanelDistance(THREE.MathUtils.clamp(newDist, PANEL_DISTANCE_MIN, PANEL_DISTANCE_MAX));
      recenterPanel();
      ev.preventDefault();
      return;
    }

    if (touchScroll.active && ev.touches.length === 1) {
      const t = ev.touches[0];
      const dy = t.clientY - touchScroll.lastY;
      touchScroll.lastY = t.clientY;

      state.scrollY = THREE.MathUtils.clamp(state.scrollY - dy * 1.2, 0, state.scrollMax);
      state.scrollVel = 0;
      drawPanel();
      ev.preventDefault();
      return;
    }

    if (touchLook.active && ev.touches.length === 1) {
      const t = ev.touches[0];
      const dx = t.clientX - touchLook.lastX;
      const dy = t.clientY - touchLook.lastY;
      touchLook.lastX = t.clientX;
      touchLook.lastY = t.clientY;

      look.yaw -= dx * 0.0035;
      look.pitch -= dy * 0.0035;
      look.pitch = THREE.MathUtils.clamp(look.pitch, -1.2, 1.2);

      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, "YXZ"));
      camera.quaternion.copy(q);
      uiGroup.lookAt(camera.position);

      ev.preventDefault();
    }
  }

  // Se activa al levantar el dedo de la pantalla.
  function onTouchEnd(ev) {
    if (!isMobileUA()) return;
    if (ev.touches.length < 2) pinch.active = false;
    if (ev.touches.length === 0) {
      touchLook.active = false;
      touchScroll.active = false;
    }
  }

  renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
  renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
  renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: false });
  renderer.domElement.addEventListener("touchcancel", onTouchEnd, { passive: false });

  // Dispose
  return function dispose() {
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointercancel", cancelDrag);
    renderer.domElement.removeEventListener("pointerleave", cancelDrag);

    renderer.domElement.removeEventListener("wheel", onWheel);

    renderer.domElement.removeEventListener("mousedown", onLookDown);
    window.removeEventListener("mousemove", onLookMove);
    window.removeEventListener("mouseup", onLookUp);

    renderer.domElement.removeEventListener("touchstart", onTouchStart);
    renderer.domElement.removeEventListener("touchmove", onTouchMove);
    renderer.domElement.removeEventListener("touchend", onTouchEnd);
    renderer.domElement.removeEventListener("touchcancel", onTouchEnd);
  };
}
