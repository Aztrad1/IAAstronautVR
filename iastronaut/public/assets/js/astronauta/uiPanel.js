import {
  HIT_ZONES,
  SETTINGS_ZONES,
  MAX_BUBBLES,
  PANEL_CANVAS_W,
  PANEL_CANVAS_H,
  VOICES,
} from "./config.js";

// Crea el estado inicial del panel de chat.
export function createUIState() {
  return {
    bubbles: [],
    listening: false,
    aiSpeaking: false,
    scrollY: 0,
    scrollMax: 0,
    scrollVel: 0,
    autoScroll: false,
    imgCache: new Map(),
    textInput: "", // texto que el usuario está escribiendo
    textInputFocused: false,
    showSettings: false, // vista de ajustes dibujada en el propio panel (fallback VR)
    expeditionAvailable: false, // true si ya se pueden completar las misiones de nave de este planeta
  };
}

// Borra los mensajes más viejos si hay demasiados.
export function enforceMaxBubbles(state) {
  while (state.bubbles.length > MAX_BUBBLES) state.bubbles.shift();
}

// Agrega un mensaje de texto a la conversación.
export function addBubble(state, drawPanel, text, who) {
  const role = who === "user" ? "user" : "bot";
  state.bubbles.push({ kind: "text", text: String(text || ""), who: role });
  enforceMaxBubbles(state);
  state.autoScroll = true;
  drawPanel();
}

// Agrega un mensaje con imágenes a la conversación.
export function addImagesBubble(state, drawPanel, images) {
  if (!Array.isArray(images) || images.length === 0) return;
  state.bubbles.push({ kind: "images", images: images.slice(0, 6) });
  enforceMaxBubbles(state);
  state.autoScroll = true;
  drawPanel();
}

// Marca si el micrófono está escuchando.
export function setListening(state, drawPanel, v) {
  state.listening = !!v;
  drawPanel();
}

// Marca si el astronauta está respondiendo/hablando.
export function setAISpeaking(state, drawPanel, v) {
  state.aiSpeaking = !!v;
  drawPanel();
}

// Crea el mesh 3D y el canvas donde se dibuja el panel de chat.
export function createPanel({ THREE, scene, camera }) {
  // Canvas 2D
  const panelCanvas = document.createElement("canvas");
  panelCanvas.width = PANEL_CANVAS_W;
  panelCanvas.height = PANEL_CANVAS_H;

  const ctx = panelCanvas.getContext("2d", { alpha: true });

  // Textura Three
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.minFilter = THREE.LinearFilter;
  panelTex.magFilter = THREE.LinearFilter;

  const panelMat = new THREE.MeshBasicMaterial({
    map: panelTex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const panelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.55),
    panelMat,
  );
  panelMesh.renderOrder = 2;

  const uiGroup = new THREE.Group();
  uiGroup.add(panelMesh);
  scene.add(uiGroup);

  return { panelCanvas, ctx, panelTex, panelMesh, uiGroup };
}

