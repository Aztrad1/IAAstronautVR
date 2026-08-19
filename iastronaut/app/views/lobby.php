<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
  <title>IA Astronaut VR — Sistema Solar</title>
  <link rel="stylesheet" href="<?= asset('css/lobby.css') ?>">
  <link rel="stylesheet" href="<?= asset('css/vr.css') ?>">
</head>
<body>
<script>
  window.APP_BASE = "<?= e(app_base_path()) ?>";

  /* Config compartida entre el lobby y la misión. El planeta seleccionado
     se asigna dinámicamente cuando arranca una misión (ver lobbyScene.js:
     enterMission). */
  window.ASTRO_CONFIG = {
    cameraActive : false,
    voice        : 'nova',
    lang         : 'es',
    sfx          : true,
    selectedPlanet: null,
  };
</script>

<canvas id="lobbyCanvas"></canvas>

<!-- HUD superpuesto del lobby -->
<div id="lobbyHUD">
  <div id="lobbyTitle">
    <div class="eyebrow">IA ASTRONAUT VR</div>
    <div class="main-title">SISTEMA <span>SOLAR</span></div>
    <div class="subtitle">Selecciona un planeta para explorar</div>
  </div>
  <div id="planetHoverLabel">
    <div class="p-name"></div>
    <div class="p-desc"></div>
  </div>
  <div id="lobbyHint">Haz click en un planeta para iniciar la misión</div>
</div>

<!-- Overlay para warp (el canvas del warp se crea dinámicamente encima).
     Se reutiliza tanto para "entrar" como para "salir" de una misión. -->
<div id="launchOverlay"></div>

<!-- HUD de casco de astronauta (visor) — oculto hasta que arranca una misión -->
<div id="helmetHUD" style="display:none;">
  <div class="visor-vignette"></div>
  <div class="visor-glare"></div>

  <div class="visor-top">
    <svg viewBox="0 0 1100 130" preserveAspectRatio="none">
      <path d="M0,0 L1100,0 L1100,50 Q550,112 0,50 Z" fill="rgba(8,16,26,0.55)"/>
      <path d="M40,54 Q550,110 1060,54" stroke="#00e5ff" stroke-width="4" fill="none" opacity="0.85"/>
      <path d="M40,62 Q550,120 1060,62" stroke="#7fffd4" stroke-width="2" fill="none" opacity="0.45"/>
    </svg>
  </div>

  <div class="visor-chin-l">
    <svg viewBox="0 0 260 200" preserveAspectRatio="none">
      <path d="M0,200 L0,60 Q40,0 140,10 L260,50 L260,200 Z" fill="rgba(10,18,28,0.6)" stroke="rgba(127,232,255,0.28)" stroke-width="2"/>
      <circle cx="42" cy="150" r="4" fill="rgba(127,232,255,0.55)"/>
      <circle cx="96" cy="172" r="4" fill="rgba(127,232,255,0.55)"/>
    </svg>
  </div>
  <div class="visor-chin-r">
    <svg viewBox="0 0 260 200" preserveAspectRatio="none">
      <path d="M0,200 L0,60 Q40,0 140,10 L260,50 L260,200 Z" fill="rgba(10,18,28,0.6)" stroke="rgba(127,232,255,0.28)" stroke-width="2"/>
      <circle cx="42" cy="150" r="4" fill="rgba(127,232,255,0.55)"/>
      <circle cx="96" cy="172" r="4" fill="rgba(127,232,255,0.55)"/>
    </svg>
  </div>

  <div class="hud-corner left">
    <b id="hudMissionName">MISIÓN · SISTEMA SOLAR</b>
    <span id="hudMissionTime">T+ 00:00</span>
  </div>
  <div class="hud-corner right">
    <b id="hudPlanetName">—</b>
    <span id="hudCoords">LAT 00.0 · LON 00.0</span>
  </div>

  <div class="hud-readout left" id="hudOxygen">
    <span class="r-label">Oxígeno</span>
    <span class="r-value"><span id="hudOxygenVal">98</span>%</span>
    <span class="r-bar"><i id="hudOxygenBar" style="width:98%"></i></span>
  </div>

  <div class="hud-readout right" id="hudPower">
    <span class="r-label">Energía traje</span>
    <span class="r-value"><span id="hudPowerVal">87</span>%</span>
    <span class="r-bar"><i id="hudPowerBar" style="width:87%"></i></span>
  </div>
