// Escena principal: la nave con la mesa holográfica, la ventana y la
// cámara del jugador. Crea el renderer, la escena y la sesión WebXR, y
// monta dentro el módulo de la misión (missionScene.js) y el de misiones
// de nave (missionsBoard.js).
import { initMission } from '../astronauta/missionScene.js';
import { initMissionsBoard, isPlanetShipMissionsComplete } from './missionsBoard.js';

(function () {
  'use strict';

  // Muestra un aviso en pantalla si algo falla durante el arranque.
  function showFatalError(err){
    console.error('[lobbyScene] Error fatal durante el arranque:', err);
    if(document.getElementById('lobbyFatalError')) return;
    const box = document.createElement('div');
    box.id = 'lobbyFatalError';
    box.style.cssText = 'position:fixed;left:16px;bottom:16px;right:16px;z-index:99999;'
      +'background:rgba(40,8,8,0.92);color:#ffdada;border:1px solid rgba(255,120,120,0.5);'
      +'border-radius:10px;padding:14px 16px;font:13px/1.4 system-ui,Arial;max-width:640px;';
    box.innerHTML = '<b>No se pudo cargar la escena 3D.</b><br>'
      + 'Probá recargar la página con caché vacía (Ctrl+Shift+R). Si sigue igual, '
      + 'abrí la consola del navegador (F12) y mandá el mensaje de error que aparezca ahí.'
      + '<br><span style="opacity:.75">Detalle: '+String(err && err.message || err)+'</span>';
    document.body.appendChild(box);
  }
  window.addEventListener('error', e => showFatalError(e.error || e.message));
  window.addEventListener('unhandledrejection', e => showFatalError(e.reason));

  const BASE = (window.APP_BASE || '').replace(/\/$/, '');

  // En qué parte de la experiencia está el jugador ahora mismo.
  let appState = 'lobby'; // 'lobby' | 'launching' | 'mission'
  const THREE = window.THREE, VRButton = window.VRButton;
  if (!THREE || !VRButton) { console.error('Three.js no cargó'); return; }

  const PLANETS = [
    { id:'sun',     name:'Sol',      desc:'Nuestra estrella',              fallback:'#ffd060', size:0.34, orbit:0,    speed:0,    spin:0.05, angle:0,   img:BASE+'/assets/img/planets/sun.png',     topic:'El Sol, nuestra estrella y centro del sistema solar',
      diameterKm:1391000, distanceAU:0,     orbitDays:0,     moons:0,   tempC:5500  },
    { id:'mercury', name:'Mercurio', desc:'El más cercano al Sol',         fallback:'#b5b5b5', size:0.08, orbit:0.55, speed:0.28, spin:0.6,  angle:0.8, img:BASE+'/assets/img/planets/mercury.png', topic:'Mercurio, el planeta más pequeño y cercano al Sol',
      diameterKm:4879,    distanceAU:0.39,  orbitDays:88,    moons:0,   tempC:167   },
    { id:'venus',   name:'Venus',    desc:'El planeta más caliente',       fallback:'#e8cda0', size:0.11, orbit:0.72, speed:0.20, spin:0.35, angle:2.1, img:BASE+'/assets/img/planets/venus.png',   topic:'Venus, el planeta más caliente del sistema solar',
      diameterKm:12104,   distanceAU:0.72,  orbitDays:225,   moons:0,   tempC:464   },
    { id:'earth',   name:'Tierra',   desc:'Nuestro hogar en el cosmos',    fallback:'#4a9fd4', size:0.12, orbit:0.90, speed:0.15, spin:0.9,  angle:0.0, img:BASE+'/assets/img/planets/earth.png',   topic:'La Tierra, nuestro planeta y el único con vida conocida',
      diameterKm:12742,   distanceAU:1.00,  orbitDays:365,   moons:1,   tempC:15    },
    { id:'mars',    name:'Marte',    desc:'El planeta rojo',               fallback:'#c1440e', size:0.09, orbit:1.06, speed:0.12, spin:0.85, angle:1.2, img:BASE+'/assets/img/planets/mars.png',    topic:'Marte, el planeta rojo y objetivo de futuras misiones',
      diameterKm:6779,    distanceAU:1.52,  orbitDays:687,   moons:2,   tempC:-65   },
    { id:'jupiter', name:'Júpiter',  desc:'El gigante gaseoso más grande', fallback:'#c88b3a', size:0.24, orbit:1.24, speed:0.08, spin:1.3,  angle:3.5, img:BASE+'/assets/img/planets/jupiter.png', topic:'Júpiter, el planeta más grande del sistema solar',
      diameterKm:139820,  distanceAU:5.20,  orbitDays:4333,  moons:95,  tempC:-110  },
    { id:'saturn',  name:'Saturno',  desc:'El señor de los anillos',       fallback:'#e4d191', size:0.20, orbit:1.42, speed:0.06, spin:1.1,  angle:5.0, img:BASE+'/assets/img/planets/saturn.png',  topic:'Saturno, el planeta con los anillos más espectaculares',
      diameterKm:116460,  distanceAU:9.58,  orbitDays:10759, moons:146, tempC:-140  },
    { id:'uranus',  name:'Urano',    desc:'El gigante de hielo inclinado', fallback:'#7de8e8', size:0.15, orbit:1.58, speed:0.045,spin:0.75, angle:1.8, img:BASE+'/assets/img/planets/uranus.png',  topic:'Urano, el gigante de hielo con eje inclinado 98°',
      diameterKm:50724,   distanceAU:19.18, orbitDays:30687, moons:28,  tempC:-195  },
    { id:'neptune', name:'Neptuno',  desc:'Los vientos más veloces',       fallback:'#4b70dd', size:0.14, orbit:1.72, speed:0.035,spin:0.8,  angle:4.2, img:BASE+'/assets/img/planets/neptune.png', topic:'Neptuno, el planeta más lejano y ventoso del sistema solar',
      diameterKm:49244,   distanceAU:30.07, orbitDays:60190, moons:16,  tempC:-200  },
  ];

  /* ── Renderer ─────────────────────────────────────────── */
  const canvas = document.getElementById('lobbyCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  let _clickAudioCtx = null;
  // Reproduce el sonido de click al presionar un botón o planeta.
  function playClickSound(){
    try {
      _clickAudioCtx = _clickAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if(_clickAudioCtx.state==='suspended') _clickAudioCtx.resume();
      const ctx = _clickAudioCtx, t0 = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(880,t0);
      osc.frequency.exponentialRampToValueAtTime(440,t0+0.07);
      gain.gain.setValueAtTime(0.0001,t0);
      gain.gain.exponentialRampToValueAtTime(0.18,t0+0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001,t0+0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0); osc.stop(t0+0.1);
    } catch(_) { /* WebAudio no disponible: se ignora silenciosamente */ }
  }

  const scene = new THREE.Scene();

  /* ── Cámara ───────────────────────────────────────────── */
  // A: viendo la mesa holográfica desde atrás
  // B: en la ventana viendo el planeta
  const CAM_A     = new THREE.Vector3(0, 1.65, 2.6);
  const LOOK_A    = new THREE.Vector3(0, 1.35, 0);
  const CAM_B     = new THREE.Vector3(0, 2.05, -8.9);
  const LOOK_B    = new THREE.Vector3(0, 2.2, -20);
  // Punto de acercamiento al panel de misiones (pared izquierda).
  const CAM_LEFT  = new THREE.Vector3(-2.3, 1.7, 0.5);
  const LOOK_LEFT = new THREE.Vector3(-5.3, 1.85, 0.5);
  // C: afuera de la nave — punto donde vive la misión (astronauta + chat).
  // Coincide con el origen que ya asumía threeScene.js/missionScene.js
  // (cámara en ~1.6m de altura, mirando hacia -Z), así los sprites del
  // entorno de cada planeta quedan centrados alrededor del jugador.
  const CAM_C     = new THREE.Vector3(0, 1.6, 0);
  const LOOK_C    = new THREE.Vector3(0, 1.6, -1);
  const camera    = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 1000);
  camera.position.copy(CAM_A);

  // Rig (dolly) — patrón oficial de three.js para reposicionar al jugador en XR.
  // En escritorio el rig se queda en el origen y camera.position se maneja igual que siempre.
  // En XR, camera pasa a (0,0,0) local y es el RIG el que se coloca frente a la mesa;
  // así el visor compone su propio tracking sobre esa base sin pelear con nuestro código
  // y los controles/manos (hijos del mismo rig) quedan siempre correctamente alineados
  // con la vista — esto es lo que corrige "aparezco dentro de la mesa" y cursores sueltos.
  const cameraRig = new THREE.Group();
  scene.add(cameraRig);
  cameraRig.add(camera);

  /* ── Luces ────────────────────────────────────────────── */
  // Luz neutra: el casco blanco debe verse BLANCO, no azul pastel
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const hemi = new THREE.HemisphereLight(0xffffff, 0xbcc8dd, 1.5);
  scene.add(hemi);

  const ceilL = new THREE.PointLight(0xf4f8ff, 2.2, 25);
  ceilL.position.set(0, 4.8, 0); scene.add(ceilL);

  const holoL = new THREE.PointLight(0x00ddff, 2.2, 6);
  holoL.position.set(0, 2.2, 0); scene.add(holoL);

  const redL = new THREE.PointLight(0xff5522, 0.5, 8);
  redL.position.set(-5.5, 1.8, 1); scene.add(redL);

  const grnL = new THREE.PointLight(0x00ff99, 0.35, 7);
  grnL.position.set(5.5, 1.5, 1); scene.add(grnL);

  const winL = new THREE.PointLight(0x3366dd, 1.2, 16);
  winL.position.set(0, 2.5, -7); scene.add(winL);

  const texLoader = new THREE.TextureLoader();

  // Crea un material estándar de three.js con los parámetros más usados.
  function mkMat(col,em=0,ei=0,mt=0.5,rg=0.6){
    return new THREE.MeshStandardMaterial({color:col,emissive:em,emissiveIntensity:ei,metalness:mt,roughness:rg});
  }
  // Crea una caja 3D ya posicionada.
  function bx(w,h,d,mat,x=0,y=0,z=0){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z); return m;
  }
  // Crea un cilindro 3D ya posicionado.
  function cy(rt,rb,h,s,mat,x=0,y=0,z=0){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s),mat);
    m.position.set(x,y,z); return m;
  }

  /* ════════════════════════════════════════
     TEXTURAS PROCEDURALES DEL CASCO
     (panelería + livrea geométrica azul pintada en la pared)
  ════════════════════════════════════════ */
  // Crea una textura a partir de un dibujo en canvas 2D.
  function canvasTex(w,h,draw,repX=1,repY=1){
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    draw(c.getContext('2d'),w,h);
    const t=new THREE.CanvasTexture(c);
    t.colorSpace=THREE.SRGBColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(repX,repY);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  // Dibuja el patrón de placas metálicas del casco de la nave.
  function drawHullPanels(g,w,h){
    g.fillStyle='#f4f6f9'; g.fillRect(0,0,w,h);
    const cols=4, rows=3, pw=w/cols, ph=h/rows;
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
      const x=i*pw, y=j*ph;
      // placa con leve gradiente para dar volumen
      const gr=g.createLinearGradient(x,y,x+pw,y+ph);
      gr.addColorStop(0,'#f7f9fc'); gr.addColorStop(0.5,'#eef1f6'); gr.addColorStop(1,'#e4e9f0');
      g.fillStyle=gr;
      g.fillRect(x+3,y+3,pw-6,ph-6);
      // junta oscura
      g.strokeStyle='rgba(90,105,130,0.55)'; g.lineWidth=2;
      g.strokeRect(x+3,y+3,pw-6,ph-6);
      // línea de luz interior (bisel)
      g.strokeStyle='rgba(255,255,255,0.8)'; g.lineWidth=1;
      g.strokeRect(x+6,y+6,pw-12,ph-12);
      // remaches en esquinas
      g.fillStyle='rgba(120,135,160,0.7)';
      for(const[rx,ry] of [[x+12,y+12],[x+pw-12,y+12],[x+12,y+ph-12],[x+pw-12,y+ph-12]]){
        g.beginPath(); g.arc(rx,ry,3,0,Math.PI*2); g.fill();
      }
      // rejilla de ventilación aleatoria en algunas placas
      if((i+j)%3===0){
        g.fillStyle='rgba(100,115,140,0.35)';
        for(let k=0;k<5;k++) g.fillRect(x+pw*0.3, y+ph*0.35+k*6, pw*0.4, 2.4);
      }
    }
  }

  // Dibuja la pintura decorativa (bandas y chevrones) sobre el casco.
  function drawLivery(g,w,h){
    drawHullPanels(g,w,h);
    // Banda azul principal (franja diagonal recortada, estilo racing spacecraft)
    g.save();
    g.beginPath();
    g.moveTo(0,h*0.58); g.lineTo(w,h*0.42); g.lineTo(w,h*0.62); g.lineTo(0,h*0.78);
    g.closePath();
    const bg=g.createLinearGradient(0,0,w,0);
    bg.addColorStop(0,'#0d3fa0'); bg.addColorStop(0.5,'#1256cc'); bg.addColorStop(1,'#0a2f80');
    g.fillStyle=bg; g.fill();
    // brillo superior de la banda
    g.beginPath();
    g.moveTo(0,h*0.58); g.lineTo(w,h*0.42); g.lineTo(w,h*0.455); g.lineTo(0,h*0.615);
    g.closePath();
    g.fillStyle='rgba(120,190,255,0.55)'; g.fill();
    g.restore();
    // Línea cian de acento paralela
    g.save();
    g.beginPath();
    g.moveTo(0,h*0.82); g.lineTo(w,h*0.66); g.lineTo(w,h*0.685); g.lineTo(0,h*0.845);
    g.closePath();
    g.fillStyle='#26c6ff'; g.fill();
    g.restore();
    // Chevrones azul claro sobre la parte alta del casco
    g.fillStyle='rgba(42,140,235,0.9)';
    const n=5;
    for(let i=0;i<n;i++){
      const cx=w*(0.1+i*0.2), cy=h*0.18, s=w*0.045;
      g.beginPath();
      g.moveTo(cx-s,cy+s*0.8); g.lineTo(cx,cy-s*0.5); g.lineTo(cx+s,cy+s*0.8);
      g.lineTo(cx+s*0.55,cy+s*0.8); g.lineTo(cx,cy+s*0.05); g.lineTo(cx-s*0.55,cy+s*0.8);
      g.closePath(); g.fill();
    }
    // Hexágonos técnicos tenues
    g.strokeStyle='rgba(60,110,190,0.28)'; g.lineWidth=2;
    for(let i=0;i<6;i++){
      const cx=w*(0.08+i*0.17), cy=h*0.93, r=w*0.022;
      g.beginPath();
      for(let k=0;k<=6;k++){
        const a=k/6*Math.PI*2+Math.PI/6;
        const px=cx+Math.cos(a)*r, py=cy+Math.sin(a)*r;
        k===0?g.moveTo(px,py):g.lineTo(px,py);
      }
      g.stroke();
    }
  }

  // Dibuja la textura del piso de la nave.
  function drawFloor(g,w,h){
    g.fillStyle='#e9edf4'; g.fillRect(0,0,w,h);
    const n=4, s=w/n;
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      const x=i*s,y=j*s;
      const gr=g.createLinearGradient(x,y,x+s,y+s);
      gr.addColorStop(0,'#eef2f8'); gr.addColorStop(1,'#dde3ec');
      g.fillStyle=gr; g.fillRect(x+2,y+2,s-4,s-4);
      g.strokeStyle='rgba(95,110,135,0.5)'; g.lineWidth=2.5;
      g.strokeRect(x+2,y+2,s-4,s-4);
    }
    // Marcas de zona (esquinas azules tipo hangar)
    g.strokeStyle='rgba(20,90,200,0.65)'; g.lineWidth=5;
    const m=w*0.06, L=w*0.1;
    for(const[cx,cy,dx,dy] of [[m,m,1,1],[w-m,m,-1,1],[m,h-m,1,-1],[w-m,h-m,-1,-1]]){
      g.beginPath(); g.moveTo(cx+dx*L,cy); g.lineTo(cx,cy); g.lineTo(cx,cy+dy*L); g.stroke();
    }
  }

  const wallTexL = canvasTex(2048,1024,drawLivery,2,1);
  const wallTexR = canvasTex(2048,1024,drawLivery,2,1);
  const hullTex  = canvasTex(2048,1024,drawHullPanels,2,1);
  const ceilTex  = canvasTex(2048,1024,drawHullPanels,3,2);
  const floorTex = canvasTex(2048,2048,drawFloor,4,4);

  /* ════════════════════════════════════════
     NAVE ESPACIAL
  ════════════════════════════════════════ */
  const ship = new THREE.Group();

  // SUELO blanco panelado
  const floorMat = new THREE.MeshStandardMaterial({map:floorTex,metalness:0.15,roughness:0.45});
  ship.add(bx(22,0.12,20,floorMat,0,0,0));

  // TECHO blanco panelado
  const ceilMat = new THREE.MeshStandardMaterial({map:ceilTex,metalness:0.15,roughness:0.5});
  ship.add(bx(22,0.15,20,ceilMat,0,5.2,0));

  // Paneles de luz en techo
  for(let z=-6; z<=6; z+=4){
    ship.add(bx(6.5,0.04,0.5,new THREE.MeshStandardMaterial({
      color:0xffffff, emissive:0xcfe2ff, emissiveIntensity:1.6, roughness:1
    }),0,5.08,z));
  }

  // PAREDES LATERALES - casco blanco con livrea azul pintada (textura)
  const wallMatL = new THREE.MeshStandardMaterial({map:wallTexL,metalness:0.2,roughness:0.4});
  const wallMatR = new THREE.MeshStandardMaterial({map:wallTexR,metalness:0.2,roughness:0.4});
  ship.add(bx(0.25,5.2,20,wallMatL,-11,2.6,0));
  ship.add(bx(0.25,5.2,20,wallMatR, 11,2.6,0));

  // Franjas de luz en paredes
  for(let z=-7; z<=7; z+=3.5){
    const stripMat = new THREE.MeshStandardMaterial({color:0x123a80,emissive:0x2aa9ff,emissiveIntensity:1.3});
    ship.add(bx(0.08,2.5,0.12,stripMat,-10.8,1.8,z));
    ship.add(bx(0.08,2.5,0.12,stripMat, 10.8,1.8,z));
  }

  // PARED TRASERA con panelería
  ship.add(bx(22,5.2,0.25,new THREE.MeshStandardMaterial({map:hullTex,metalness:0.18,roughness:0.45}),0,2.6,9.9));

  // PARED FRONTAL con ventana — abertura grande, marco delgado
  const frontMat = new THREE.MeshStandardMaterial({map:hullTex,metalness:0.2,roughness:0.4});
  // Lados angostos: la ventana ocupa casi todo el ancho
  ship.add(bx(2.6,5.2,0.3,frontMat,-9.7,2.6,-9.9));
  ship.add(bx(2.6,5.2,0.3,frontMat, 9.7,2.6,-9.9));
  // Arriba e inferior, muy delgados: la ventana se ve casi completa
  ship.add(bx(17,0.2,0.3,frontMat,0,5.06,-9.9));
  ship.add(bx(17,0.16,0.3,frontMat,0,0.12,-9.9));

  // Marco de ventana, línea fina en cian
  const frameMat = new THREE.MeshStandardMaterial({
    color:0x0a2a3a, emissive:0x00aadd, emissiveIntensity:0.55, metalness:1, roughness:0.08
  });
  ship.add(bx(17.2,0.05,0.35,frameMat,0,4.96,-9.83));
  ship.add(bx(17.2,0.05,0.35,frameMat,0,0.20,-9.83));
  ship.add(bx(0.05,4.76,0.35,frameMat,-8.4,2.58,-9.83));
  ship.add(bx(0.05,4.76,0.35,frameMat, 8.4,2.58,-9.83));

  // CONSOLAS LATERALES - blanco panelado con borde azul
  const conMat = new THREE.MeshStandardMaterial({map:hullTex,metalness:0.25,roughness:0.4});
  ship.add(bx(3.2,0.85,4.5,conMat,-7.2,0.95,0.5));
  ship.add(bx(3.2,0.85,4.5,conMat, 7.2,0.95,0.5));
  // Borde azul iluminado en la base de las consolas
  const conEdge = new THREE.MeshStandardMaterial({color:0x1256cc,emissive:0x2a8cff,emissiveIntensity:0.9});
  ship.add(bx(3.3,0.08,4.6,conEdge,-7.2,0.55,0.5));
  ship.add(bx(3.3,0.08,4.6,conEdge, 7.2,0.55,0.5));

  // Pantallas decorativas de la consola derecha.
  for(let i=0;i<4;i++){
    const scrMat2=new THREE.MeshStandardMaterial({color:0x001205,emissive:i%2===0?0x003311:0x002244,emissiveIntensity:1.4});
    ship.add(bx(0.85,0.5,0.04,scrMat2, 8.5,1.55,-0.8+i*1.4));
  }

  // Panel de misiones: letrero en la consola izquierda.
  const missionsBoard = initMissionsBoard({
    THREE,
    onExit: () => closeMissionsBoard(),
    onPlanetCompleted: (planetId) => showExpeditionNotice(planetId),
  });

  // Muestra el aviso de "expedición disponible" al completar un planeta.
  function showExpeditionNotice(planetId){
    if(planetId==='earth') return;
    const p = PLANETS.find(pl=>pl.id===planetId);
    const name = p ? p.name : planetId;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;top:22px;transform:translateX(-50%) translateY(-20px);'
      +'z-index:99998;background:rgba(6,20,14,0.95);color:#eafff2;border:1px solid rgba(82,224,138,0.6);'
      +'border-radius:12px;padding:14px 22px;font:600 15px system-ui,Arial;text-align:center;'
      +'box-shadow:0 10px 30px rgba(0,0,0,0.4);opacity:0;transition:opacity .4s, transform .4s;';
    box.innerHTML = '🚀 ¡Expedición a <b>'+name+'</b> disponible! Mirala por la ventana.';
    document.body.appendChild(box);
    requestAnimationFrame(()=>{ box.style.opacity='1'; box.style.transform='translateX(-50%) translateY(0)'; });
    setTimeout(()=>{
      box.style.opacity='0'; box.style.transform='translateX(-50%) translateY(-20px)';
      setTimeout(()=>box.remove(), 450);
    }, 4200);
  }
  missionsBoard.wallMesh.position.set(-8.4, 2.65, 0.5);
  missionsBoard.wallMesh.rotation.y = Math.PI/2;
  ship.add(missionsBoard.wallMesh);
  missionsBoard.boardMesh.position.set(-5.3, 1.85, 0.5);
  missionsBoard.boardMesh.rotation.y = Math.PI/2;
  missionsBoard.boardMesh.visible = false;
  ship.add(missionsBoard.boardMesh);

  // CONSOLA FRONTAL
  ship.add(bx(8.5,0.8,2.2,conMat,0,0.8,-7.0));
  ship.add(bx(6.5,0.04,1.5,new THREE.MeshStandardMaterial({
    color:0x001a2e,emissive:0x0055cc,emissiveIntensity:1.2
  }),0,1.22,-7.0));

  // Panel de botones — textura plana pegada a la consola
  const btnTex = canvasTex(512,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle='rgba(0,10,20,0.0)'; g.fillRect(0,0,w,h);
    const cols=10;
    for(let i=0;i<cols;i++){
      const x=8+i*(w/cols), y=h/2, r=Math.min(w/cols,h)*0.28;
      const on=Math.random()>0.35;
      const col= on ? (Math.random()>0.5?'#00ffaa':'#2aa9ff') : '#123055';
      g.beginPath(); g.arc(x+r,y,r,0,Math.PI*2);
      g.fillStyle=col; g.shadowColor=col; g.shadowBlur=on?14:0; g.fill();
    }
  },1,1);
  const btnPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2,1.15),
    new THREE.MeshStandardMaterial({map:btnTex,transparent:true,emissive:0x0a1a33,emissiveIntensity:0.4})
  );
  btnPlane.rotation.x=-Math.PI/2; btnPlane.position.set(0,1.205,-6.85); ship.add(btnPlane);

  // PILARES estructurales blancos con banda azul
  const pilMat = new THREE.MeshStandardMaterial({map:hullTex,metalness:0.22,roughness:0.42});
  const pilBand = new THREE.MeshStandardMaterial({color:0x0d3fa0,emissive:0x1256cc,emissiveIntensity:0.5,metalness:0.4,roughness:0.35});
  for(const z of[-8,-3,2,7]){
    ship.add(bx(0.5,5.2,0.5,pilMat,-10.7,2.6,z));
    ship.add(bx(0.5,5.2,0.5,pilMat, 10.7,2.6,z));
    // Banda azul decorativa a media altura
    ship.add(bx(0.56,0.5,0.56,pilBand,-10.7,3.4,z));
    ship.add(bx(0.56,0.5,0.56,pilBand, 10.7,3.4,z));
    // Luz de pillar
    const pl=new THREE.PointLight(0x3388ee,0.3,3.5);
    pl.position.set(-10.7,1.2,z); scene.add(pl);
  }

  // MESA HOLOGRÁFICA - base blanca metálica
  const tabMat = new THREE.MeshStandardMaterial({color:0xdfe6ef,metalness:0.55,roughness:0.3});
  ship.add(cy(1.1,1.4,0.9,32,tabMat,0,0.45,0));
  // Anillo azul decorativo en la base
  ship.add(cy(1.42,1.42,0.1,32,new THREE.MeshStandardMaterial({
    color:0x1256cc,emissive:0x2a8cff,emissiveIntensity:0.8
  }),0,0.1,0));
  const tabTop = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75,1.1,0.06,48),
    new THREE.MeshPhysicalMaterial({color:0x0a2a66,emissive:0x1155ee,emissiveIntensity:0.55,metalness:0.85,roughness:0.06,transparent:true,opacity:0.9})
  );
  tabTop.position.set(0,0.93,0); ship.add(tabTop);

  const tabRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.8,0.05,8,64),
    new THREE.MeshStandardMaterial({color:0x00ccff,emissive:0x00ccff,emissiveIntensity:2.8})
  );
  tabRing.rotation.x=Math.PI/2; tabRing.position.set(0,0.94,0); ship.add(tabRing);

  // Segundo anillo exterior
  const tabRing2 = new THREE.Mesh(
    new THREE.TorusGeometry(2.1,0.025,8,64),
    new THREE.MeshStandardMaterial({color:0x0088cc,emissive:0x0088cc,emissiveIntensity:1.5})
  );
  tabRing2.rotation.x=Math.PI/2; tabRing2.position.set(0,0.94,0); ship.add(tabRing2);

  // SILLAS blancas acolchadas con detalle azul
  const sMat  = new THREE.MeshStandardMaterial({color:0xf5f6f9,metalness:0.05,roughness:0.65});
  const sTrim = new THREE.MeshStandardMaterial({color:0x1256cc,emissive:0x1256cc,emissiveIntensity:0.3,metalness:0.4,roughness:0.4});
  for(const[x,z,ry] of [[-2.8,2.8,0],[2.8,2.8,0],[-2,5,.25],[2,5,-.25]]){
    const c=bx(.75,.45,.75,sMat,x,.5,z); c.rotation.y=ry; ship.add(c);
    const b=bx(.75,.9,.09,sMat,x,1.1,z+.33); b.rotation.y=ry; ship.add(b);
    // Base metálica azul y línea de acento en el respaldo
    const base=cy(.18,.26,.28,16,sTrim,x,.15,z); base.rotation.y=ry; ship.add(base);
    const trim=bx(.77,.08,.1,sTrim,x,1.45,z+.33); trim.rotation.y=ry; ship.add(trim);
  }

  /* ════════════════════════════════════════
     DETALLES EXTRA DEL LOBBY
  ════════════════════════════════════════ */

  // Conductos técnicos a lo largo del techo (como en las referencias industriales)
  const pipeMat = new THREE.MeshStandardMaterial({color:0xc4cddb,metalness:0.75,roughness:0.28});
  const pipeGlow= new THREE.MeshStandardMaterial({color:0x1256cc,emissive:0x2aa9ff,emissiveIntensity:1.1,metalness:0.3,roughness:0.3});
  for(const xOff of [-9.6,9.6]){
    const pipe = cy(0.11,0.11,19.5,16,pipeMat,xOff,4.85,0);
    pipe.rotation.x = Math.PI/2; ship.add(pipe);
    for(let z=-9;z<=9;z+=3){
      const ring = cy(0.15,0.15,0.18,16,pipeGlow,xOff,4.85,z);
      ring.rotation.x = Math.PI/2; ship.add(ring);
    }
  }

  // Refuerzos diagonales (gussets) donde los pilares se unen al techo
  const gussetMat = new THREE.MeshStandardMaterial({color:0xdfe6f2,metalness:0.35,roughness:0.4});
  for(const z of [-8,-3,2,7]){
    for(const side of [-1,1]){
      const g1=bx(0.12,0.7,0.12,gussetMat,side*10.35,4.55,z-0.35); g1.rotation.z=side*0.55; ship.add(g1);
      const g2=bx(0.12,0.7,0.12,gussetMat,side*10.35,4.55,z+0.35); g2.rotation.z=-side*0.55; ship.add(g2);
    }
  }

  // Dibuja las pantallas decorativas de estado de la pared trasera.
  function drawStatusScreen(g,w,h){
    g.fillStyle='#020b18'; g.fillRect(0,0,w,h);
    g.strokeStyle='#123055'; g.lineWidth=4; g.strokeRect(2,2,w-4,h-4);
    g.fillStyle='#2aa9ff'; g.font='bold 26px monospace';
    g.fillText('SISTEMA · NAV', 16, 34);
    g.strokeStyle='rgba(42,169,255,0.55)'; g.lineWidth=2;
    for(let i=0;i<6;i++){
      const bw=(w-40)/6, x=20+i*bw, bh=20+Math.random()*(h-90);
      g.strokeRect(x,h-60-bh,bw-8,bh);
      g.fillStyle='rgba(0,255,170,0.25)'; g.fillRect(x,h-60-bh,bw-8,bh);
    }
    g.strokeStyle='rgba(0,255,170,0.7)'; g.lineWidth=2; g.beginPath();
    for(let x=0;x<=w;x+=8){
      const y=h-30+Math.sin(x*0.09)*10;
      x===0?g.moveTo(x,y):g.lineTo(x,y);
    }
    g.stroke();
  }
  const statusTex = canvasTex(512,256,drawStatusScreen,1,1);
  for(const x of [-4.2,4.2]){
    // Marco del monitor (montado sobre la pared)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.76,1.46,0.06),
      new THREE.MeshStandardMaterial({color:0xe9eef7,metalness:0.3,roughness:0.4}));
    frame.position.set(x,3.15,9.74); ship.add(frame);
    // Pantalla, ligeramente al frente del marco
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.3),
      new THREE.MeshStandardMaterial({map:statusTex,emissive:0x113a66,emissiveIntensity:0.5}));
    scr.position.set(x,3.15,9.70); ship.add(scr);
  }

  // Franjas de piso tipo zona de tránsito (blanco/azul) frente a la consola frontal
  const hazTex = canvasTex(256,64,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle='#1256cc';
    for(let x=-h;x<w;x+=h) { g.beginPath(); g.moveTo(x,h); g.lineTo(x+h*0.5,0); g.lineTo(x+h,0); g.lineTo(x+h*0.5,h); g.closePath(); g.fill(); }
  },1,1);
  const hazMat = new THREE.MeshStandardMaterial({map:hazTex,transparent:true,opacity:0.85,emissive:0x0a2f80,emissiveIntensity:0.3});
  const hazStripe = new THREE.Mesh(new THREE.PlaneGeometry(3.2,0.28), hazMat);
  hazStripe.rotation.x=-Math.PI/2; hazStripe.position.set(0,0.065,-5.3); ship.add(hazStripe);

  // ESPEJO — panel reflectante real en la pared trasera para que el usuario se vea
  if (window.Reflector){
    const mirror = new window.Reflector(new THREE.PlaneGeometry(2.1,3.1), {
      clipBias: 0.003,
      textureWidth: Math.floor(window.innerWidth*Math.min(window.devicePixelRatio,1.5)),
      textureHeight: Math.floor(window.innerHeight*Math.min(window.devicePixelRatio,1.5)),
      color: 0x9fb0cc
    });
    mirror.rotation.y = Math.PI; // encarar hacia el interior de la nave (-Z)
    mirror.position.set(-9.2, 2.15, 9.6);
    ship.add(mirror);
    // Marco del espejo
    const mFrame = new THREE.Mesh(new THREE.BoxGeometry(2.3,3.3,0.08),
      new THREE.MeshStandardMaterial({color:0xe9eef7,metalness:0.4,roughness:0.35}));
    mFrame.position.set(-9.2,2.15,9.66); ship.add(mFrame);
    const mTrim = new THREE.Mesh(new THREE.BoxGeometry(2.34,0.1,0.1),
      new THREE.MeshStandardMaterial({color:0x1256cc,emissive:0x2aa9ff,emissiveIntensity:0.9}));
    mTrim.position.set(-9.2,3.68,9.63); ship.add(mTrim);
  }

  scene.add(ship);


  /* ════════════════════════════════════════
     ESPACIO EXTERIOR (visible a través de ventana)
  ════════════════════════════════════════ */
  const spGeo = new THREE.SphereGeometry(450,64,32);
  spGeo.scale(-1,1,1);
  // Cielo del lobby: un color sólido oscuro, sin textura — simple y liviano.
  const spMat = new THREE.MeshBasicMaterial({color:0x020510});
  const lobbySkyMesh = new THREE.Mesh(spGeo,spMat);
  scene.add(lobbySkyMesh);

  // Estrellas
  const sv=[];
  for(let i=0;i<5000;i++){
    const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=380+Math.random()*60;
    sv.push(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph),r*Math.sin(ph)*Math.sin(th));
  }
  const sGeo=new THREE.BufferGeometry();
  sGeo.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));
  const lobbyStars = new THREE.Points(sGeo,new THREE.PointsMaterial({color:0xffffff,size:0.7,sizeAttenuation:true}));
  scene.add(lobbyStars);

  /* ════════════════════════════════════════
     SALTO INTERESPACIAL 3D — visible a través de la ventana
     ────────────────────────────────────────
     Líneas de velocidad, objetos reales de la escena three.js, que vuelan
     hacia el jugador en el espacio detrás de la ventana. Al ser geometría
     3D (no un overlay 2D del DOM), se ve igual en escritorio y en VR.
  ════════════════════════════════════════ */
  const WARP_N = 260;
  const warpGeo = new THREE.BufferGeometry();
  const warpPos = new Float32Array(WARP_N*2*3);
  warpGeo.setAttribute('position', new THREE.BufferAttribute(warpPos, 3));
  const warpMat = new THREE.LineBasicMaterial({
    color:0x9fdcff, transparent:true, opacity:0,
    blending:THREE.AdditiveBlending, depthWrite:false,
  });
  const warpLines = new THREE.LineSegments(warpGeo, warpMat);
  warpLines.visible = false;
  warpLines.renderOrder = 5;
  scene.add(warpLines);

  const warpData = [];
  for(let i=0;i<WARP_N;i++){
    const ang = Math.random()*Math.PI*2;
    const rad = 0.4 + Math.random()*7.5;
    warpData.push({
      ang, rad,
      z: -18 - Math.random()*70,
      speed: 22 + Math.random()*45,
      len: 2 + Math.random()*7,
    });
  }

  let warpActive = false, warpT = 0;
  const WARP_DUR = 2.8; // segundos — mismo largo que el salto anterior
  let warpOnDone = null;

  // Arranca la animación de salto interespacial.
  function startWarp3D(onDone){
    warpT = 0;
    warpActive = true;
    warpOnDone = onDone || null;
    warpLines.visible = true;
    warpMat.opacity = 0;
    warpData.forEach(d=>{ d.z = -18 - Math.random()*70; });
  }

  // Actualiza la animación de salto interespacial cada frame.
  function warpTick3D(dt){
    if(!warpActive) return;
    warpT += dt;
    const p = Math.min(warpT/WARP_DUR, 1);
    // Aparece rápido, se sostiene, y se desvanece al final
    const ease = p<0.3 ? p/0.3 : (p>0.85 ? Math.max(0,(1-p)/0.15) : 1);
    warpMat.opacity = 0.9*ease;

    for(let i=0;i<WARP_N;i++){
      const d = warpData[i];
      d.z += d.speed*dt*(0.35 + p*1.6); // acelera con el progreso
      if(d.z > -11.5){ d.z = -60 - Math.random()*40; } // respawn lejos
      const x = Math.cos(d.ang)*d.rad;
      const y = 2.2 + Math.sin(d.ang)*d.rad; // centrado a la altura de la ventana
      const stretch = d.len*(0.5 + p*2.2);
      const j = i*6;
      warpPos[j]=x;   warpPos[j+1]=y; warpPos[j+2]=d.z;
      warpPos[j+3]=x; warpPos[j+4]=y; warpPos[j+5]=d.z - stretch;
    }
    warpGeo.attributes.position.needsUpdate = true;

    if(p>=1){
      warpActive = false;
      warpLines.visible = false;
      const cb = warpOnDone; warpOnDone = null;
      if(cb){
        // Un error acá no debe dejar appState trabado en 'launching' para
        // siempre — se registra y se vuelve a un estado seguro.
        try { cb(); }
        catch(err){
          console.error('[lobbyScene] Error al completar la transición:', err);
          appState = 'lobby';
        }
      }
    }
  }

  /* ════════════════════════════════════════
     HOLOGRAMA DEL SISTEMA SOLAR
     Planetas flotan a Y=0.5 sobre la mesa
  ════════════════════════════════════════ */
  const HOLO_Y   = 1.58;  // bien por encima del cristal de la mesa: ni el Sol (el más grande) la toca
  const holoGroup = new THREE.Group();
  holoGroup.position.set(0, HOLO_Y, 0);

  const planetObjects = [];
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8;

  // Shader que dibuja un plano como si fuera una esfera iluminada.
  const PLANET_VERT = `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `;
  const PLANET_FRAG = `
    uniform sampler2D map;
    uniform float hasMap;
    uniform vec3  fallbackColor;
    uniform float uRotation;
    uniform float uOpacity;
    uniform float uEmissive;
    varying vec2 vUv;
    void main(){
      vec2 p = vUv*2.0-1.0;
      float r2 = dot(p,p);
      if(r2>1.0) discard;
      float z = sqrt(1.0-r2);
      vec3 normal = normalize(vec3(p.x,p.y,z));

      float c=cos(uRotation), s=sin(uRotation);
      vec2 rp = vec2(p.x*c-p.y*s, p.x*s+p.y*c);
      vec2 sampleUv = rp*0.5+0.5;
      vec3 texColor = hasMap>0.5 ? texture2D(map, sampleUv).rgb : fallbackColor;

      if(uEmissive>0.5){
        float glow = mix(0.8,1.25,z);
        gl_FragColor = vec4(texColor*glow, uOpacity);
        return;
      }

      // Iluminación suave: prioriza que se vea el color/foto real del planeta,
      // solo un leve volumen 3D y oscurecimiento de borde (limb darkening).
      vec3 lightDir = normalize(vec3(0.45,0.6,0.65));
      float diff = max(dot(normal,lightDir),0.0);
      float limb = mix(0.62,1.0,z);
      float shade = 0.58 + diff*0.55;
      vec3 color = texColor*shade*limb;
      float spec = pow(max(dot(normal, normalize(lightDir+vec3(0.0,0.0,1.0))),0.0), 30.0)*0.18;
      color += vec3(spec);
      gl_FragColor = vec4(color, uOpacity);
    }
  `;

  // Crea el material con el que se dibuja un planeta (shader de esfera).
  function makePlanetMaterial(fallbackHex){
    const c = new THREE.Color(fallbackHex);
    return new THREE.ShaderMaterial({
      uniforms:{
        map:          { value: null },
        hasMap:       { value: 0 },
        fallbackColor:{ value: new THREE.Vector3(c.r,c.g,c.b) },
        uRotation:    { value: Math.random()*Math.PI*2 },
        uOpacity:     { value: 0.97 },
        uEmissive:    { value: 0 },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      transparent: true,
      side: THREE.DoubleSide, // visible desde cualquier ángulo (seguro extra en VR)
    });
  }

  const GAS_GIANTS = ['jupiter','saturn','uranus','neptune'];
  // Genera una imagen de planeta por código (para cuando no hay foto real).
  function genPlanetTexture(id, hex){
    const size=768, cx=size/2, cy=size/2, r=size*0.46; // 768: más resolución = menos pixelado al acercarse
    const cnv=document.createElement('canvas'); cnv.width=cnv.height=size;
    const g=cnv.getContext('2d');
    const base=new THREE.Color(hex);
    const R=Math.round(base.r*255), G=Math.round(base.g*255), B=Math.round(base.b*255);

    // Aura suave alrededor (solo visible en la ventana; el shader de la mesa no llega a muestrearla)
    const glow=g.createRadialGradient(cx,cy,r*0.85,cx,cy,size*0.5);
    glow.addColorStop(0,`rgba(${R},${G},${B},0.35)`);
    glow.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=glow; g.fillRect(0,0,size,size);

    g.save();
    g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.clip();

    // Dibuja una mancha difusa (nube, cráter, tormenta, etc.).
    function blob(x,y,rr,color){
      const grad=g.createRadialGradient(x,y,0,x,y,rr);
      grad.addColorStop(0,color);
      grad.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=grad; g.beginPath(); g.arc(x,y,rr,0,Math.PI*2); g.fill();
    }

    if(id==='earth'){
      // Océano con variación de tono + "cuenca" más oscura para dar volumen
      const ocean=g.createLinearGradient(0,0,size,size);
      ocean.addColorStop(0,'#0b4f8f'); ocean.addColorStop(0.5,'#1668ad'); ocean.addColorStop(1,'#0a3f73');
      g.fillStyle=ocean; g.fillRect(0,0,size,size);
      // Continentes (verde/marrón), formas orgánicas por manchas superpuestas
      const landCols=['rgba(63,120,58,0.9)','rgba(94,138,63,0.85)','rgba(120,98,58,0.75)'];
      for(let i=0;i<15;i++){
        const x=Math.random()*size, y=size*0.15+Math.random()*size*0.7;
        blob(x,y, 45+Math.random()*95, landCols[i%landCols.length]);
      }
      // Casquetes polares
      blob(cx, size*0.06, size*0.32, 'rgba(255,255,255,0.85)');
      blob(cx, size*0.94, size*0.30, 'rgba(255,255,255,0.8)');
      // Nubes: manchas blancas translúcidas arremolinadas
      for(let i=0;i<26;i++){
        const x=Math.random()*size, y=Math.random()*size;
        blob(x,y, 30+Math.random()*70, `rgba(255,255,255,${0.10+Math.random()*0.16})`);
      }
    } else if(id==='mars'){
      const surf=g.createLinearGradient(0,0,size,size);
      surf.addColorStop(0,'#a34a1f'); surf.addColorStop(0.5,'#c1622c'); surf.addColorStop(1,'#8f3e18');
      g.fillStyle=surf; g.fillRect(0,0,size,size);
      for(let i=0;i<10;i++){
        const x=Math.random()*size, y=Math.random()*size;
        blob(x,y, 50+Math.random()*110, 'rgba(70,28,10,0.35)'); // cuencas oscuras
      }
      for(let i=0;i<160;i++){
        const x=Math.random()*size, y=Math.random()*size, rr=1.5+Math.random()*7;
        g.fillStyle='rgba(255,190,140,0.10)';
        g.beginPath(); g.arc(x,y,rr,0,Math.PI*2); g.fill();
      }
      blob(cx, size*0.05, size*0.16, 'rgba(255,255,255,0.75)'); // casquete polar norte
    } else if(id==='sun'){
      const core=g.createRadialGradient(cx,cy,0,cx,cy,r);
      core.addColorStop(0,'#fff6d0'); core.addColorStop(0.35,'#ffd35c'); core.addColorStop(0.75,'#ff9a1f'); core.addColorStop(1,'#e0590a');
      g.fillStyle=core; g.fillRect(0,0,size,size);
      for(let i=0;i<90;i++){
        const x=Math.random()*size, y=Math.random()*size;
        blob(x,y, 14+Math.random()*40, Math.random()>0.5?'rgba(255,240,180,0.20)':'rgba(200,60,0,0.16)');
      }
    } else if(GAS_GIANTS.includes(id)){
      const bands=11+Math.floor(Math.random()*6);
      for(let i=0;i<bands;i++){
        const y=(i/bands)*size, h=size/bands*(0.75+Math.random()*0.6);
        const shade=0.72+Math.random()*0.5;
        g.fillStyle=`rgba(${Math.min(255,R*shade)|0},${Math.min(255,G*shade)|0},${Math.min(255,B*shade)|0},${0.45+Math.random()*0.35})`;
        g.fillRect(0,y,size,h);
      }
      // Turbulencia: franjas onduladas superpuestas (más orgánico que bandas rectas)
      for(let i=0;i<7;i++){
        const y=Math.random()*size;
        g.strokeStyle=`rgba(255,255,255,${0.05+Math.random()*0.08})`;
        g.lineWidth=6+Math.random()*14;
        g.beginPath();
        for(let x=0;x<=size;x+=24){ const yy=y+Math.sin(x*0.02+i)*18; x===0?g.moveTo(x,yy):g.lineTo(x,yy); }
        g.stroke();
      }
      // Gran tormenta (tipo "mancha roja") en los gigantes más grandes
      if(id==='jupiter' || id==='saturn'){
        blob(size*0.62, size*0.58, size*0.14, 'rgba(180,70,40,0.5)');
        blob(size*0.62, size*0.58, size*0.09, 'rgba(220,110,70,0.5)');
      }
      for(let i=0;i<4;i++){
        const x=Math.random()*size, y=Math.random()*size, rr=16+Math.random()*40;
        blob(x,y,rr,'rgba(255,255,255,0.18)');
      }
    } else if(id==='uranus' || id==='neptune'){
      const ice=g.createLinearGradient(0,0,0,size);
      ice.addColorStop(0,`rgb(${Math.min(255,R*1.15)|0},${Math.min(255,G*1.1)|0},${B})`);
      ice.addColorStop(1,`rgb(${R*0.7|0},${G*0.75|0},${Math.min(255,B*1.05)|0})`);
      g.fillStyle=ice; g.fillRect(0,0,size,size);
      for(let i=0;i<6;i++){
        const y=(i/6)*size;
        g.strokeStyle='rgba(255,255,255,0.08)'; g.lineWidth=10+Math.random()*20;
        g.beginPath(); g.moveTo(0,y); g.lineTo(size,y+Math.sin(i)*10); g.stroke();
      }
      if(id==='neptune') blob(size*0.4,size*0.45,size*0.09,'rgba(20,30,70,0.45)'); // gran mancha oscura
    } else {
      // Rocosos genéricos (Mercurio, Venus…): base + cráteres/manchas
      g.fillStyle=`rgb(${R},${G},${B})`; g.fillRect(0,0,size,size);
      for(let i=0;i<260;i++){
        const x=Math.random()*size, y=Math.random()*size, rr=2+Math.random()*13;
        g.fillStyle = Math.random()>0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.09)';
        g.beginPath(); g.arc(x,y,rr,0,Math.PI*2); g.fill();
      }
      for(let i=0;i<6;i++){
        const x=Math.random()*size, y=Math.random()*size, rr=35+Math.random()*75;
        g.fillStyle='rgba(0,0,0,0.11)';
        g.beginPath(); g.arc(x,y,rr,0,Math.PI*2); g.fill();
      }
    }

    // Viñeta para dar volumen extra
    const vg=g.createRadialGradient(cx-size*0.12,cy-size*0.15,size*0.04,cx,cy,r*1.05);
    vg.addColorStop(0,'rgba(255,255,255,0.14)');
    vg.addColorStop(0.6,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(0,0,0,0.26)');
    g.fillStyle=vg; g.fillRect(0,0,size,size);
    g.restore();

    const tex=new THREE.CanvasTexture(cnv);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=maxAniso;
    return tex;
  }

  // Crea el anillo de Saturno.
  function makeSaturnRing(size){
    const cnv=document.createElement('canvas'); cnv.width=256; cnv.height=32;
    const g=cnv.getContext('2d');
    for(let x=0;x<256;x++){
      const t=x/256;
      const a = 0.25+0.55*Math.abs(Math.sin(t*22))*(0.4+0.6*Math.random());
      g.fillStyle=`rgba(224,205,160,${a.toFixed(3)})`;
      g.fillRect(x,0,1,32);
    }
    const tex=new THREE.CanvasTexture(cnv);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size*1.35, size*2.3, 64),
      new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,opacity:0.9})
    );
    // UV radial simple para que la textura de bandas se vea a lo largo del radio
    const uvAttr = ring.geometry.attributes.uv;
    const posAttr = ring.geometry.attributes.position;
    for(let i=0;i<uvAttr.count;i++){
      const x=posAttr.getX(i), y=posAttr.getY(i);
      const r=Math.sqrt(x*x+y*y);
      const rn=(r-size*1.35)/(size*2.3-size*1.35);
      uvAttr.setXY(i, rn, 0.5);
    }
    ring.rotation.x = -Math.PI/2 + 0.42;
    return ring;
  }

  PLANETS.forEach(p => {
    const mat = makePlanetMaterial(p.fallback);
    if(p.orbit<=0) mat.uniforms.uEmissive.value = 1; // el Sol brilla, no se sombrea

    // Terminal holográfica: 100% generado por JS (canvas + shader), sin imágenes.
    // Las fotos reales de planetas se reservan para el entorno del panel de chat.
    mat.uniforms.map.value = genPlanetTexture(p.id, p.fallback);
    mat.uniforms.hasMap.value = 1;

    const sp = new THREE.Mesh(new THREE.PlaneGeometry(2,2), mat);
    sp.scale.set(p.size,p.size,1);
    sp.userData = {planetIdx: PLANETS.indexOf(p)};

    sp.position.set(Math.cos(p.angle)*p.orbit, 0, Math.sin(p.angle)*p.orbit);
    holoGroup.add(sp);

    let ring = null;
    if(p.id==='saturn'){
      ring = makeSaturnRing(p.size);
      ring.position.copy(sp.position);
      holoGroup.add(ring);
    }

    planetObjects.push({data:p, sprite:sp, ring, angle:p.angle, baseScale:p.size});
  });
  scene.add(holoGroup);



  /* ── Planeta grande en ventana frontal ─────────────────────────────────
     El jugador ve este planeta A TRAVÉS de la ventana de la nave — es el
     mismo objeto durante la exploración de la mesa Y durante la misión
     (la charla con el astronauta ocurre justo frente a él).

     Es una imagen simple, sin iluminación ni sombreado (a pedido: se probó
     con el shader de "esfera falsa" que usa la mesa holográfica y no era
     lo que se buscaba) — se ve tal cual la foto del planeta, solo GRANDE.

     Es un THREE.Mesh, no un THREE.Sprite — a diferencia de los planetas de
     la mesa (que sí giran para mirar siempre a la cámara, porque el
     jugador camina alrededor de la mesa), este se queda FIJO en el
     espacio: si el jugador mueve la cabeza, el planeta no la "sigue". */
  const wpMat = new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,opacity:0});
  const wpSprite = new THREE.Mesh(new THREE.PlaneGeometry(2,2), wpMat);
  wpSprite.scale.set(18,18,1); // grande, para que se note bien al mirar por la ventana
  wpSprite.position.set(0,2.5,-22);
  scene.add(wpSprite);

  // Da formato a un número grande (separador de miles).
  function fmtNum(n){ return n.toLocaleString('es-ES'); }
  // Dibuja uno de los paneles de datos del planeta (físicos u orbitales).
  function drawInfoPanel(g,w,h,p,side){
    g.clearRect(0,0,w,h);
    // Fondo tipo cristal holográfico
    g.fillStyle='rgba(4,18,36,0.55)';
    g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(60,190,255,0.9)'; g.lineWidth=3;
    g.strokeRect(6,6,w-12,h-12);
    g.strokeStyle='rgba(60,190,255,0.28)'; g.lineWidth=1;
    g.strokeRect(16,16,w-32,h-32);

    // Líneas de escaneo sutiles
    g.strokeStyle='rgba(120,220,255,0.06)';
    for(let y=24;y<h-24;y+=6){ g.beginPath(); g.moveTo(20,y); g.lineTo(w-20,y); g.stroke(); }

    // Esquinas técnicas
    g.strokeStyle='rgba(120,230,255,0.95)'; g.lineWidth=4;
    const cs=34;
    [[0,0,1,1],[w,0,-1,1],[0,h,1,-1],[w,h,-1,-1]].forEach(([cx,cy,dx,dy])=>{
      g.beginPath(); g.moveTo(cx+dx*4,cy+dy*cs); g.lineTo(cx+dx*4,cy+dy*4); g.lineTo(cx+dx*cs,cy+dy*4); g.stroke();
    });

    // Título
    g.fillStyle='#bfefff'; g.font='700 30px system-ui,Arial'; g.textBaseline='alphabetic';
    g.fillText(side==='left' ? 'DATOS FÍSICOS' : 'DATOS ORBITALES', 40, 58);
    g.strokeStyle='rgba(120,230,255,0.5)'; g.lineWidth=2;
    g.beginPath(); g.moveTo(40,72); g.lineTo(w-40,72); g.stroke();

    const rows = side==='left' ? [
      ['Diámetro', fmtNum(p.diameterKm)+' km'],
      ['Temp. media', (p.tempC>=0?'+':'')+p.tempC+' °C'],
      ['Lunas', p.moons===0?'Sin lunas conocidas':(p.moons+(p.moons===1?' luna':' lunas'))],
      ['Tipo', GAS_GIANTS.includes(p.id) ? 'Gigante gaseoso' : (p.id==='sun'?'Estrella':'Rocoso') ],
    ] : [
      ['Distancia al Sol', p.distanceAU===0 ? '—' : p.distanceAU+' UA'],
      ['Período orbital', p.orbitDays===0 ? '—' : (p.orbitDays>=1000 ? (p.orbitDays/365).toFixed(1)+' años' : p.orbitDays+' días')],
      ['Rotación/spin', 'Activo · en vivo'],
      ['Clasificación', p.orbit<=0 ? 'Centro del sistema' : ('Planeta #'+PLANETS.findIndex(x=>x.id===p.id)) ],
    ];

    let y=118;
    rows.forEach(([label,val])=>{
      g.fillStyle='rgba(140,225,255,0.75)'; g.font='500 20px system-ui,Arial';
      g.fillText(label.toUpperCase(), 40, y);
      g.fillStyle='#eafcff'; g.font='700 27px system-ui,Arial';
      g.fillText(val, 40, y+34);
      g.strokeStyle='rgba(120,230,255,0.18)'; g.lineWidth=1;
      g.beginPath(); g.moveTo(40,y+50); g.lineTo(w-40,y+50); g.stroke();
      y+=92;
    });

    // Pie: nombre del planeta
    g.fillStyle='rgba(120,230,255,0.9)'; g.font='700 24px system-ui,Arial';
    g.fillText(p.name.toUpperCase(), 40, h-30);
  }

  // Crea el mesh 3D de un panel de datos, vacío hasta que se dibuje.
  function makeInfoPanel(){
    const cnv=document.createElement('canvas'); cnv.width=460; cnv.height=560;
    const tex=new THREE.CanvasTexture(cnv);
    tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:0,depthWrite:false});
    const sp=new THREE.Mesh(new THREE.PlaneGeometry(1.15,1.4), mat);
    return {cnv, ctx:cnv.getContext('2d'), tex, mat, sp, baseOpacity:0};
  }
  const infoPanelL = makeInfoPanel();
  const infoPanelR = makeInfoPanel();
  // La posición final (pegados a los costados del panel de chat) se fija
  // más abajo, una vez creado missionHandle — ver "acoplar paneles de datos".

  // Redibuja los dos paneles de datos con la información de un planeta.
  function updateInfoPanels(p){
    drawInfoPanel(infoPanelL.ctx, infoPanelL.cnv.width, infoPanelL.cnv.height, p, 'left');
    infoPanelL.tex.needsUpdate = true;
    drawInfoPanel(infoPanelR.ctx, infoPanelR.cnv.width, infoPanelR.cnv.height, p, 'right');
    infoPanelR.tex.needsUpdate = true;
  }

  /* ════════════════════════════════════════
     RAYCAST — selección de planetas en la mesa
  ════════════════════════════════════════ */
  const raycaster = new THREE.Raycaster();
  const pointer   = new THREE.Vector2();
  let hoveredIdx  = -1, selectedIdx = -1;
  let camPhase    = 'A', camMoving = false;
  const allSprites = planetObjects.map(o=>o.sprite);

  // Guarda la posición del mouse/toque en coordenadas normalizadas.
  function uptr(e){
    const s=e.touches?e.touches[0]:e;
    pointer.x=(s.clientX/window.innerWidth)*2-1;
    pointer.y=-(s.clientY/window.innerHeight)*2+1;
  }
  // Lanza un rayo desde la cámara y devuelve qué planeta tocó.
  function doRay(){
    raycaster.setFromCamera(pointer,camera);
    const h=raycaster.intersectObjects(allSprites);
    return h.length>0 ? planetObjects.findIndex(o=>o.sprite===h[0].object) : -1;
  }

  canvas.addEventListener('mousemove',e=>{
    if(camMoving)return;
    if(appState!=='lobby' && appState!=='missionboard')return;
    uptr(e);
    raycaster.setFromCamera(pointer,camera);
    const target = appState==='missionboard' ? missionsBoard.boardMesh : missionsBoard.wallMesh;
    if(raycaster.intersectObject(target).length){
      canvas.style.cursor='pointer';
      if(hoveredIdx!==-1){hoveredIdx=-1;updateHover(-1);}
      return;
    }
    if(appState!=='lobby') { canvas.style.cursor='default'; return; }
    const idx=doRay();
    if(idx!==hoveredIdx){hoveredIdx=idx;updateHover(idx);canvas.style.cursor=idx>=0?'pointer':'default';}
  });

  canvas.addEventListener('click',e=>{
    if(camMoving)return;
    uptr(e);

    if(appState==='missionboard'){
      raycaster.setFromCamera(pointer,camera);
      const hit = raycaster.intersectObject(missionsBoard.boardMesh)[0];
      if(hit){
        const r = missionsBoard.handleBoardHit(hit);
        if(r) playClickSound();
      }
      return;
    }

    if(appState!=='lobby')return;

    // El letrero del panel de misiones (pared izquierda): tocarlo abre el
    // panel grande con el mismo viaje de cámara que usa un planeta.
    raycaster.setFromCamera(pointer,camera);
    const signHit = raycaster.intersectObject(missionsBoard.wallMesh)[0];
    if(signHit){
      playClickSound();
      openMissionsBoard();
      return;
    }

    const idx=doRay();
    if(idx>=0){
      playClickSound();
      selectPlanet(idx);
    }
  });

  // Muestra u oculta el cartel con el nombre del planeta señalado.
  function updateHover(idx){
    const hl=document.getElementById('planetHoverLabel');
    if(!hl)return;
    if(idx<0){hl.classList.remove('visible');return;}
    hl.querySelector('.p-name').textContent=PLANETS[idx].name;
    hl.querySelector('.p-desc').textContent=PLANETS[idx].desc;
    hl.classList.add('visible');
  }

  // Arranca el viaje hacia un planeta al tocarlo en la mesa.
  function selectPlanet(idx){
    if(appState!=='lobby' || camMoving) return;
    appState='launching';
    setLobbyHUDVisible(false);
    selectedIdx=idx;
    const p=PLANETS[idx];

    // Resalta visualmente el planeta elegido en la mesa: lo agranda y le
    // sube la opacidad, mientras atenúa (opacidad 0.4) a todos los demás.
    planetObjects.forEach((o,i)=>{
      const b=o.data.size;
      o.sprite.scale.set(i===idx?b*1.6:b, i===idx?b*1.6:b, 1);
      o.sprite.material.uniforms.uOpacity.value=i===idx?1.0:0.4;
      if(o.ring) o.ring.material.opacity = i===idx?0.9:0.35;
    });

    const hint=document.getElementById('lobbyHint');
    if(hint) hint.textContent='Saltando a '+p.name+'…';

    // Mueve la cámara y arranca el salto en paralelo.
    moveCam(CAM_B,LOOK_B,()=>{camPhase='B';});
    startWarp3D(()=> arriveAtPlanet(p));
  }

  // Se ejecuta cuando termina el salto: muestra el planeta y el chat.
  function arriveAtPlanet(p){
    curPos.copy(CAM_B); curLook.copy(LOOK_B);
    tgtPos.copy(CAM_B); tgtLook.copy(LOOK_B);
    camMoving = false; camPhase = 'B';
    if(renderer.xr.isPresenting){
      cameraRig.position.set(CAM_B.x, 0, CAM_B.z);
    } else {
      camera.position.copy(CAM_B);
      camera.lookAt(LOOK_B);
    }
    setLobbyControllerVisualsVisible(false);
    loadWindowPlanet(p);

    try {
      sessionStorage.setItem('selected_planet',JSON.stringify({
        id:p.id, name:p.name, topic:p.topic
      }));
    } catch(_) {}

    if(window.ASTRO_CONFIG){
      window.ASTRO_CONFIG.selectedPlanet = { id:p.id, name:p.name, topic:p.topic, fallback:p.fallback };
    }

    missionHandle.setPlanet(p.id);
    missionHandle.show();
    missionHandle.greet(p.name);
    missionHandle.setExpeditionAvailable(p.id!=='earth' && isPlanetShipMissionsComplete(p.id));

    const hint=document.getElementById('lobbyHint');
    if(hint) hint.textContent='Pregúntale al astronauta sobre '+p.name+' • SALIR o ESC para volver';

    appState='mission';
    window.dispatchEvent(new CustomEvent('astro:missionstart',{detail:{planet:p}}));
  }

  let fadeTimer=null;
  // Muestra el planeta elegido en la ventana (textura rápida, luego la foto real).
  function loadWindowPlanet(p){
    wpSprite.position.set(0,2.5,-22);

    const procTex = genPlanetTexture(p.id, p.fallback);
    procTex.anisotropy = maxAniso;
    wpMat.map = procTex; wpMat.needsUpdate = true;
    fadeIn();

    texLoader.load(p.img,
      t=>{ t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=maxAniso; wpMat.map=t; wpMat.needsUpdate=true; },
      undefined,
      ()=>{ /* sin PNG: se queda con la textura procedural */ }
    );
    updateInfoPanels(p);
  }
  // Hace aparecer gradualmente el planeta de la ventana.
  function fadeIn(){
    if(fadeTimer)clearInterval(fadeTimer);
    let op=wpMat.opacity;
    fadeTimer=setInterval(()=>{
      op+=0.06;
      wpMat.opacity=Math.min(op,0.95);
      infoPanelL.baseOpacity=Math.min(op,0.92);
      infoPanelR.baseOpacity=Math.min(op,0.92);
      if(op>=0.95)clearInterval(fadeTimer);
    },16);
  }

  window.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    if(appState==='mission') exitMission();
    else if(appState==='missionboard') closeMissionsBoard();
  });

  const curPos  = CAM_A.clone();
  const curLook = LOOK_A.clone();
  let tgtPos    = CAM_A.clone();
  let tgtLook   = LOOK_A.clone();

  // Mueve la cámara suavemente hacia una posición.
  function moveCam(pos,look,cb){
    camMoving=true;
    tgtPos=pos.clone(); tgtLook=look.clone();
    setTimeout(()=>{camMoving=false;cb&&cb();},2000);
  }

  /* ════════════════════════════════════════
     ANIMACIÓN DE SALTO INTERESPACIAL
  ════════════════════════════════════════ */

  // Muestra u oculta el HUD de HTML del lobby (título y texto de ayuda).
  function setLobbyHUDVisible(v){
    const hud = document.getElementById('lobbyHUD');
    if(hud) hud.style.display = v ? '' : 'none';
  }

  // Devuelve todos los planetas de la mesa a su tamaño y opacidad normal.
  function resetPlanetSelectionVisuals(){
    planetObjects.forEach(o=>{
      o.sprite.scale.set(o.data.size,o.data.size,1);
      o.sprite.material.uniforms.uOpacity.value=0.97;
      if(o.ring) o.ring.material.opacity=0.9;
    });
  }

  // Sistema de misión (astronauta + panel de chat).
  const missionHandle = initMission({ THREE, renderer, scene, camera, cameraRig, onExit: () => exitMission() });

  /* Acoplar los paneles de datos (Físicos/Orbitales) al panel de chat:
     se cuelgan como hijos de missionHandle.uiGroup en vez de quedar sueltos
     en la escena — así, pase lo que pase con el panel de chat (que se
     recentra frente al jugador al entrar en misión, y en VR se puede
     arrastrar con el botón "Mover"), estos dos paneles lo siguen siempre,
     pegados a sus costados, como un solo bloque de instrumentos. */
  const INFO_PANEL_GAP = 0.14;               // separación entre el panel de chat y cada panel lateral
  const infoPanelOffsetX = (missionHandle.panelMesh.geometry.parameters.width/2) + INFO_PANEL_GAP + (infoPanelL.sp.geometry.parameters.width/2);
  infoPanelL.sp.position.set(-infoPanelOffsetX, 0, -0.01); // -0.01: apenas detrás para no pelear el z-fighting con el borde del chat
  infoPanelR.sp.position.set( infoPanelOffsetX, 0, -0.01);
  missionHandle.uiGroup.add(infoPanelL.sp);
  missionHandle.uiGroup.add(infoPanelR.sp);

  // Sale de la misión y vuelve a la mesa.
  function exitMission(){
    if(appState!=='mission') return;
    appState = 'launching';

    missionHandle.hide();
    window.dispatchEvent(new Event('astro:missionend'));
    setLobbyControllerVisualsVisible(true);

    resetPlanetSelectionVisuals();
    selectedIdx = -1; hoveredIdx = -1;
    wpMat.opacity = 0;
    infoPanelL.baseOpacity = 0; infoPanelR.baseOpacity = 0;
    infoPanelL.mat.opacity  = 0; infoPanelR.mat.opacity  = 0;
    const hint = document.getElementById('lobbyHint');
    if(hint) hint.textContent = 'Haz click en un planeta para iniciar la misión';

    // Regreso suave a la mesa (el mismo moveCam de siempre — funciona en
    // escritorio interpolando la cámara y en VR interpolando el rig).
    camPhase = 'A';
    moveCam(CAM_A, LOOK_A, ()=>{ appState = 'lobby'; setLobbyHUDVisible(true); });
  }

  // Acercarse al panel de misiones — mismo viaje (moveCam + salto 3D) que
  // usa selectPlanet() para llegar a la ventana.
  function openMissionsBoard(){
    if(appState!=='lobby' || camMoving) return;
    appState = 'launching';
    setLobbyHUDVisible(false);
    const hint=document.getElementById('lobbyHint');
    if(hint) hint.textContent = 'Accediendo al panel de misiones…';
    moveCam(CAM_LEFT, LOOK_LEFT, ()=>{ camPhase='C'; });
    startWarp3D(()=> arriveAtMissionsBoard());
  }

  // Se ejecuta cuando termina el viaje al panel de misiones.
  function arriveAtMissionsBoard(){
    curPos.copy(CAM_LEFT); curLook.copy(LOOK_LEFT);
    tgtPos.copy(CAM_LEFT); tgtLook.copy(LOOK_LEFT);
    camMoving = false; camPhase = 'C';
    if(renderer.xr.isPresenting){
      cameraRig.position.set(CAM_LEFT.x, 0, CAM_LEFT.z);
    } else {
      camera.position.copy(CAM_LEFT);
      camera.lookAt(LOOK_LEFT);
    }
    missionsBoard.show();
    const hint=document.getElementById('lobbyHint');
    if(hint) hint.textContent = 'Elegí una misión de la lista • SALIR para volver a la mesa';
    appState = 'missionboard';
  }

  // Cierra el panel de misiones y vuelve a la mesa.
  function closeMissionsBoard(){
    if(appState!=='missionboard') return;
    appState = 'launching';
    missionsBoard.hide();
    setLobbyControllerVisualsVisible(true);
    const hint=document.getElementById('lobbyHint');
    if(hint) hint.textContent = 'Haz click en un planeta para iniciar la misión';

    camPhase = 'A';
    moveCam(CAM_A, LOOK_A, ()=>{ appState = 'lobby'; setLobbyHUDVisible(true); });
  }

  /* ── VR Button ──────────────────────────────────────────── */
  // dom-overlay: permite superponer HTML (por ejemplo, el menú de ajustes)
  // sobre la vista del casco.
  document.body.appendChild(VRButton.createButton(renderer,{
    optionalFeatures:['hand-tracking','dom-overlay'],
    domOverlay:{root:document.body},
  }));

  /* ════════════════════════════════════════
     CONTROLADORES Y MANOS EN VR
     — el visor parte desde CAM_A (no desde el centro de la mesa)
     — rayo + modelo de mando visibles
     — modelo de manos visible (hand-tracking)
     — el gatillo / pellizco selecciona el planeta señalado
  ════════════════════════════════════════ */
  let tickXRInput = null;
  let setLobbyControllerVisualsVisible = ()=>{};
  {
    const ctrlModelFactory = window.XRControllerModelFactory ? new window.XRControllerModelFactory() : null;
    const handModelFactory = window.XRHandModelFactory ? new window.XRHandModelFactory() : null;

    const xrRay = new THREE.Raycaster();
    const tmpM  = new THREE.Matrix4();

    // Crea el círculo que marca dónde apunta un mando o mano.
    function makeReticle(){
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.022,0.032,28),
        new THREE.MeshBasicMaterial({color:0x2aa9ff,transparent:true,opacity:0.95,side:THREE.DoubleSide,depthTest:false})
      );
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.010,16),
        new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.95,depthTest:false})
      );
      ring.renderOrder = dot.renderOrder = 999;
      const g = new THREE.Group();
      g.add(ring); g.add(dot);
      g.userData.ring = ring;
      g.position.set(0,0,-1);
      return g;
    }

    // Lanza un rayo desde un mando y devuelve qué planeta tocó.
    function pickWithController(controller){
      tmpM.identity().extractRotation(controller.matrixWorld);
      xrRay.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      xrRay.ray.direction.set(0,0,-1).applyMatrix4(tmpM).normalize();
      const hits = xrRay.intersectObjects(allSprites);
      if(!hits.length) return {idx:-1, dist:6};
      return {idx: planetObjects.findIndex(o=>o.sprite===hits[0].object), dist: Math.min(hits[0].distance,6)};
    }

    // Lanza un rayo hacia un mesh dado (letrero o panel de misiones).
    function pickMeshWithRay(mesh, origin, dir){
      xrRay.ray.origin.copy(origin);
      xrRay.ray.direction.copy(dir);
      const hits = xrRay.intersectObject(mesh);
      return hits.length ? hits[0] : null;
    }
    // Lanza un rayo desde un mando hacia un mesh dado.
    function pickMeshWithController(mesh, controller){
      tmpM.identity().extractRotation(controller.matrixWorld);
      const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
      const dir = new THREE.Vector3(0,0,-1).applyMatrix4(tmpM).normalize();
      return pickMeshWithRay(mesh, origin, dir);
    }

    // Activa el viaje al planeta señalado en VR.
    function activatePlanetFromXR(idx){
      if(idx<0) return;
      selectPlanet(idx);
    }

    // Crea la línea del rayo que sale de un mando.
    function makeRayLine(){
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({color:0x2aa9ff,transparent:true,opacity:0.85}));
      line.scale.z = 6;
      line.name = 'xrRay';
      return line;
    }

    // Los controles/mandos/manos cuelgan del rig (no de scene directamente),
    // así se mueven junto con el jugador y quedan alineados con lo que ve.
    const controllers = [0,1].map(i=>{
      const controller = renderer.xr.getController(i);
      const rayLine = makeRayLine();
      controller.add(rayLine);
      const reticle = makeReticle();
      controller.add(reticle);
      // El módulo de misión (missionScene.js/inputXR.js) usa el mismo
      // objeto de controlador WebXR y guarda su propio rayo/retícula bajo
      // otra clave, para que no se pisen entre sí.
      controller.userData.lobbyReticle = reticle;
      controller.userData.lobbyRayLine = rayLine;
      controller.addEventListener('selectstart', ()=>{
        if(appState==='missionboard'){
          const hit = pickMeshWithController(missionsBoard.boardMesh, controller);
          if(hit){
            const r = missionsBoard.handleBoardHit(hit);
            if(r) playClickSound();
          }
          return;
        }
        if(appState!=='lobby') return;
        const signHit = pickMeshWithController(missionsBoard.wallMesh, controller);
        if(signHit){
          playClickSound();
          openMissionsBoard();
          return;
        }
        const {idx} = pickWithController(controller);
        activatePlanetFromXR(idx);
        playClickSound();
      });
      cameraRig.add(controller);

      const grip = renderer.xr.getControllerGrip(i);
      if(ctrlModelFactory) grip.add(ctrlModelFactory.createControllerModel(grip));
      cameraRig.add(grip);

      return { controller, grip };
    });

    const hands = [0,1].map(i=>{
      const hand = renderer.xr.getHand(i);
      if(handModelFactory) hand.add(handModelFactory.createHandModel(hand,'mesh'));
      cameraRig.add(hand);
      return hand;
    });

    // Retícula de puntería para cada mano.
    const handReticles = [0,1].map(()=>{
      const r = makeReticle();
      r.visible = false;
      scene.add(r);
      return r;
    });

    setLobbyControllerVisualsVisible = function(v){
      controllers.forEach(({controller})=>{
        if(controller.userData.lobbyReticle) controller.userData.lobbyReticle.visible = v;
        if(controller.userData.lobbyRayLine)  controller.userData.lobbyRayLine.visible  = v;
      });
      if(!v) handReticles.forEach(r=>{ r.visible = false; });
    };

    // Selección por pellizco (pulgar + índice) cuando se usan manos sin mando
    const pinchState = [{active:false},{active:false}];
    const _a=new THREE.Vector3(), _b=new THREE.Vector3(), _o=new THREE.Vector3(), _d=new THREE.Vector3();
    const _handQuat=new THREE.Quaternion();
    // Calcula el rayo que sale del dedo índice de una mano.
    function handRay(hand){
      const tip = hand.joints?.['index-finger-tip'];
      const knuckle = hand.joints?.['index-finger-phalanx-proximal'] || hand.joints?.['index-finger-metacarpal'];
      if(!tip) return null;
      tip.getWorldPosition(_o);
      if(knuckle){ knuckle.getWorldPosition(_a); _d.copy(_o).sub(_a).normalize(); }
      else {
        camera.getWorldQuaternion(_handQuat);
        _d.set(0,0,-1).applyQuaternion(_handQuat);
      }
      return { origin:_o, dir:_d };
    }
    // Lanza un rayo desde una mano y devuelve qué planeta tocó.
    function pickWithHand(hand){
      const ray = handRay(hand);
      if(!ray) return -1;
      xrRay.ray.origin.copy(ray.origin); xrRay.ray.direction.copy(ray.dir);
      const hits = xrRay.intersectObjects(allSprites);
      return hits.length ? planetObjects.findIndex(o=>o.sprite===hits[0].object) : -1;
    }

    tickXRInput = function(){
      if(!renderer.xr.isPresenting) return;
      if(appState!=='lobby' && appState!=='missionboard') return;

      // Actualizar retículas: distancia real hasta lo que se apunta + color de estado
      controllers.forEach(({controller})=>{
        const reticle = controller.userData.lobbyReticle;
        if(!reticle) return;
        if(appState==='missionboard'){
          const hit = pickMeshWithController(missionsBoard.boardMesh, controller);
          reticle.position.z = hit ? -Math.min(hit.distance,6) : -6;
          const s = hit ? 1.6 : 1;
          reticle.scale.set(s,s,s);
          reticle.userData.ring.material.color.setHex(hit ? 0x35ffb0 : 0x2aa9ff);
          return;
        }
        const {idx, dist} = pickWithController(controller);
        reticle.position.z = -dist;
        const s = idx>=0 ? 1.6 : 1;
        reticle.scale.set(s,s,s);
        reticle.userData.ring.material.color.setHex(idx>=0 ? 0x35ffb0 : 0x2aa9ff);
      });

      hands.forEach((hand,i)=>{
        const thumb = hand.joints?.['thumb-tip'];
        const index = hand.joints?.['index-finger-tip'];
        const hr = handReticles[i];
        if(!thumb || !index){ hr.visible = false; return; }

        // Retícula: dónde está apuntando la mano AHORA, se actualice o no
        // el pellizco este frame.
        const aimRay = handRay(hand);
        if(!aimRay){ hr.visible = false; }
        else {
          let hitDist = 6, isHit = false;
          if(appState==='missionboard'){
            const h = pickMeshWithRay(missionsBoard.boardMesh, aimRay.origin, aimRay.dir);
            if(h){ hitDist = Math.min(h.distance,6); isHit = true; }
          } else {
            const signH = pickMeshWithRay(missionsBoard.wallMesh, aimRay.origin, aimRay.dir);
            if(signH){ hitDist = Math.min(signH.distance,6); isHit = true; }
            else {
              xrRay.ray.origin.copy(aimRay.origin); xrRay.ray.direction.copy(aimRay.dir);
              const planetHits = xrRay.intersectObjects(allSprites);
              if(planetHits.length){ hitDist = Math.min(planetHits[0].distance,6); isHit = true; }
            }
          }
          hr.position.copy(aimRay.origin).addScaledVector(aimRay.dir, hitDist);
          hr.quaternion.copy(camera.quaternion); // siempre de frente a la cámara, como un cartelito
          hr.visible = true;
          const s = isHit ? 1.6 : 1;
          hr.scale.set(s,s,s);
          hr.userData.ring.material.color.setHex(isHit ? 0x35ffb0 : 0x2aa9ff);
        }

        thumb.getWorldPosition(_a); index.getWorldPosition(_b);
        const pinching = _a.distanceTo(_b) < 0.028;
        if(pinching && !pinchState[i].active){
          pinchState[i].active = true;
          const ray = handRay(hand);

          if(appState==='missionboard'){
            const hit = ray ? pickMeshWithRay(missionsBoard.boardMesh, ray.origin, ray.dir) : null;
            if(hit){
              const r = missionsBoard.handleBoardHit(hit);
              if(r) playClickSound();
            }
            return;
          }

          const signHit = ray ? pickMeshWithRay(missionsBoard.wallMesh, ray.origin, ray.dir) : null;
          if(signHit){
            playClickSound();
            openMissionsBoard();
            return;
          }
          activatePlanetFromXR(pickWithHand(hand));
          playClickSound();
        } else if(!pinching){
          pinchState[i].active = false;
        }
      });
    };
  }

  // Se abre/cierra al ponerse/quitarse el casco.
  renderer.xr.addEventListener('sessionstart', ()=>{
    camera.position.set(0,0,0);
    camera.quaternion.identity();
    const p = (appState==='mission') ? CAM_C : CAM_A;
    cameraRig.position.set(p.x, 0, p.z);
    cameraRig.quaternion.identity();
    missionHandle.onXRSessionStart();
    window.dispatchEvent(new Event('astro:vrstart'));
  });
  renderer.xr.addEventListener('sessionend', ()=>{
    // Volver el rig a neutro: en escritorio, camera.position se maneja directo otra vez
    cameraRig.position.set(0,0,0);
    cameraRig.quaternion.identity();
    missionHandle.onXRSessionEnd();
    window.dispatchEvent(new Event('astro:vrend'));
  });


  /* ── Mouse look (mesa, escritorio) ──────────────────────────
     Balanceo suave de cámara al arrastrar con el botón derecho mientras se
     está sentado frente a la mesa (fase 'A'). */
  let drag=false, lx=0, ly=0, yaw=0, pitch=0;
  canvas.addEventListener('mousedown',e=>{if(e.button===2){drag=true;lx=e.clientX;ly=e.clientY;}});
  window.addEventListener('mouseup',()=>{drag=false;});
  window.addEventListener('mousemove',e=>{
    if(!drag)return;
    yaw  -=(e.clientX-lx)*0.0018; pitch-=(e.clientY-ly)*0.0018;
    pitch=Math.max(-0.35,Math.min(0.35,pitch));
    lx=e.clientX; ly=e.clientY;
  });
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  /* ── Touch look (mesa, celular) ──────────────────────────────
     En celular no existe el "click derecho", así que un arrastre con un
     dedo cumple el mismo rol de "mirar alrededor". Se distingue de un
     toque corto (para seleccionar un planeta o el panel de misiones) por
     cuánto se movió el dedo: si se movió poco, se deja pasar como toque
     normal; si se movió más que el umbral, se toma como arrastre y se
     cancela el click sintético que habría seguido, para no seleccionar
     por accidente lo que haya quedado debajo del dedo. */
  let touchLooking=false, touchDragged=false, tlx=0, tly=0;
  const TOUCH_DRAG_THRESHOLD = 10;

  canvas.addEventListener('touchstart', e=>{
    if(appState!=='lobby' && appState!=='missionboard') return;
    if(camMoving) return;
    if(e.touches.length!==1) return;
    touchLooking = true; touchDragged = false;
    tlx = e.touches[0].clientX; tly = e.touches[0].clientY;
  }, { passive:true });

  canvas.addEventListener('touchmove', e=>{
    if(!touchLooking) return;
    if(appState!=='lobby' && appState!=='missionboard'){ touchLooking=false; return; }
    const t = e.touches[0];
    if(!t) return;
    const dx = t.clientX-tlx, dy = t.clientY-tly;
    if(!touchDragged && Math.hypot(dx,dy) > TOUCH_DRAG_THRESHOLD) touchDragged = true;
    if(touchDragged){
      e.preventDefault(); // evita que la página haga scroll mientras se mira alrededor
      yaw   -= dx*0.0022;
      pitch -= dy*0.0022;
      pitch  = Math.max(-0.35, Math.min(0.35, pitch));
    }
    tlx = t.clientX; tly = t.clientY;
  }, { passive:false });

  canvas.addEventListener('touchend', e=>{
    if(touchLooking && touchDragged) e.preventDefault(); // fue arrastre, no toque: no seleccionar nada
    touchLooking = false; touchDragged = false;
  }, { passive:false });

  // Ajusta el tamaño del render al cambiar el tamaño de la ventana.
  window.addEventListener('resize',()=>{
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
    missionHandle.resize();
  });

  /* ════════════════════════════════════════
     LOOP DE ANIMACIÓN
  ════════════════════════════════════════ */
  const clock = new THREE.Clock();
  const _camWorld = new THREE.Vector3(); // posición mundial de la cámara (reutilizada cada frame)
  let _lastT = 0;

  renderer.setAnimationLoop(()=>{
    // Si algo dentro del bucle falla, se registra el error y se sigue
    // renderizando en vez de dejar la escena congelada o invisible.
    try {
      const t = clock.getElapsedTime();
      const dt = Math.min(0.1, t - _lastT); // clamp por si hubo un frame largo
      _lastT = t;

      // Salto interespacial 3D — corre dentro del bucle de render XR, así
      // que se ve fluido también dentro del casco.
      warpTick3D(dt);

      // Posición mundial de la cámara, para que los planetas del holograma
      // siempre "miren" hacia ahí.
      camera.getWorldPosition(_camWorld);

      // Anima los planetas del holograma: orbitan alrededor del Sol.
      // Corre en todos los estados, porque la nave nunca se oculta (la
      // misión ocurre en la ventana), así que la mesa sigue animándose de
      // fondo también durante la misión.
      {
      planetObjects.forEach((o,i)=>{
        if(o.data.orbit<=0){
          // Sol pulsa sutilmente en el centro, sin desplazarse
          if(i!==selectedIdx){
            const s=o.data.size*(1+0.04*Math.sin(t*2));
            o.sprite.scale.set(s,s,1);
          }
        } else {
          o.angle+=o.data.speed*0.007;
          o.sprite.position.set(
            Math.cos(o.angle)*o.data.orbit,
            0,
            Math.sin(o.angle)*o.data.orbit
          );
          if(o.ring) o.ring.position.copy(o.sprite.position);
          // Pulso suave en planetas no seleccionados
          if(i!==selectedIdx&&i!==hoveredIdx){
            const s=o.data.size*(1+0.03*Math.sin(t*1.5+o.data.angle));
            o.sprite.scale.set(s,s,1);
          }
        }

        // Billboard: cada plano-planeta mira SIEMPRE hacia la cámara.
        // Object3D.lookAt trabaja en coordenadas de mundo y compensa la rotación
        // del holoGroup padre automáticamente — válido en escritorio y en VR.
        o.sprite.lookAt(_camWorld);
      });

      // Rotación lenta del grupo holograma
      holoGroup.rotation.y += 0.0012;

      // Pulsos de luz
      tabRing.material.emissiveIntensity  = 2.2+Math.sin(t*2.2)*0.7;
      tabRing2.material.emissiveIntensity = 1.2+Math.sin(t*1.8+1)*0.4;
      holoL.intensity = 2.8+Math.sin(t*3)*0.5;
      ceilL.intensity = 3.8+Math.sin(t*0.4)*0.4;

      // Parpadeo sutil ("sensor en vivo") de los paneles de datos acoplados
      // al panel de chat. Son hijos del panel de chat, así que ya se mueven
      // solos junto con él; acá solo se anima la opacidad.
      if(infoPanelL.baseOpacity>0.02){
        const flick = 0.94+Math.sin(t*7)*0.03+((Math.random()<0.01)?-0.12:0);
        infoPanelL.mat.opacity = Math.min(0.95, infoPanelL.baseOpacity)*flick;
        infoPanelR.mat.opacity = Math.min(0.95, infoPanelR.baseOpacity)*flick;
      } else {
        infoPanelL.mat.opacity = 0;
        infoPanelR.mat.opacity = 0;
      }
      } // fin bloque de animación de la mesa (corre en todos los estados)

      // Mientras hay misión activa, delega la actualización del
      // astronauta/chat en el módulo de misión.
      if(appState==='mission'){
        missionHandle.tick(t);
      }

      /* Movimiento de cámara (mesa ⇄ ventana ⇄ afuera de la nave ⇄ panel de
         misiones):
         - Escritorio: se interpola camera.position directamente.
         - VR: no se toca la cámara (el visor manda) — se interpola el rig en
           X/Z, con Y=0 porque en 'local-floor' el visor suma la altura real
           del usuario.
         - Durante la misión (chat) este bloque se salta por completo: la
           orientación de cámara la maneja otro sistema (en escritorio, el
           "mirar alrededor" de inputDesktopMobile.js escribe
           camera.quaternion directamente; en VR, el propio casco).
         - El panel de misiones (fase 'C'), en cambio, NO tiene un sistema de
           mirar alrededor propio — por eso sigue usando este mismo bloque
           (y el balanceo de mouse de más abajo), para no dejar la cámara
           congelada sin ninguna forma de ajustarla. */
      if(appState!=='mission'){
      if(!renderer.xr.isPresenting){
        curPos.lerp(tgtPos,0.03);
        camera.position.copy(curPos);

        const lk = tgtLook.clone();
        if((camPhase==='A'||camPhase==='C')&&!camMoving){
          lk.x+=Math.sin(yaw)*2.5;
          lk.y+=Math.sin(pitch)*1.5;
        }
        curLook.lerp(lk,0.03);
        camera.lookAt(curLook);
      } else {
        cameraRig.position.x += (tgtPos.x - cameraRig.position.x)*0.03;
        cameraRig.position.z += (tgtPos.z - cameraRig.position.z)*0.03;
        cameraRig.position.y = 0;
      }
      }

      tickXRInput?.();
    } catch(err){
      if(!window.__lobbyAnimErrWarned){
        console.error('[lobbyScene] Error en el loop de animación:', err);
        window.__lobbyAnimErrWarned = true;
      }
    }

    try{ renderer.render(scene,camera); } catch(err){ console.error('[lobbyScene] Error de render:', err); }
  });

  // Aclara u oscurece un color hexadecimal.
  function lcol(hex,amt){
    const n=parseInt(hex.replace('#',''),16);
    return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;
  }
})();
