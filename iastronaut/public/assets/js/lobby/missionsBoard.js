// Panel de misiones de la nave: un letrero de pared que abre un panel con
// lista de misiones (izquierda) y la herramienta de la misión elegida
// (derecha). Cada misión usa una de cuatro mecánicas: cables, secuencia,
// diales o memoria. Los planetas se desbloquean de a uno.

// Orden de desbloqueo de planetas — se empieza por la Tierra (la más
// cercana y familiar) en vez del orden astronómico de la mesa.
const MISSION_ORDER = ['earth','mars','venus','mercury','sun','jupiter','saturn','uranus','neptune'];
const PLANET_NAMES = {
  sun:'el Sol', mercury:'Mercurio', venus:'Venus', earth:'la Tierra', mars:'Marte',
  jupiter:'Júpiter', saturn:'Saturno', uranus:'Urano', neptune:'Neptuno',
};
const PLANET_LABEL = {
  sun:'SOL', mercury:'MERCURIO', venus:'VENUS', earth:'TIERRA', mars:'MARTE',
  jupiter:'JÚPITER', saturn:'SATURNO', uranus:'URANO', neptune:'NEPTUNO',
};

// Cuántas misiones tiene cada planeta — deliberadamente NO es siempre el
// mismo número, para que la lista no se sienta como una plantilla fija.
const PLANET_MISSION_COUNT = {
  earth:4, mars:5, venus:5, mercury:6, sun:6, jupiter:6, saturn:7, uranus:7, neptune:7,
};

// Calcula qué tan difícil debe ser la misión según el planeta.
function difficultyStep(planetId) {
  const idx = MISSION_ORDER.indexOf(planetId);
  return idx < 0 ? 0 : Math.floor(idx / 3);
}

const WIRE_COLORS = ['#ff5c5c','#4da3ff','#52e08a','#ffd24d','#c17bff','#4de0ff'];
const SYMBOLS = ['★','◆','●','▲','■','✦','◉','♦'];

// Pool de 8 plantillas — 2 de cada mecánica — inspiradas en tareas reales
// de mantenimiento de astronautas en la Estación Espacial Internacional.
// Cada planeta usa una tanda rotada de este pool, así ningún planeta repite
// dos misiones de la misma mecánica consecutivas y no todos empiezan igual.
const MISSION_POOL = [
  { type:'wires', id:'life-support', title:'Soporte Vital', base:3, cap:6,
    briefing:(p)=>`El sistema de reciclaje de aire de la base en ${p} perdió sincronía. Reconectá cada línea del purificador con su color correspondiente.` },
  { type:'wires', id:'coolant', title:'Refrigerante', base:3, cap:6,
    briefing:(p)=>`Hay una fuga en el circuito de refrigeración del módulo en ${p}. Sellá el circuito reconectando las líneas correctas.` },
  { type:'sequence', id:'reboot', title:'Reinicio de Sistema', base:3, cap:6,
    briefing:(p,order)=>`El sistema de encendido de la base en ${p} necesita reiniciarse a mano. Activá los relés en este orden exacto: ${order.join(' → ')}.` },
  { type:'sequence', id:'comms-sync', title:'Sincronización de Antena', base:3, cap:6,
    briefing:(p,order)=>`La antena de ${p} perdió sincronía con Tierra. Ajustá los emisores en este orden: ${order.join(' → ')}.` },
  { type:'dial', id:'solar-calib', title:'Calibración Solar', base:2, cap:4,
    briefing:(p)=>`Los paneles solares cerca de ${p} perdieron orientación. Usá +/- para llevar cada uno a su ángulo objetivo.` },
  { type:'dial', id:'pressure', title:'Presurización', base:2, cap:4,
    briefing:(p)=>`Hay que igualar la presión de los módulos de ${p} antes de continuar. Ajustá cada válvula a su valor objetivo.` },
  { type:'match', id:'sample-catalog', title:'Catalogar Muestras', base:3, cap:6,
    briefing:(p)=>`Llegaron muestras del suelo de ${p} mezcladas sin catalogar. Tocá dos tarjetas para revisarlas y emparejá cada muestra con su gemela.` },
  { type:'match', id:'debris-id', title:'Identificar Chatarra', base:3, cap:6,
    briefing:(p)=>`El radar detectó fragmentos sin identificar cerca de ${p}. Emparejá las señales para reconocer cada objeto.` },
];