// Dibuja un rectángulo con las esquinas redondeadas.
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Parte un texto largo en varias líneas para que entre en un ancho dado.
function wrapText(ctx, text, maxWidth) {
  const words = (text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Carga una imagen y la guarda en caché para no recargarla.
export function getCachedImage(state, url, invalidate) {
  if (!url) return null;
  const existing = state.imgCache.get(url);
  if (existing) return existing;

  const img = new Image();
  img.crossOrigin = "anonymous";
  const rec = { img, loaded: false, failed: false };
  state.imgCache.set(url, rec);

  img.onload = () => {
    rec.loaded = true;
    invalidate();
  };
  img.onerror = () => {
    rec.failed = true;
    invalidate();
  };
  img.src = url;

  return rec;
}

// Dice si el navegador puede grabar audio.
export function canRecord() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

// Arma la función que dibuja todo el panel de chat sobre el canvas.
export function drawPanelFactory({ THREE, panelCanvas, ctx, panelTex, state, isVR }) {
  const inVR = () => (typeof isVR === "function" ? !!isVR() : false);

  /* Paleta fija — diseño oscuro espacial */
  const C = {
    panelBg:      'rgba(6,10,20,0.96)',
    panelBorder:  'rgba(0,200,255,0.25)',
    headerBg:     '#050d1a',
    headerLine:   'rgba(0,200,255,0.35)',
    title:        '#00e5ff',
    titleSub:     'rgba(0,200,255,0.5)',
    bubbleBot:    'rgba(0,30,50,0.9)',
    bubbleBotTxt: 'rgba(220,240,255,0.92)',
    bubbleUser:   'rgba(0,80,150,0.85)',
    bubbleUserTxt:'#ffffff',
    scrollThumb:  'rgba(0,200,255,0.4)',
    inputBg:      'rgba(0,20,40,0.9)',
    inputBorder:  'rgba(0,180,255,0.3)',
    inputFocus:   'rgba(0,200,255,0.7)',
    inputText:    'rgba(180,230,255,0.9)',
    inputPH:      'rgba(0,150,200,0.45)',
    sendBg:       'rgba(0,100,180,0.85)',
    sendBgDis:    'rgba(0,40,70,0.7)',
    talkBg:       'rgba(0,160,100,0.85)',
    talkRec:      'rgba(180,30,30,0.88)',
    talkSpk:      'rgba(50,50,70,0.85)',
    talkTxt:      '#ffffff',
    btnExit:      'rgba(160,30,30,0.85)',
    btnCenter:    'rgba(0,80,160,0.85)',
    accent:       '#00e5ff',
  };

  return function drawPanel() {
    const W = panelCanvas.width;
    const H = panelCanvas.height;
    ctx.clearRect(0, 0, W, H);

    /* ── Fondo del panel ───────────────────────────────── */
    ctx.save();
    roundRect(ctx, 12, 12, W - 24, H - 24, 28);
    ctx.fillStyle = C.panelBg;
    ctx.fill();
    ctx.strokeStyle = C.panelBorder;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    /* Líneas decorativas de esquinas (estilo HUD) */
    const co = 12, cs = 40, cl = 2.5;
    ctx.save();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = cl;
    ctx.globalAlpha = 0.7;
    // TL
    ctx.beginPath(); ctx.moveTo(co+cs,co); ctx.lineTo(co,co); ctx.lineTo(co,co+cs); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(W-co-cs,co); ctx.lineTo(W-co,co); ctx.lineTo(W-co,co+cs); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(co+cs,H-co); ctx.lineTo(co,H-co); ctx.lineTo(co,H-co-cs); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(W-co-cs,H-co); ctx.lineTo(W-co,H-co); ctx.lineTo(W-co,H-co-cs); ctx.stroke();
    ctx.restore();

    /* ── Header ────────────────────────────────────────── */
    ctx.save();
    roundRect(ctx, 12, 12, W - 24, 126, 28);
    ctx.fillStyle = C.headerBg;
    ctx.fill();
    ctx.restore();

    // Línea separadora header
    ctx.save();
    ctx.strokeStyle = C.headerLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(48, 138); ctx.lineTo(W - 48, 138); ctx.stroke();
    ctx.restore();

    // Título
    const planetName = window.ASTRO_CONFIG?.selectedPlanet?.name || '';
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '700 42px system-ui,Arial';
    ctx.fillStyle = C.title;
    ctx.fillText('IASTRONAUT', 320, 58);
    ctx.font = '400 24px system-ui,Arial';
    ctx.fillStyle = C.titleSub;
    ctx.fillText(planetName ? '· MISIÓN: ' + planetName.toUpperCase() : '· CANAL DE MISIÓN XR', 320, 96);
    ctx.restore();

    // Botón SALIR
    ctx.save();
    ctx.fillStyle = C.btnExit;
    roundRect(ctx, HIT_ZONES.exit.x, HIT_ZONES.exit.y, HIT_ZONES.exit.w, HIT_ZONES.exit.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,80,0.5)'; ctx.lineWidth = 1.5;
    roundRect(ctx, HIT_ZONES.exit.x, HIT_ZONES.exit.y, HIT_ZONES.exit.w, HIT_ZONES.exit.h, 14);
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 28px system-ui,Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('✕  SALIR', HIT_ZONES.exit.x + 22, HIT_ZONES.exit.y + HIT_ZONES.exit.h / 2);
    ctx.restore();

    // Botón AJUSTES (tuerca) — pegado a la izquierda de RECALIBRAR
    ctx.save();
    ctx.fillStyle = 'rgba(0,200,255,0.10)';
    roundRect(ctx, HIT_ZONES.settings.x, HIT_ZONES.settings.y, HIT_ZONES.settings.w, HIT_ZONES.settings.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,200,255,0.45)'; ctx.lineWidth = 1.5;
    roundRect(ctx, HIT_ZONES.settings.x, HIT_ZONES.settings.y, HIT_ZONES.settings.w, HIT_ZONES.settings.h, 14);
    ctx.stroke();
    ctx.fillStyle = '#7fe8ff'; ctx.font = '32px system-ui,Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('⚙', HIT_ZONES.settings.x + HIT_ZONES.settings.w/2, HIT_ZONES.settings.y + HIT_ZONES.settings.h/2 + 1);
    ctx.textAlign='start';
    ctx.restore();

    // Botón CENTRAR
    ctx.save();
    ctx.fillStyle = C.btnCenter;
    roundRect(ctx, HIT_ZONES.recenter.x, HIT_ZONES.recenter.y, HIT_ZONES.recenter.w, HIT_ZONES.recenter.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,150,255,0.5)'; ctx.lineWidth = 1.5;
    roundRect(ctx, HIT_ZONES.recenter.x, HIT_ZONES.recenter.y, HIT_ZONES.recenter.w, HIT_ZONES.recenter.h, 14);
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 28px system-ui,Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('⊕  RECALIBRAR', HIT_ZONES.recenter.x + 22, HIT_ZONES.recenter.y + HIT_ZONES.recenter.h / 2);
    ctx.restore();

    // Handle MOVER
    ctx.save();
    ctx.fillStyle = 'rgba(0,200,255,0.08)';
    roundRect(ctx, HIT_ZONES.grab.x, HIT_ZONES.grab.y, HIT_ZONES.grab.w, HIT_ZONES.grab.h, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,200,255,0.35)'; ctx.lineWidth = 1.5;
    roundRect(ctx, HIT_ZONES.grab.x, HIT_ZONES.grab.y, HIT_ZONES.grab.w, HIT_ZONES.grab.h, 16);
    ctx.stroke();
    const gx = HIT_ZONES.grab.x + HIT_ZONES.grab.w / 2;
    const gy = HIT_ZONES.grab.y + HIT_ZONES.grab.h / 2;
    ctx.strokeStyle = 'rgba(0,200,255,0.8)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gx, gy-20); ctx.lineTo(gx, gy+20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx-20, gy); ctx.lineTo(gx+20, gy); ctx.stroke();
    // Flechitas
    // Dibuja una flechita.
    function arrow(ax,ay,dx,dy){ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax+dx,ay+dy);ctx.lineTo(ax-dy*0.5+dx,ay+dx*0.5+dy);ctx.moveTo(ax+dx,ay+dy);ctx.lineTo(ax+dy*0.5+dx,ay-dx*0.5+dy);ctx.stroke();}
    arrow(gx,gy-10,0,-12); arrow(gx,gy+10,0,12); arrow(gx-10,gy,-12,0); arrow(gx+10,gy,12,0);
    ctx.restore();

    /* ── Vista de AJUSTES (dibujada en el panel — funciona en VR sin dom-overlay) ── */
    if (state.showSettings) {
      const cfg = window.ASTRO_CONFIG || {};
      ctx.save();
      ctx.fillStyle = '#7fe8ff'; ctx.font = '700 40px system-ui,Arial'; ctx.textBaseline = 'top';
      ctx.fillText('⚙ AJUSTES', 48, 168);
      ctx.restore();

      // Dibuja un botón redondeado tipo "pastilla".
      function pillBtn(zone, label, active, sub){
        ctx.save();
        ctx.fillStyle = active ? 'rgba(0,180,255,0.35)' : 'rgba(0,40,70,0.75)';
        roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 16); ctx.fill();
        ctx.strokeStyle = active ? 'rgba(0,220,255,0.9)' : 'rgba(0,150,200,0.35)';
        ctx.lineWidth = active ? 2.5 : 1.5;
        roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 16); ctx.stroke();
        ctx.fillStyle = active ? '#eafcff' : 'rgba(180,220,255,0.75)';
        ctx.font = '700 30px system-ui,Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(label, zone.x+zone.w/2, zone.y+zone.h/2 + (sub?-14:0));
        if(sub){ ctx.font='400 20px system-ui,Arial'; ctx.fillText(sub, zone.x+zone.w/2, zone.y+zone.h/2+20); }
        ctx.textAlign='start';
        ctx.restore();
      }

      ctx.save(); ctx.fillStyle='rgba(150,210,255,0.8)'; ctx.font='600 26px system-ui,Arial'; ctx.textBaseline='alphabetic';
      ctx.fillText('IDIOMA DE LA ASTRONAUTA', 48, 232); ctx.restore();
      pillBtn(SETTINGS_ZONES.langEs, '🇪🇸 ESPAÑOL', (cfg.lang||'es')==='es');
      pillBtn(SETTINGS_ZONES.langEn, '🇬🇧 ENGLISH', cfg.lang==='en');

      ctx.save(); ctx.fillStyle='rgba(150,210,255,0.8)'; ctx.font='600 26px system-ui,Arial';
      ctx.fillText('EFECTOS DE SONIDO', 48, 392); ctx.restore();
      pillBtn(SETTINGS_ZONES.sfxOn,  'ACTIVADOS', cfg.sfx!==false);
      pillBtn(SETTINGS_ZONES.sfxOff, 'DESACTIVADOS', cfg.sfx===false);

      ctx.save(); ctx.fillStyle='rgba(150,210,255,0.8)'; ctx.font='600 26px system-ui,Arial';
      ctx.fillText('VOZ DE LA ASTRONAUTA', 48, 552); ctx.restore();
      {
        const cur = VOICES.find(v => v.id === cfg.voice) || VOICES[0];
        pillBtn(SETTINGS_ZONES.voice, '🎙️ ' + cur.label, true, 'Toca para cambiar de voz');
      }

      const nb = SETTINGS_ZONES.back;
      ctx.save();
      ctx.fillStyle = 'rgba(0,100,180,0.85)';
      roundRect(ctx, nb.x, nb.y, nb.w, nb.h, 22); ctx.fill();
      ctx.strokeStyle='rgba(0,150,255,0.5)'; ctx.lineWidth=1.5;
      roundRect(ctx, nb.x, nb.y, nb.w, nb.h, 22); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.font='800 34px system-ui,Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('← VOLVER AL CHAT', nb.x+nb.w/2, nb.y+nb.h/2);
      ctx.textAlign='start';
      ctx.restore();

      panelTex.needsUpdate = true;
      return;
    }

    /* ── Área de chat ──────────────────────────────────── */
    const aX=HIT_ZONES.chat.x, aY=HIT_ZONES.chat.y;
    const aW=HIT_ZONES.chat.w, aH=HIT_ZONES.chat.h;

    ctx.save();
    ctx.beginPath(); ctx.rect(aX, aY, aW, aH); ctx.clip();

    const padX=18, padY=14, maxW=Math.floor(aW*0.84);
    const lineH=44, gap=14;
    const imgCols=2, imgGap=14;
    const imgCardW=Math.floor((maxW-imgGap)/2);
    const imgCardH=210, imgMetaH=40, imgBlockPad=12;

    ctx.font = '36px system-ui,Arial';
    ctx.textBaseline = 'top';

    let contentH = 0;
    for (const b of state.bubbles) {
      if (b.kind === 'images') {
        const rows = Math.ceil((b.images||[]).length / imgCols) || 1;
        contentH += imgBlockPad*2 + rows*(imgCardH+imgMetaH) + (rows-1)*imgGap + gap;
      } else {
        const lines = wrapText(ctx, b.text, maxW - padX*2);
        contentH += lines.length*lineH + padY*2 + gap;
      }
    }

    const visH = aH - 20;
    state.scrollMax = Math.max(0, contentH - visH);
    if (state.autoScroll) { state.scrollY = state.scrollMax; state.autoScroll = false; state.scrollVel = 0; }
    else { state.scrollY = THREE.MathUtils.clamp(state.scrollY, 0, state.scrollMax); }

    let y = aY + 10 - state.scrollY;

    for (const b of state.bubbles) {
      if (b.kind === 'images') {
        const count = (b.images||[]).length;
        const rows  = Math.ceil(count/imgCols)||1;
        const blockH = imgBlockPad*2 + rows*(imgCardH+imgMetaH) + (rows-1)*imgGap;
        const blockX = aX+10;
        let ix=blockX+imgBlockPad, iy=y+imgBlockPad;
        for(let i=0;i<count;i++){
          const col=i%imgCols, row=Math.floor(i/imgCols);
          const cX=ix+col*(imgCardW+imgGap), cY=iy+row*(imgCardH+imgMetaH+imgGap);
          ctx.save();
          ctx.fillStyle='rgba(0,20,40,0.8)';
          roundRect(ctx,cX,cY,imgCardW,imgCardH+imgMetaH,12); ctx.fill();
          ctx.strokeStyle='rgba(0,150,200,0.3)'; ctx.lineWidth=1;
          roundRect(ctx,cX,cY,imgCardW,imgCardH+imgMetaH,12); ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.beginPath(); roundRect(ctx,cX+8,cY+8,imgCardW-16,imgCardH-16,10); ctx.clip();
          const item=b.images[i]; const url=item?.url||'';
          const rec=getCachedImage(state,url,()=>drawPanel());
          if(rec&&rec.loaded&&!rec.failed){
            const img=rec.img;
            const tW=imgCardW-16,tH=imgCardH-16;
            const ir=img.width/Math.max(1,img.height),tr=tW/Math.max(1,tH);
            let sx=0,sy=0,sw=img.width,sh=img.height;
            if(ir>tr){sh=img.height;sw=Math.floor(tr*sh);sx=Math.floor((img.width-sw)/2);}
            else{sw=img.width;sh=Math.floor(sw/tr);sy=Math.floor((img.height-sh)/2);}
            ctx.drawImage(img,sx,sy,sw,sh,cX+8,cY+8,tW,tH);
          } else {
            ctx.fillStyle='rgba(0,30,50,0.8)';
            ctx.fillRect(cX+8,cY+8,imgCardW-16,imgCardH-16);
            ctx.fillStyle='rgba(0,200,255,0.5)'; ctx.font='700 22px system-ui,Arial';
            ctx.fillText(rec?.failed?'Sin imagen':'Cargando…',cX+18,cY+20);
          }
          ctx.restore();

          ctx.fillStyle='rgba(0,180,255,0.7)'; ctx.font='700 22px system-ui,Arial';
          ctx.fillText((item?.alt||'Imagen').replace(/^File:/i,'').slice(0,40),cX+10,cY+imgCardH+6);
        }
        y += blockH + gap;
        continue;
      }

      const isUser = b.who === 'user';
      const lines  = wrapText(ctx, b.text, maxW - padX*2);
      const textH  = lines.length * lineH;
      const bubH   = textH + padY*2;
      const bubW   = Math.min(maxW, Math.max(220, ...lines.map(l=>ctx.measureText(l).width+padX*2)));
      const bx     = isUser ? aX+aW-bubW-10 : aX+10;

      // Burbuja
      ctx.save();
      ctx.fillStyle = isUser ? C.bubbleUser : C.bubbleBot;
      roundRect(ctx, bx, y, bubW, bubH, 18); ctx.fill();
      // Borde sutil
      ctx.strokeStyle = isUser ? 'rgba(0,150,255,0.4)' : 'rgba(0,150,200,0.25)';
      ctx.lineWidth = 1;
      roundRect(ctx, bx, y, bubW, bubH, 18); ctx.stroke();
      ctx.restore();

      // Texto
      ctx.fillStyle = isUser ? C.bubbleUserTxt : C.bubbleBotTxt;
      ctx.font = '36px system-ui,Arial'; ctx.textBaseline = 'top';
      let ty = y + padY;
      for(const line of lines){ ctx.fillText(line, bx+padX, ty); ty+=lineH; }

      y += bubH + gap;
    }
    ctx.restore();

    // Banner fijo "expedición disponible" — se pinta encima del principio
    // del chat (no se desplaza con el scroll), solo cuando corresponde.
    if (state.expeditionAvailable) {
      const eb = HIT_ZONES.expedition;
      ctx.save();
      ctx.fillStyle = 'rgba(10,40,24,0.92)';
      roundRect(ctx, eb.x, eb.y, eb.w, eb.h, 12); ctx.fill();
      ctx.strokeStyle = '#52e08a'; ctx.lineWidth = 2;
      roundRect(ctx, eb.x, eb.y, eb.w, eb.h, 12); ctx.stroke();
      ctx.fillStyle = '#c8ffe0'; ctx.font = '700 28px system-ui,Arial'; ctx.textBaseline = 'middle';
      ctx.fillText('🚀  INICIAR EXPEDICIÓN — tocá para mandar un vehículo', eb.x+24, eb.y+eb.h/2);
      ctx.restore();
    }

    // Scrollbar
    if(state.scrollMax>0){
      const bX=aX+aW-8, bY=aY+8, bH=aH-16;
      const tH=Math.max(40,Math.floor(bH*(bH/(bH+state.scrollMax))));
      const tY=bY+(bH-tH)*(state.scrollY/state.scrollMax);
      ctx.save();
      ctx.globalAlpha=0.7;
      ctx.fillStyle='rgba(0,80,100,0.4)';
      roundRect(ctx,bX-4,bY,5,bH,3); ctx.fill();
      ctx.fillStyle=C.scrollThumb;
      roundRect(ctx,bX-4,tY,5,tH,3); ctx.fill();
      ctx.restore();
    }

    /* ── Input de texto ─────────────────────────────────
       En VR se dibuja apagado (sin cursor, con un texto que explica que
       hay que usar el micrófono) — el toque tampoco hace nada ahí, ver
       handleActionFromHit en missionScene.js. */
    const ti = HIT_ZONES.textInput;
    const vrMode = inVR();
    const focused = !vrMode && state.textInputFocused;
    ctx.save();
    ctx.fillStyle = vrMode ? 'rgba(255,255,255,0.03)' : C.inputBg;
    roundRect(ctx, ti.x, ti.y, ti.w, ti.h, 14); ctx.fill();
    ctx.strokeStyle = focused ? C.inputFocus : vrMode ? 'rgba(255,255,255,0.12)' : C.inputBorder;
    ctx.lineWidth = focused ? 2.5 : 1.5;
    roundRect(ctx, ti.x, ti.y, ti.w, ti.h, 14); ctx.stroke();
    const showCursor = focused && Math.floor(Date.now()/500)%2===0;
    const dispText = vrMode ? '' : (state.textInput || '');
    ctx.fillStyle = dispText ? C.inputText : C.inputPH;
    ctx.font = '34px system-ui,Arial'; ctx.textBaseline='middle';
    const placeholder = vrMode ? '🎙️ En VR, usá el micrófono para hablar' : 'Escribe tu pregunta…';
    ctx.fillText((dispText||(focused?'':placeholder))+(showCursor?'|':''), ti.x+20, ti.y+ti.h/2);
    ctx.restore();

    /* ── Botón ENVIAR ─────────────────────────────────── */
    const sb = HIT_ZONES.sendBtn;
    const hasText = !vrMode && (state.textInput||'').trim().length>0;
    ctx.save();
    ctx.fillStyle = hasText ? C.sendBg : C.sendBgDis;
    roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 14); ctx.fill();
    if(hasText){ctx.strokeStyle='rgba(0,150,255,0.5)';ctx.lineWidth=1.5;roundRect(ctx,sb.x,sb.y,sb.w,sb.h,14);ctx.stroke();}
    ctx.fillStyle = vrMode ? 'rgba(255,255,255,0.25)' : '#fff';
    ctx.font='700 30px system-ui,Arial'; ctx.textBaseline='middle';
    ctx.fillText('➤ ENVIAR', sb.x+22, sb.y+sb.h/2);
    ctx.restore();

    /* ── Botón HABLAR / DETENER ────────────────────────── */
    const tb = HIT_ZONES.talk;
    const noMic = !canRecord();
    const talkColor = noMic ? 'rgba(60,60,80,0.85)'
      : state.aiSpeaking ? C.talkSpk
      : state.listening  ? C.talkRec
      : C.talkBg;
    const talkLabel = noMic ? 'MIC NO DISPONIBLE'
      : state.aiSpeaking ? '🔊  TRANSMITIENDO...'
      : state.listening  ? '⏹  DETENER'
      : '🎙  INICIAR TRANSMISIÓN';

    ctx.save();
    ctx.fillStyle = talkColor;
    roundRect(ctx, tb.x, tb.y, tb.w, tb.h, 22); ctx.fill();
    if(!noMic&&!state.aiSpeaking){
      ctx.strokeStyle = state.listening ? 'rgba(255,100,100,0.5)' : 'rgba(0,200,120,0.5)';
      ctx.lineWidth=1.5; roundRect(ctx,tb.x,tb.y,tb.w,tb.h,22); ctx.stroke();
    }
    // Indicador de actividad cuando escucha
    if(state.listening){
      const pulse=0.5+0.5*Math.sin(Date.now()*0.008);
      ctx.fillStyle=`rgba(255,80,80,${pulse*0.6})`;
      ctx.beginPath(); ctx.arc(tb.x+tb.w-52, tb.y+tb.h/2, 12, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle=C.talkTxt; ctx.font='800 40px system-ui,Arial'; ctx.textBaseline='middle';
    ctx.fillText(talkLabel, tb.x+36, tb.y+tb.h/2);
    ctx.restore();

    panelTex.needsUpdate = true;
  };
}
