export const APP_BASE = String(window.APP_BASE || "").replace(/\/$/, "");
export const ENDPOINT = `${APP_BASE}/actions/chat-astronauta.php`;

export const MAX_BUBBLES            = 20;
export const PANEL_CANVAS_W         = 1400;
export const PANEL_CANVAS_H         = 1220;
export const PANEL_DISTANCE_DEFAULT = 1.85;
export const PANEL_DISTANCE_MIN     = 0.7;
export const PANEL_DISTANCE_MAX     = 3.5;
export const PINCH_ON               = 0.03;
export const PINCH_OFF              = 0.04;

/* ═══════════════════════════════════════════════════════════
   COLORES DEL PANEL POR PLANETA
   ───────────────────────────────────────────────────────────
   Cada planeta le da un tinte distinto al panel de chat cuando
   se habla de él (colores de encabezado, burbujas y acento).
   El astronauta que flota junto al panel es siempre el mismo
   sprite (ver ASTRONAUT_SPRITE más abajo).
═══════════════════════════════════════════════════════════ */
export const PLANET_ENVIRONMENTS = {
  sun:     { panel: { headerBg:'#1a0a00', headerText:'#ffd060', bubbleBot:'#2a1500', bubbleUser:'#7c3500', accentColor:'#ff9020', talkBg:'#c45000' } },
  mercury: { panel: { headerBg:'#1a1a1a', headerText:'#d0d0d0', bubbleBot:'#222222', bubbleUser:'#444444', accentColor:'#b0b0b0', talkBg:'#555555' } },
  venus:   { panel: { headerBg:'#1a1200', headerText:'#f0d890', bubbleBot:'#261b00', bubbleUser:'#4a3000', accentColor:'#e8c060', talkBg:'#7a5000' } },
  earth:   { panel: { headerBg:'#001a2e', headerText:'#7ec8e3', bubbleBot:'#00263d', bubbleUser:'#004d70', accentColor:'#4a9fd4', talkBg:'#0077a8' } },
  mars:    { panel: { headerBg:'#1a0500', headerText:'#ff8060', bubbleBot:'#260800', bubbleUser:'#5a1500', accentColor:'#c1440e', talkBg:'#8a2000' } },
  jupiter: { panel: { headerBg:'#1a0f00', headerText:'#f0b060', bubbleBot:'#261500', bubbleUser:'#4a2800', accentColor:'#c88b3a', talkBg:'#8a5500' } },
  saturn:  { panel: { headerBg:'#1a1800', headerText:'#f0e890', bubbleBot:'#262200', bubbleUser:'#4a4000', accentColor:'#e4d191', talkBg:'#8a7800' } },
  uranus:  { panel: { headerBg:'#001a1a', headerText:'#80f0f0', bubbleBot:'#002222', bubbleUser:'#004444', accentColor:'#7de8e8', talkBg:'#006060' } },
  neptune: { panel: { headerBg:'#000a2e', headerText:'#8090f0', bubbleBot:'#000f3d', bubbleUser:'#001a6e', accentColor:'#4b70dd', talkBg:'#0030a0' } },
  // Respaldo por si se pide un planeta sin entrada propia arriba.
  default: { panel: { headerBg:'#0B1220', headerText:'#FFFFFF', bubbleBot:'#1a2236', bubbleUser:'#1e3a5f', accentColor:'#4a9fd4', talkBg:'#10B981' } },
};

// El astronauta es el mismo sprite en todas las misiones.
export const ASTRONAUT_SPRITE = {
  url: `${APP_BASE}/assets/img/astronaut.png`,
  size: 0.95,
  opacity: 1.0,
};

export const ASTRONAUT_SIDE_OFFSET = { x: -1.22, y: 0.08, z: 0.04 };
export const ASTRONAUT_SCALE_MULT  = 1.0;

export const HIT_ZONES = Object.freeze({
  exit:      { x:48,   y:42,   w:230,  h:80  },
  settings:  { x:804,  y:42,   w:80,   h:80  },
  recenter:  { x:900,  y:42,   w:352,  h:80  },
  header:    { x:18,   y:18,   w:1364, h:140 },
  grab:      { x:1275, y:42,   w:80,   h:80  },
  expedition:{ x:48,   y:150,  w:1304, h:64  },
  chat:      { x:48,   y:148,  w:1304, h:760 },
  textInput: { x:48,   y:918,  w:1100, h:80  },
  sendBtn:   { x:1158, y:918,  w:194,  h:80  },
  talk:      { x:48,   y:1010, w:1304, h:96  },
});

/* Voces disponibles para la astronauta (mismos ids que usa el backend TTS) */
export const VOICES = [
  { id: 'nova',    label: 'Nova' },
  { id: 'alloy',   label: 'Alloy' },
  { id: 'echo',    label: 'Echo' },
  { id: 'fable',   label: 'Fable' },
  { id: 'onyx',    label: 'Onyx' },
  { id: 'shimmer', label: 'Shimmer' },
];

/* Vista de AJUSTES dibujada dentro del propio panel 3D — funciona en VR sin
   depender de dom-overlay (que no todos los navegadores/visores soportan).
   Es la ÚNICA vista de ajustes de la app: se usa tanto en escritorio como en
   VR, para que la experiencia sea idéntica y no dependa de que la sesión XR
   ya esté "presenting" en el momento exacto del clic. */
export const SETTINGS_ZONES = Object.freeze({
  langEs:     { x:48,  y:250, w:300, h:84 },
  langEn:     { x:368, y:250, w:300, h:84 },
  sfxOn:      { x:48,  y:410, w:300, h:84 },
  sfxOff:     { x:368, y:410, w:300, h:84 },
  voice:      { x:48,  y:570, w:620, h:84 },
  back:       { x:48,  y:712, w:1304, h:96 },
});