const PROGRESS_KEY = 'astro_missions_progress_v2';

// Carga el progreso guardado, o uno vacío si no hay.
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const fresh = {};
  MISSION_ORDER.forEach(id => { fresh[id] = new Array(PLANET_MISSION_COUNT[id]).fill(false); });
  return fresh;
}
// Guarda el progreso en el navegador.
function saveProgress(progress) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {}
}
// Dice si un planeta ya tiene todas sus misiones completas.
function planetComplete(planetId, progress) {
  const arr = progress[planetId] || [];
  return arr.length > 0 && arr.every(Boolean);
}
// Dice si un planeta ya se puede jugar.
function isUnlocked(planetId, progress) {
  const idx = MISSION_ORDER.indexOf(planetId);
  if (idx <= 0) return true;
  return planetComplete(MISSION_ORDER[idx - 1], progress);
}
// Devuelve el planeta activo actual.
function frontierPlanet(progress) {
  for (const id of MISSION_ORDER) if (!planetComplete(id, progress)) return id;
  return MISSION_ORDER[MISSION_ORDER.length - 1];
}

// Devuelve una lista de números del 0 al n-1 en orden al azar.
function shuffled(n) {
  const arr = Array.from({ length:n }, (_,i)=>i);
  for (let i = arr.length-1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}

// Arma la lista de misiones de un planeta.
function buildMissionsForPlanet(planetId) {
  const name = PLANET_NAMES[planetId] || planetId;
  const count = PLANET_MISSION_COUNT[planetId] || 4;
  const step = difficultyStep(planetId);
  const planetIdx = Math.max(0, MISSION_ORDER.indexOf(planetId));
  const start = (planetIdx * 2) % MISSION_POOL.length;

  const list = [];
  for (let i = 0; i < count; i++) {
    const tpl = MISSION_POOL[(start + i) % MISSION_POOL.length];
    const n = Math.min(tpl.cap, tpl.base + step);
    const mission = { type: tpl.type, id: tpl.id, title: tpl.title, n };
    if (tpl.type === 'sequence') {
      mission.order = shuffled(n).map(v => v + 1); // 1..n en un orden al azar
      mission.briefing = tpl.briefing(name, mission.order);
    } else {
      mission.briefing = tpl.briefing(name);
    }
    list.push(mission);
  }
  return list;
}

// Dibuja un texto largo partido en varias líneas.
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '', cy = y;
  for (const word of words) {
    const test = line ? line+' '+word : word;
    if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line,x,cy); line=word; cy+=lineHeight; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, cy);
  return cy + lineHeight;
}

