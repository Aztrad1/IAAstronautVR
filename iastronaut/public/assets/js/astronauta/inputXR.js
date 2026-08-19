import { HIT_ZONES, PINCH_ON, PINCH_OFF } from "./config.js";

// Convierte un punto de un raycast a coordenadas del canvas del panel.
function uvToCanvas(hit, panelCanvas) {
  if (!hit?.uv) return null;
  return { x: hit.uv.x * panelCanvas.width, y: (1 - hit.uv.y) * panelCanvas.height };
}
// Dice si un punto cae dentro de un rectángulo.
function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Conecta los mandos y manos de VR con el panel de chat.
export function setupXRInput({
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
}) {
  const xrParent = cameraRig || scene; // por compatibilidad si algún caller no lo pasa aún
  const raycaster = new THREE.Raycaster();
  const tempMatrix = new THREE.Matrix4();

  // -----------------------
  // Controllers
  // -----------------------
  const dragVR = {
    active: false,
    controller: null,
    downTime: 0,
    plane: new THREE.Plane(),
    intersection: new THREE.Vector3(),
    offset: new THREE.Vector3(),
  };

  const scrollVR = {
    active: false,
    controller: null,
    lastCanvasY: 0,
    moved: false,
  };

  // Lanza un rayo desde un mando hacia el panel.
  function castToPanelFromController(controller) {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    const hits = raycaster.intersectObject(panelMesh, false);
    return hits.length ? hits[0] : null;
  }

  // Actualiza el plano imaginario que se usa para arrastrar el panel.
  function updateDragPlaneVR() {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(uiGroup.quaternion).normalize();
    dragVR.plane.setFromNormalAndCoplanarPoint(normal, uiGroup.position);
  }

  // Empieza a arrastrar el panel con un mando.
  function startDragVR(controller) {
    const hit = castToPanelFromController(controller);
    if (!hit) return false;

    const p = uvToCanvas(hit, panelCanvas);
    if (!p) return false;

    if (inRect(p, HIT_ZONES.chat)) return false;
    if (!inRect(p, HIT_ZONES.grab)) return false;

    dragVR.active = true;
    dragVR.controller = controller;
    dragVR.downTime = performance.now();

    updateDragPlaneVR();
    if (raycaster.ray.intersectPlane(dragVR.plane, dragVR.intersection)) {
      dragVR.offset.copy(uiGroup.position).sub(dragVR.intersection);
    } else {
      dragVR.offset.set(0, 0, 0);
    }
    return true;
  }

  // Mueve el panel mientras se lo arrastra con un mando.
  function updateDragVR() {
    if (!dragVR.active || !dragVR.controller) return;

    const controller = dragVR.controller;

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();

    updateDragPlaneVR();
    if (raycaster.ray.intersectPlane(dragVR.plane, dragVR.intersection)) {
      uiGroup.position.copy(dragVR.intersection).add(dragVR.offset);

      const headPos = new THREE.Vector3();
      camera.getWorldPosition(headPos);
      uiGroup.lookAt(headPos);
    }
  }

  // Hace scroll en el chat mientras se arrastra con un mando.
  function updateScrollVR() {
    if (!scrollVR.active || !scrollVR.controller) return;

    const hit = castToPanelFromController(scrollVR.controller);
    if (!hit) return;

    const p = uvToCanvas(hit, panelCanvas);
    if (!p) return;

    if (!inRect(p, HIT_ZONES.chat)) return;

    const dy = p.y - scrollVR.lastCanvasY;
    scrollVR.lastCanvasY = p.y;

    if (Math.abs(dy) > 1) scrollVR.moved = true;

    state.scrollY = THREE.MathUtils.clamp(state.scrollY - dy * 1.15, 0, state.scrollMax);
    state.scrollVel = 0;
    drawPanel();
  }

  // Termina de arrastrar el panel con un mando.
  function endDragVR() {
    if (!dragVR.active) return { wasDrag: false };

    const heldMs = performance.now() - dragVR.downTime;
    dragVR.active = false;
    dragVR.controller = null;
    dragVR.downTime = 0;

    return { wasDrag: heldMs > 220 };
  }

  // Crea el círculo que marca dónde apunta un mando o mano.
  function makeReticle(){
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.014,0.022,28),
      new THREE.MeshBasicMaterial({color:0x2aa9ff,transparent:true,opacity:0.95,side:THREE.DoubleSide,depthTest:false})
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.006,16),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.95,depthTest:false})
    );
    ring.renderOrder = dot.renderOrder = 999;
    const g = new THREE.Group();
    g.add(ring); g.add(dot);
    g.userData.ring = ring;
    g.position.set(0,0,-1);
    return g;
  }

  // Prepara un mando de VR (rayo, retícula, botones).
  function makeController(i) {
    const c = renderer.xr.getController(i);

    c.addEventListener("connected", (e) => {
      c.userData.inputSource = e.data || null;
      c.userData.handedness = e.data?.handedness || "none";
      c.userData.gamepad = e.data?.gamepad || null;
    });

    c.addEventListener("disconnected", () => {
      c.userData.inputSource = null;
      c.userData.gamepad = null;
      c.userData.handedness = "none";
    });

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75 })
    );
    line.scale.z = 2.5;
    c.add(line);

    // Retícula (círculo + punto) que marca exactamente dónde apunta el
    // controlador. Se guarda con clave propia en userData porque el lobby
    // usa el mismo objeto de controlador WebXR para su propia retícula
    // (renderer.xr.getController(i) devuelve siempre la misma instancia).
    const reticle = makeReticle();
    c.add(reticle);
    c.userData.missionReticle = reticle;
    c.userData.missionRayLine = line;

    c.addEventListener("selectstart", () => {
      // 1) scroll en chat
      const hit = castToPanelFromController(c);
      if (hit) {
        const p = uvToCanvas(hit, panelCanvas);
        if (p && inRect(p, HIT_ZONES.chat)) {
          scrollVR.active = true;
          scrollVR.controller = c;
          scrollVR.lastCanvasY = p.y;
          scrollVR.moved = false;
          return;
        }
      }

      // 2) drag panel si apunta al grab
      startDragVR(c);
    });

    c.addEventListener("selectend", async () => {
      // fin scroll
      if (scrollVR.active && scrollVR.controller === c) {
        const wasScroll = scrollVR.moved;
        scrollVR.active = false;
        scrollVR.controller = null;
        scrollVR.moved = false;

        if (!wasScroll) {
          const hit = castToPanelFromController(c);
          if (hit) await handleActionFromHit(hit);
        }
        return;
      }

      const { wasDrag } = endDragVR();
      if (!wasDrag) {
        const hit = castToPanelFromController(c);
        if (hit) await handleActionFromHit(hit);
      }
    });

    xrParent.add(c);
    return c;
  }

  const controller0 = makeController(0);
  const controller1 = makeController(1);

  // Modelo visual 3D del mando físico
  const ctrlModelFactory = THREE.XRControllerModelFactory ? new THREE.XRControllerModelFactory()
    : (window.XRControllerModelFactory ? new window.XRControllerModelFactory() : null);
  if (ctrlModelFactory) {
    const grip0 = renderer.xr.getControllerGrip(0);
    grip0.add(ctrlModelFactory.createControllerModel(grip0));
    xrParent.add(grip0);
    const grip1 = renderer.xr.getControllerGrip(1);
    grip1.add(ctrlModelFactory.createControllerModel(grip1));
    xrParent.add(grip1);
  }

  // -----------------------
  // Hands (pinch scroll)
  // -----------------------
  const hand0 = renderer.xr.getHand(0);
  const hand1 = renderer.xr.getHand(1);
  xrParent.add(hand0, hand1);

  // Modelo visual (malla) de las manos rastreadas
  const handModelFactory = window.XRHandModelFactory ? new window.XRHandModelFactory() : null;
  if (handModelFactory) {
    hand0.add(handModelFactory.createHandModel(hand0, 'mesh'));
    hand1.add(handModelFactory.createHandModel(hand1, 'mesh'));
  }

  const handScroll = { active: false, hand: null, lastY: 0, dySmoothed: 0 };

  const _vA = new THREE.Vector3();
  const _vB = new THREE.Vector3();
  const _vDir = new THREE.Vector3();
  const _vOrigin = new THREE.Vector3();

  // Devuelve una articulación de la mano por nombre.
  function getJoint(hand, name) {
    return hand?.joints?.[name] || null;
  }

  // Dice si los dedos de una mano están haciendo pellizco.
  function isPinching(hand, wasActive) {
    const thumbTip = getJoint(hand, "thumb-tip");
    const indexTip = getJoint(hand, "index-finger-tip");
    if (!thumbTip || !indexTip) return false;

    thumbTip.getWorldPosition(_vA);
    indexTip.getWorldPosition(_vB);
    const d = _vA.distanceTo(_vB);

    return wasActive ? (d < PINCH_OFF) : (d < PINCH_ON);
  }

  // Lanza un rayo desde el dedo índice hacia el panel.
  function castToPanelFromHand(hand) {
    const indexTip = getJoint(hand, "index-finger-tip");
    if (!indexTip) return null;

    indexTip.getWorldPosition(_vOrigin);

    const indexKnuckle =
      getJoint(hand, "index-finger-phalanx-proximal") ||
      getJoint(hand, "index-finger-metacarpal");

    if (indexKnuckle) {
      indexKnuckle.getWorldPosition(_vA);
      _vDir.copy(_vOrigin).sub(_vA).normalize();
    } else {
      const headQuat = new THREE.Quaternion();
      camera.getWorldQuaternion(headQuat);
      _vDir.set(0, 0, -1).applyQuaternion(headQuat).normalize();
    }

    raycaster.ray.origin.copy(_vOrigin);
    raycaster.ray.direction.copy(_vDir);

    const hits = raycaster.intersectObject(panelMesh, false);
    return hits.length ? hits[0] : null;
  }

  // Hace scroll en el chat con un pellizco de mano.
  function updateHandPinchScroll() {
    if (!renderer.xr.isPresenting) return;
    if (state.scrollMax <= 0) return;

    if (!handScroll.active) {
      const hands = [hand0, hand1];
      for (const h of hands) {
        if (!isPinching(h, false)) continue;

        const hit = castToPanelFromHand(h);
        if (!hit) continue;

        const p = uvToCanvas(hit, panelCanvas);
        if (!p) continue;
        if (!inRect(p, HIT_ZONES.chat)) continue;

        handScroll.active = true;
        handScroll.hand = h;
        handScroll.lastY = p.y;
        handScroll.dySmoothed = 0;
        return;
      }
      return;
    }

    const h = handScroll.hand;
    if (!h) { handScroll.active = false; handScroll.dySmoothed = 0; return; }

    if (!isPinching(h, true)) {
      handScroll.active = false;
      handScroll.hand = null;
      handScroll.dySmoothed = 0;
      return;
    }

    const hit = castToPanelFromHand(h);
    if (!hit) return;

    const p = uvToCanvas(hit, panelCanvas);
    if (!p) return;
    if (!inRect(p, HIT_ZONES.chat)) return;

    const dy = (p.y - handScroll.lastY) / panelCanvas.height;
    handScroll.lastY = p.y;

    handScroll.dySmoothed = handScroll.dySmoothed * 0.75 + dy * 0.25;

    const speed = 20;
    state.scrollVel += handScroll.dySmoothed * speed;
    state.scrollVel = THREE.MathUtils.clamp(state.scrollVel, -55, 55);

    drawPanel();
  }

  // Actualiza todos los controles de VR cada frame.
  function tickXR() {
    if (dragVR.active) updateDragVR();
    if (scrollVR.active) updateScrollVR();
    updateHandPinchScroll();
    updateReticles();
  }

  // Actualiza la posición y color de las retículas de los mandos.
  function updateReticles(){
    [controller0, controller1].forEach((c) => {
      const reticle = c.userData.missionReticle;
      if (!reticle) return;
      const hit = castToPanelFromController(c);
      if (hit) {
        reticle.position.z = -Math.min(hit.distance, 6);
        const p = uvToCanvas(hit, panelCanvas);
        const clickable = p && (
          inRect(p, HIT_ZONES.exit) || inRect(p, HIT_ZONES.settings) ||
          inRect(p, HIT_ZONES.recenter) || inRect(p, HIT_ZONES.grab) ||
          inRect(p, HIT_ZONES.talk) ||
          (!renderer.xr.isPresenting && (inRect(p, HIT_ZONES.sendBtn) || inRect(p, HIT_ZONES.textInput)))
        );
        reticle.userData.ring.material.color.setHex(clickable ? 0x35ffb0 : 0x2aa9ff);
        const s = clickable ? 1.5 : 1;
        reticle.scale.set(s, s, s);
      } else {
        reticle.position.z = -2.5;
        reticle.userData.ring.material.color.setHex(0x2aa9ff);
        reticle.scale.set(1, 1, 1);
      }
    });
  }

  return { tickXR, hands: { hand0, hand1 }, controllers: { controller0, controller1 } };
}