</div>


<!-- Three.js -->
<script type="importmap">
  { "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }}
</script>
<script type="module">
  import * as THREE from "three";
  import { VRButton } from "three/addons/webxr/VRButton.js";
  import { Reflector } from "three/addons/objects/Reflector.js";
  import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
  import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
  window.THREE = THREE;
  window.VRButton = VRButton;
  window.Reflector = Reflector;
  window.XRControllerModelFactory = XRControllerModelFactory;
  window.XRHandModelFactory = XRHandModelFactory;
</script>
<script type="module" src="<?= asset('js/lobby/lobbyScene.js') ?>"></script>


<!-- HUD de casco: oxígeno, energía, timer de misión, + visibilidad del visor.
     Antes esto arrancaba una sola vez al cargar vr.php; ahora arranca/reinicia
     cada vez que comienza una misión (astro:missionstart), y el visor solo se
     muestra cuando hay misión activa Y no estamos presentando en el casco
     (dentro del casco el propio visor ya "es" el HUD 3D). -->
<script>
  (function () {
    var elMissionTime = document.getElementById('hudMissionTime');
    var elPlanetName  = document.getElementById('hudPlanetName');
    var elCoords      = document.getElementById('hudCoords');
    var elOxyVal      = document.getElementById('hudOxygenVal');
    var elOxyBar      = document.getElementById('hudOxygenBar');
    var elOxyBox      = document.getElementById('hudOxygen');
    var elPowVal      = document.getElementById('hudPowerVal');
    var elPowBar      = document.getElementById('hudPowerBar');
    var helmet        = document.getElementById('helmetHUD');

    var missionActive = false;
    var xrPresenting   = false;
    function updateHelmetVisibility(){
      helmet.style.display = (missionActive && !xrPresenting) ? '' : 'none';
    }

    var startT = Date.now();
    var oxygen = 98, power = 87;
    var timerHandle = null;

    function fmtTime(ms) {
      var s = Math.floor(ms / 1000);
      var m = Math.floor(s / 60);
      s = s % 60;
      return 'T+ ' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    function tick(){
      elMissionTime.textContent = fmtTime(Date.now() - startT);

      oxygen -= 0.06 + Math.random() * 0.05;
      if (oxygen < 34) oxygen = 96 + Math.random() * 3;
      elOxyVal.textContent = Math.round(oxygen);
      elOxyBar.style.width = Math.max(0, oxygen) + '%';
      elOxyBox.classList.toggle('warn', oxygen < 30);

      power += (Math.random() - 0.52) * 0.4;
      power = Math.max(20, Math.min(100, power));
      elPowVal.textContent = Math.round(power);
      elPowBar.style.width = power + '%';
      document.getElementById('hudPower').classList.toggle('warn', power < 25);
    }

    window.addEventListener('astro:missionstart', function (e) {
      missionActive = true;
      var planet = e.detail && e.detail.planet;
      elPlanetName.textContent = planet && planet.name ? planet.name.toUpperCase() : 'ESPACIO PROFUNDO';
      elCoords.textContent = 'LAT ' + (Math.random()*90).toFixed(1) + '° · LON ' + (Math.random()*180).toFixed(1) + '°';
      startT = Date.now();
      oxygen = 98; power = 87;
      if (timerHandle) clearInterval(timerHandle);
      timerHandle = setInterval(tick, 1000);
      updateHelmetVisibility();
    });
    window.addEventListener('astro:missionend', function () {
      missionActive = false;
      updateHelmetVisibility();
    });
    window.addEventListener('astro:vrstart', function () { xrPresenting = true;  updateHelmetVisibility(); });
    window.addEventListener('astro:vrend',   function () { xrPresenting = false; updateHelmetVisibility(); });
  })();
</script>

</body>
</html>