// Crea el panel de misiones completo (letrero + panel abierto).
export function initMissionsBoard({ THREE, onExit, onPlanetCompleted }) {
  const progress = loadProgress();
  let activePlanet = frontierPlanet(progress);
  let currentMissions = buildMissionsForPlanet(activePlanet);
  let selectedMissionIdx = 0;
  let puzzle = null; // se arma en selectMission()

  // ── Letrero de pared (vista desde la mesa) ──────────────────────────
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 700; signCanvas.height = 900;
  const signCtx = signCanvas.getContext('2d');
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8,2.4), new THREE.MeshBasicMaterial({ map:signTex }));
  wallMesh.name = 'missionsWallSign';

  // Dibuja el letrero de la pared.
  function drawSign() {
    const g = signCtx, W = signCanvas.width, H = signCanvas.height;
    g.clearRect(0,0,W,H);
    g.fillStyle = 'rgba(4,10,20,0.97)'; g.fillRect(0,0,W,H);
    g.strokeStyle = 'rgba(60,190,255,0.85)'; g.lineWidth = 5; g.strokeRect(8,8,W-16,H-16);

    g.fillStyle = 'rgba(150,210,255,0.75)'; g.font = '600 30px system-ui,Arial';
    g.fillText('PANEL DE', 46, 90);
    g.fillStyle = '#eafcff'; g.font = '800 60px system-ui,Arial';
    g.fillText('MISIONES', 46, 155);
    g.strokeStyle = 'rgba(60,190,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(46,185); g.lineTo(W-46,185); g.stroke();

    const total = (progress[activePlanet]||[]).length || PLANET_MISSION_COUNT[activePlanet] || 0;
    const done = (progress[activePlanet]||[]).filter(Boolean).length;
    g.fillStyle = 'rgba(150,210,255,0.7)'; g.font = '600 26px system-ui,Arial';
    g.fillText('MISIÓN ACTUAL', 46, 260);
    g.fillStyle = '#eafcff'; g.font = '800 46px system-ui,Arial';
    g.fillText(PLANET_LABEL[activePlanet] || activePlanet.toUpperCase(), 46, 320);
    g.fillStyle = 'rgba(220,240,255,0.8)'; g.font = '400 28px system-ui,Arial';
    g.fillText(`${done}/${total} completadas`, 46, 365);

    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(46,400,W-92,20);
    g.fillStyle = '#4da3ff'; g.fillRect(46,400,(W-92)*(total?done/total:0),20);

    g.font = '600 20px system-ui,Arial';
    MISSION_ORDER.forEach((id,i)=>{
      const col = i % 3, row = Math.floor(i/3);
      const x = 46 + col*205, y = 470 + row*70;
      const unlocked = isUnlocked(id, progress);
      const complete = planetComplete(id, progress);
      g.fillStyle = complete ? 'rgba(82,224,138,0.18)' : unlocked ? 'rgba(77,163,255,0.14)' : 'rgba(255,255,255,0.04)';
      g.fillRect(x,y,190,54);
      g.strokeStyle = complete ? '#52e08a' : unlocked ? '#4da3ff' : 'rgba(255,255,255,0.15)';
      g.lineWidth = 2; g.strokeRect(x,y,190,54);
      g.fillStyle = complete ? '#52e08a' : unlocked ? '#eafcff' : 'rgba(255,255,255,0.35)';
      g.fillText((complete?'✓ ':unlocked?'':'🔒 ') + (PLANET_LABEL[id]||id), x+12, y+34);
    });

    g.fillStyle = 'rgba(150,210,255,0.85)'; g.font = '700 30px system-ui,Arial'; g.textAlign='center';
    g.fillText('TOCA PARA ENTRAR', W/2, H-40);
    g.textAlign = 'start';
    signTex.needsUpdate = true;
  }

  // ── Panel abierto (vista al acercarse) ──────────────────────────────
  const BW = 1700, BH = 1000;
  const DIVIDER_X = 660;
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BW; boardCanvas.height = BH;
  const bctx = boardCanvas.getContext('2d');
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.88), new THREE.MeshBasicMaterial({ map:boardTex }));
  boardMesh.name = 'missionsBoardOpen';

  const EXIT_ZONE = { x:24, y:24, w:150, h:56 };
  // Devuelve el área clickeable de una fila de la lista.
  function listRowZone(row) { return { x:24, y:190 + row*108, w:DIVIDER_X-48, h:92 }; }

  const PZ_LEFT = DIVIDER_X + 40;   // borde izquierdo del área de herramienta
  const PZ_RIGHT = BW - 40;
  const PZ_TOP = 280;               // debajo del título + texto de la misión

  // Arma el puzzle de la misión elegida.
  function selectMission(idx) {
    selectedMissionIdx = idx;
    const m = currentMissions[idx];
    const alreadyDone = !!(progress[activePlanet] || [])[idx];

    if (m.type === 'wires') {
      puzzle = {
        type:'wires', m, n:m.n,
        rightOrder: shuffled(m.n),
        leftConnected: new Array(m.n).fill(alreadyDone),
        rightConnected: new Array(m.n).fill(alreadyDone),
        connections: alreadyDone ? Array.from({length:m.n},(_,i)=>({leftRow:i,rightRow:i})) : [],
        selectedLeftRow: -1, wrongFlash: null, completed: alreadyDone,
      };
    } else if (m.type === 'sequence') {
      puzzle = {
        type:'sequence', m, n:m.n, order:m.order,
        progressCount: alreadyDone ? m.n : 0,
        wrongIdx: -1, completed: alreadyDone,
      };
    } else if (m.type === 'dial') {
      const targets = Array.from({length:m.n}, ()=> (1+Math.floor(Math.random()*9))*10); // múltiplos de 10, 10-90
      puzzle = {
        type:'dial', m, n:m.n, targets,
        values: alreadyDone ? targets.slice() : new Array(m.n).fill(50),
        locked: new Array(m.n).fill(alreadyDone), completed: alreadyDone,
      };
    } else { // match
      const pairs = m.n;
      const symbols = SYMBOLS.slice(0, pairs);
      const deck = shuffled(pairs*2).map(i => symbols[i % pairs]);
      puzzle = {
        type:'match', m, n:pairs,
        cards: deck.map(sym => ({ sym, revealed:alreadyDone, matched:alreadyDone })),
        firstPick: -1, wrongPair: null, completed: alreadyDone,
      };
    }
  }

  // Dibuja la lista de misiones a la izquierda.
  function drawList(g) {
    g.fillStyle = 'rgba(150,210,255,0.75)'; g.font = '600 24px system-ui,Arial';
    g.fillText('MISIONES · ' + (PLANET_LABEL[activePlanet]||activePlanet.toUpperCase()), 24, 60);
    const doneCount = (progress[activePlanet]||[]).filter(Boolean).length;
    g.fillStyle = 'rgba(220,240,255,0.6)'; g.font = '400 22px system-ui,Arial';
    g.fillText(`${doneCount}/${currentMissions.length} completadas`, 24, 92);

    currentMissions.forEach((m,row)=>{
      const z = listRowZone(row);
      const complete = !!(progress[activePlanet]||[])[row];
      const selected = row === selectedMissionIdx;
      g.fillStyle = selected ? 'rgba(77,163,255,0.22)' : complete ? 'rgba(82,224,138,0.12)' : 'rgba(255,255,255,0.05)';
      g.fillRect(z.x,z.y,z.w,z.h);
      g.strokeStyle = selected ? '#4da3ff' : complete ? '#52e08a' : 'rgba(255,255,255,0.18)';
      g.lineWidth = selected ? 3 : 2; g.strokeRect(z.x,z.y,z.w,z.h);
      g.fillStyle = complete ? '#52e08a' : '#eafcff'; g.font = '700 24px system-ui,Arial';
      g.fillText((complete?'✓ ':'')+m.title, z.x+16, z.y+36);
      g.fillStyle = 'rgba(210,235,255,0.55)'; g.font = '400 16px system-ui,Arial';
      g.fillText(MECHANIC_LABEL[m.type], z.x+16, z.y+62);
    });

    g.fillStyle = 'rgba(210,235,255,0.55)'; g.font = '400 20px system-ui,Arial';
    const idx = MISSION_ORDER.indexOf(activePlanet);
    const next = MISSION_ORDER[idx+1];
    if (next) {
      const msg = doneCount>=currentMissions.length
        ? `¡Planeta completado! ${PLANET_LABEL[next]} desbloqueado.`
        : `Completá todas para desbloquear ${PLANET_LABEL[next]}.`;
      wrapText(g, msg, 24, BH-50, DIVIDER_X-48, 26);
    }
  }

  // Dibuja el botón de salir y el título de la misión elegida.
  function drawHeader(g) {
    g.fillStyle = 'rgba(255,70,70,0.14)'; g.fillRect(EXIT_ZONE.x,EXIT_ZONE.y,EXIT_ZONE.w,EXIT_ZONE.h);
    g.strokeStyle = 'rgba(255,110,110,0.85)'; g.lineWidth = 2; g.strokeRect(EXIT_ZONE.x,EXIT_ZONE.y,EXIT_ZONE.w,EXIT_ZONE.h);
    g.fillStyle = '#ffd0d0'; g.font = '700 24px system-ui,Arial';
    g.fillText('✕ SALIR', EXIT_ZONE.x+22, EXIT_ZONE.y+37);

    g.strokeStyle = 'rgba(60,190,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(DIVIDER_X,24); g.lineTo(DIVIDER_X,BH-24); g.stroke();

    if (!puzzle) return;
    g.fillStyle = '#eafcff'; g.font = '800 32px system-ui,Arial';
    g.fillText(puzzle.m.title, PZ_LEFT, 100);
    g.fillStyle = 'rgba(210,235,255,0.85)'; g.font = '400 21px system-ui,Arial';
    wrapText(g, puzzle.m.briefing, PZ_LEFT, 145, PZ_RIGHT-PZ_LEFT, 28);
  }

  // Dibuja la barra de progreso de la misión.
  function progressBar(g, done, total) {
    const barY = BH - 70;
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(PZ_LEFT,barY,PZ_RIGHT-PZ_LEFT,18);
    g.fillStyle = '#4da3ff'; g.fillRect(PZ_LEFT,barY,(PZ_RIGHT-PZ_LEFT)*(total?done/total:0),18);
    g.fillStyle = 'rgba(220,240,255,0.85)'; g.font = '600 20px system-ui,Arial';
    g.fillText(`${done}/${total}`, PZ_LEFT, barY+45);
  }

  // Dibuja el aviso de misión completada.
  function completedBanner(g) {
    if (!puzzle.completed) return;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(DIVIDER_X,0,BW-DIVIDER_X,BH);
    g.fillStyle = '#52e08a'; g.font = '800 36px system-ui,Arial'; g.textAlign='center';
    g.fillText('¡MISIÓN COMPLETADA!', DIVIDER_X+(BW-DIVIDER_X)/2, BH/2);
    g.textAlign = 'start';
  }

  // Devuelve dónde va cada terminal de cables.
  function nodePosWires(row) {
    return {
      left:  { x: PZ_LEFT+70,  y: PZ_TOP + row*78 },
      right: { x: PZ_RIGHT-70, y: PZ_TOP + row*78 },
    };
  }
  // Dibuja el puzzle de conectar cables.
  function drawWires(g) {
    g.strokeStyle = 'rgba(150,210,255,0.5)'; g.font = '400 18px system-ui,Arial';
    puzzle.connections.forEach(({leftRow,rightRow})=>{
      const a = nodePosWires(leftRow).left, b = nodePosWires(rightRow).right;
      g.strokeStyle = WIRE_COLORS[leftRow]; g.lineWidth = 7; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(a.x,a.y); g.bezierCurveTo(a.x+90,a.y,b.x-90,b.y,b.x,b.y); g.stroke();
      g.globalAlpha = 1;
    });
    if (puzzle.wrongFlash) {
      const a = nodePosWires(puzzle.wrongFlash.leftRow).left, b = nodePosWires(puzzle.wrongFlash.rightRow).right;
      g.strokeStyle = '#ff4040'; g.lineWidth = 7; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(a.x,a.y); g.bezierCurveTo(a.x+90,a.y,b.x-90,b.y,b.x,b.y); g.stroke();
      g.globalAlpha = 1;
    }
    for (let row=0; row<puzzle.n; row++) {
      const p = nodePosWires(row).left, color = WIRE_COLORS[row];
      const connected = puzzle.leftConnected[row], selected = puzzle.selectedLeftRow === row;
      g.beginPath(); g.arc(p.x,p.y,38,0,Math.PI*2);
      g.fillStyle = connected ? color : 'rgba(255,255,255,0.06)'; g.fill();
      g.lineWidth = selected?5:3; g.strokeStyle = selected?'#ffffff':color; g.stroke();
      if (!connected) { g.fillStyle=color; g.beginPath(); g.arc(p.x,p.y,13,0,Math.PI*2); g.fill(); }
    }
    for (let row=0; row<puzzle.n; row++) {
      const p = nodePosWires(row).right, color = WIRE_COLORS[puzzle.rightOrder[row]];
      const connected = puzzle.rightConnected[row];
      g.beginPath(); g.arc(p.x,p.y,38,0,Math.PI*2);
      g.fillStyle = connected ? color : 'rgba(255,255,255,0.06)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = color; g.stroke();
      if (!connected) { g.fillStyle=color; g.beginPath(); g.arc(p.x,p.y,13,0,Math.PI*2); g.fill(); }
    }
    progressBar(bctx, puzzle.connections.length, puzzle.n);
  }
  // Procesa un toque sobre el puzzle de cables.
  function hitWires(px, py) {
    const hitSide = (side) => {
      for (let row=0; row<puzzle.n; row++) {
        const p = nodePosWires(row)[side];
        if (Math.hypot(px-p.x, py-p.y) <= 38) return row;
      }
      return -1;
    };
    const leftRow = hitSide('left');
    if (leftRow>=0 && !puzzle.leftConnected[leftRow]) { puzzle.selectedLeftRow = leftRow; return true; }
    const rightRow = hitSide('right');
    if (rightRow>=0 && !puzzle.rightConnected[rightRow] && puzzle.selectedLeftRow>=0) {
      if (puzzle.selectedLeftRow === puzzle.rightOrder[rightRow]) {
        puzzle.leftConnected[puzzle.selectedLeftRow] = true;
        puzzle.rightConnected[rightRow] = true;
        puzzle.connections.push({leftRow:puzzle.selectedLeftRow, rightRow});
        puzzle.selectedLeftRow = -1;
        if (puzzle.connections.length === puzzle.n) completeCurrentMission();
      } else {
        puzzle.wrongFlash = {leftRow:puzzle.selectedLeftRow, rightRow};
        puzzle.selectedLeftRow = -1;
        drawBoard();
        setTimeout(()=>{ puzzle.wrongFlash=null; drawBoard(); }, 420);
      }
      return true;
    }
    return false;
  }

  // Devuelve dónde va cada botón de la secuencia.
  function seqButtonPos(n, i) {
    const cols = Math.min(n, 4);
    const rows = Math.ceil(n/cols);
    const col = i % cols, row = Math.floor(i/cols);
    const cellW = (PZ_RIGHT-PZ_LEFT)/cols, cellH = 110;
    return { x: PZ_LEFT + cellW*col + cellW/2, y: PZ_TOP + 40 + row*cellH };
  }
  // Dibuja el puzzle de secuencia.
  function drawSequence(g) {
    for (let i=0; i<puzzle.n; i++) {
      const p = seqButtonPos(puzzle.n, i);
      const label = i+1;
      const done = puzzle.order.indexOf(label) < puzzle.progressCount;
      const isWrong = puzzle.wrongIdx === i;
      g.beginPath(); g.roundRect(p.x-44,p.y-38,88,76,12);
      g.fillStyle = isWrong ? 'rgba(255,64,64,0.35)' : done ? 'rgba(82,224,138,0.28)' : 'rgba(255,255,255,0.06)';
      g.fill();
      g.strokeStyle = isWrong ? '#ff4040' : done ? '#52e08a' : 'rgba(150,210,255,0.6)';
      g.lineWidth = 3; g.stroke();
      g.fillStyle = done ? '#52e08a' : '#eafcff'; g.font = '800 30px system-ui,Arial'; g.textAlign='center';
      g.fillText(String(label), p.x, p.y+11);
      g.textAlign = 'start';
    }
    g.fillStyle = 'rgba(210,235,255,0.6)'; g.font = '400 20px system-ui,Arial';
    g.fillText(`Siguiente paso: ${puzzle.progressCount < puzzle.n ? (puzzle.progressCount+1)+'/'+puzzle.n : '¡listo!'}`, PZ_LEFT, PZ_TOP-15);
    progressBar(bctx, puzzle.progressCount, puzzle.n);
  }
  // Procesa un toque sobre el puzzle de secuencia.
  function hitSequence(px, py) {
    for (let i=0; i<puzzle.n; i++) {
      const p = seqButtonPos(puzzle.n, i);
      if (px>=p.x-44 && px<=p.x+44 && py>=p.y-38 && py<=p.y+38) {
        const label = i+1;
        const expected = puzzle.order[puzzle.progressCount];
        if (label === expected) {
          puzzle.progressCount++;
          if (puzzle.progressCount === puzzle.n) completeCurrentMission();
        } else {
          puzzle.wrongIdx = i;
          drawBoard();
          setTimeout(()=>{ puzzle.wrongIdx = -1; drawBoard(); }, 350);
        }
        return true;
      }
    }
    return false;
  }

  // Calcula cuántas columnas de diales entran.
  function dialLayout(n) {
    const cols = Math.min(n, 3);
    const cellW = (PZ_RIGHT-PZ_LEFT)/cols;
    return { cols, cellW };
  }
  // Devuelve la posición de un dial y sus botones +/-.
  function dialZones(i) {
    const { cols, cellW } = dialLayout(puzzle.n);
    const col = i % cols, row = Math.floor(i/cols);
    const cx = PZ_LEFT + cellW*col + cellW/2, cy = PZ_TOP + 60 + row*170;
    return {
      cx, cy,
      minus:{ x:cx-90, y:cy, r:34 },
      plus:{ x:cx+90, y:cy, r:34 },
    };
  }
  // Dibuja el puzzle de diales.
  function drawDial(g) {
    for (let i=0; i<puzzle.n; i++) {
      const { cx, cy, minus, plus } = dialZones(i);
      const locked = puzzle.locked[i];
      // Aguja
      g.beginPath(); g.arc(cx,cy,55,0,Math.PI*2);
      g.fillStyle = locked ? 'rgba(82,224,138,0.15)' : 'rgba(255,255,255,0.05)'; g.fill();
      g.strokeStyle = locked ? '#52e08a' : 'rgba(150,210,255,0.6)'; g.lineWidth = 3; g.stroke();
      const ang = -Math.PI/2 + (puzzle.values[i]/100)*Math.PI*2*0.75 - Math.PI*0.75;
      g.strokeStyle = locked ? '#52e08a' : '#4da3ff'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx+Math.cos(ang)*42, cy+Math.sin(ang)*42); g.stroke();
      g.fillStyle = '#eafcff'; g.font = '700 22px system-ui,Arial'; g.textAlign='center';
      g.fillText(String(puzzle.values[i]), cx, cy+80);
      g.fillStyle = 'rgba(210,235,255,0.6)'; g.font = '400 16px system-ui,Arial';
      g.fillText('objetivo: '+puzzle.targets[i], cx, cy+100);
      g.textAlign='start';

      if (!locked) {
        [minus,plus].forEach((z,bi)=>{
          g.beginPath(); g.arc(z.x,z.y,z.r,0,Math.PI*2);
          g.fillStyle = 'rgba(77,163,255,0.2)'; g.fill();
          g.strokeStyle = '#4da3ff'; g.lineWidth = 2; g.stroke();
          g.fillStyle = '#eafcff'; g.font = '800 26px system-ui,Arial'; g.textAlign='center';
          g.fillText(bi===0?'–':'+', z.x, z.y+9);
          g.textAlign='start';
        });
      }
    }
    progressBar(bctx, puzzle.locked.filter(Boolean).length, puzzle.n);
  }
  // Procesa un toque sobre el puzzle de diales.
  function hitDial(px, py) {
    for (let i=0; i<puzzle.n; i++) {
      if (puzzle.locked[i]) continue;
      const { minus, plus } = dialZones(i);
      let delta = 0;
      if (Math.hypot(px-minus.x,py-minus.y) <= minus.r) delta = -10;
      else if (Math.hypot(px-plus.x,py-plus.y) <= plus.r) delta = 10;
      if (delta !== 0) {
        puzzle.values[i] = Math.max(0, Math.min(100, puzzle.values[i]+delta));
        if (puzzle.values[i] === puzzle.targets[i]) {
          puzzle.locked[i] = true;
          if (puzzle.locked.every(Boolean)) completeCurrentMission();
        }
        return true;
      }
    }
    return false;
  }

  // Devuelve dónde va cada tarjeta de memoria.
  function matchCardZone(i) {
    const cols = Math.min(puzzle.n, 4);
    const cardW = 110, cardH = 130, gapX = 24, gapY = 24;
    const totalW = cols*cardW + (cols-1)*gapX;
    const startX = PZ_LEFT + ((PZ_RIGHT-PZ_LEFT)-totalW)/2;
    const col = i % cols, row = Math.floor(i/cols);
    return { x: startX + col*(cardW+gapX), y: PZ_TOP + row*(cardH+gapY), w:cardW, h:cardH };
  }
  // Dibuja el puzzle de emparejar tarjetas.
  function drawMatch(g) {
    puzzle.cards.forEach((c,i)=>{
      const z = matchCardZone(i);
      const shown = c.revealed || c.matched;
      g.beginPath(); g.roundRect(z.x,z.y,z.w,z.h,10);
      g.fillStyle = c.matched ? 'rgba(82,224,138,0.2)' : shown ? 'rgba(77,163,255,0.22)' : 'rgba(255,255,255,0.06)';
      g.fill();
      g.strokeStyle = c.matched ? '#52e08a' : 'rgba(150,210,255,0.6)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = shown ? '#eafcff' : 'rgba(150,210,255,0.35)';
      g.font = '800 40px system-ui,Arial'; g.textAlign='center';
      g.fillText(shown ? c.sym : '?', z.x+z.w/2, z.y+z.h/2+14);
      g.textAlign='start';
    });
    const matchedCount = puzzle.cards.filter(c=>c.matched).length/2;
    progressBar(bctx, matchedCount, puzzle.n);
  }
  // Procesa un toque sobre el puzzle de emparejar.
  function hitMatch(px, py) {
    for (let i=0; i<puzzle.cards.length; i++) {
      const c = puzzle.cards[i];
      if (c.matched || c.revealed) continue;
      const z = matchCardZone(i);
      if (px>=z.x && px<=z.x+z.w && py>=z.y && py<=z.y+z.h) {
        c.revealed = true;
        if (puzzle.firstPick === -1) {
          puzzle.firstPick = i;
        } else {
          const first = puzzle.cards[puzzle.firstPick];
          if (first.sym === c.sym) {
            first.matched = true; c.matched = true;
            puzzle.firstPick = -1;
            if (puzzle.cards.every(cd=>cd.matched)) completeCurrentMission();
          } else {
            puzzle.wrongPair = [puzzle.firstPick, i];
            drawBoard();
            setTimeout(()=>{
              first.revealed = false; c.revealed = false;
              puzzle.wrongPair = null; puzzle.firstPick = -1;
              drawBoard();
            }, 550);
          }
        }
        return true;
      }
    }
    return false;
  }

  const MECHANIC_LABEL = { wires:'Conectar cables', sequence:'Secuencia', dial:'Calibrar diales', match:'Emparejar' };
  const MECHANIC = {
    wires:    { draw:drawWires,    hit:hitWires },
    sequence: { draw:drawSequence, hit:hitSequence },
    dial:     { draw:drawDial,     hit:hitDial },
    match:    { draw:drawMatch,    hit:hitMatch },
  };

  // Redibuja el panel abierto completo.
  function drawBoard() {
    const g = bctx;
    g.clearRect(0,0,BW,BH);
    g.fillStyle = 'rgba(4,10,20,0.97)'; g.fillRect(0,0,BW,BH);
    g.strokeStyle = 'rgba(60,190,255,0.85)'; g.lineWidth = 5; g.strokeRect(8,8,BW-16,BH-16);

    drawHeader(g);
    drawList(g);
    if (puzzle) MECHANIC[puzzle.type].draw(g);
    if (puzzle) completedBanner(g);

    boardTex.needsUpdate = true;
  }

  // Marca la misión actual como completada y guarda el progreso.
  function completeCurrentMission() {
    puzzle.completed = true;
    if (!progress[activePlanet]) progress[activePlanet] = new Array(currentMissions.length).fill(false);
    progress[activePlanet][selectedMissionIdx] = true;
    saveProgress(progress);
    if (planetComplete(activePlanet, progress) && typeof onPlanetCompleted === 'function') {
      onPlanetCompleted(activePlanet);
    }
  }

  // Muestra el panel abierto y oculta el letrero.
  function show() {
    activePlanet = frontierPlanet(progress);
    currentMissions = buildMissionsForPlanet(activePlanet);
    selectMission(0);
    drawBoard();
    boardMesh.visible = true;
    wallMesh.visible = false;
  }
  // Oculta el panel abierto y muestra el letrero.
  function hide() {
    boardMesh.visible = false;
    wallMesh.visible = true;
    drawSign();
  }
  hide();
  drawSign();

  // Procesa un toque sobre el letrero.
  function handleWallHit(hit) {
    return !!hit;
  }

  // Procesa un toque sobre el panel abierto.
  function handleBoardHit(hit) {
    if (!hit?.uv) return false;
    const px = hit.uv.x * BW, py = (1 - hit.uv.y) * BH;

    if (px>=EXIT_ZONE.x && px<=EXIT_ZONE.x+EXIT_ZONE.w && py>=EXIT_ZONE.y && py<=EXIT_ZONE.y+EXIT_ZONE.h) {
      if (typeof onExit === 'function') onExit();
      return 'exit';
    }

    if (px < DIVIDER_X) {
      for (let row=0; row<currentMissions.length; row++) {
        const z = listRowZone(row);
        if (px>=z.x && px<=z.x+z.w && py>=z.y && py<=z.y+z.h) {
          if (row !== selectedMissionIdx) { selectMission(row); drawBoard(); }
          return true;
        }
      }
      return false;
    }

    if (!puzzle || puzzle.completed) return false;
    const acted = MECHANIC[puzzle.type].hit(px, py);
    if (acted) drawBoard();
    return acted;
  }

  return { wallMesh, boardMesh, show, hide, handleWallHit, handleBoardHit };
}

// Dice si un planeta ya tiene todas sus misiones completas.
export function isPlanetShipMissionsComplete(planetId) {
  const progress = loadProgress();
  return planetComplete(planetId, progress);
}
