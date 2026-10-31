/* Tablero Forte · dos diseños con la foto de tu Forte:
   "Inicio Forte" (pantalla de inicio clara de día y oscura de noche) y
   "Neón Forte" (paneles azules; el carro de lado parado y en el camino al avanzar). */
(function () {
'use strict';
const F = window.F, K = F.K;
const ui = new Proxy({}, { get: (_, k) => F.ui[k] });   // ui.js carga después
const n = (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toFixed(d);
const clamp = F.clamp;
const img = src => { const i = new Image(); i.src = src; return i; };
const FRENTE = img('forte_frente.webp'), LADO = img('forte_lado.webp'), ATRAS = img('car_rear.webp');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = () => { const d = new Date(); return `${DIAS[d.getDay()]} · ${d.getDate()} ${MESES[d.getMonth()]}`; };
const hora = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const rumbo = h => h == null ? '—' : `${['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(((h % 360) + 360) % 360 / 45) % 8]} ${Math.round(h)}°`;
const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
const media = a => { if (window.OBD && OBD.media) OBD.media(a); else ui.toast('Los controles de música funcionan en la app'); };
const abrir = u => { if (window.OBD && OBD.openUrl) OBD.openUrl(u); else window.open(u, '_blank', 'noopener'); };
const I = {
  nav: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  musica: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  gas: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M7 8h5"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  viaje: '<path d="M4 19h16M6 15l4-6 4 3 4-7"/>',
  apps: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  prev: '<path d="M6 5v14M19 5l-10 7 10 7z"/>', play: '<path d="M7 5l12 7-12 7z"/>', next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  motor: '<path d="M4 10h3l2-3h5v3h3l2 2v5h-2v2H8l-2-2H4z"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>', tesla: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 12h16"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

/* ======================================================================
   INICIO FORTE
   ====================================================================== */
let iniRoot = null, iniT = 0;
const $i = k => iniRoot && iniRoot.querySelector(`[data-v="${k}"]`);
F.SKINS.splice(2, 0, {
  id: 'inicio', name: 'Inicio Forte', kind: 'dom', group: 'Con tu Forte',
  mount(host) {
    iniRoot = document.createElement('div'); iniRoot.className = 'ini';
    iniRoot.innerHTML = `
<section class="heroI">
  <div class="hTop">
    <div><div class="hHora" data-v="hora">--:--</div><div class="hFecha" data-v="fecha"></div></div>
    <div class="hMarca"><small>KIA</small><b>FORTE</b><i>— 2020</i><span class="pill" data-v="modo">Modo día</span></div>
  </div>
  <div class="hEsc"><img class="hCar" src="forte_frente.webp" alt="Tu Kia Forte"><img class="hRef" src="forte_frente.webp" alt=""><div class="hSom"></div></div>
  <div class="hVel"><b data-v="vel">0</b><span>km/h<small data-v="velSrc">OBD</small></span><div class="hBar"><i data-v="velBar"></i></div></div>
  <div class="hDat"><span>Gasolina <b data-v="gas">—</b></span><span>Motor <b data-v="mot">—</b></span><span>Batería <b data-v="bat">—</b></span><span>Autonomía <b data-v="aut">—</b></span></div>
</section>
<section class="colI">
  <button type="button" class="tGrande" data-a="nav"><i class="ic azul">${svg('nav')}</i><span><b>Navegar</b><small>Google Maps</small></span>${svg('flecha')}</button>
  <div class="tFila">
    <button type="button" data-a="musica"><i class="ic azul">${svg('musica')}</i><small>Música</small></button>
    <button type="button" data-a="gas"><i class="ic nar">${svg('gas')}</i><small>Gasolinera</small></button>
    <button type="button" data-a="viaje"><i class="ic ver">${svg('viaje')}</i><small>Viaje</small></button>
  </div>
  <button type="button" class="tLinea" data-a="tesla">${svg('tesla')}<span>Vista de manejo</span>${svg('flecha')}</button>
  <button type="button" class="tLinea" data-a="disenos">${svg('apps')}<span>Todos los diseños</span>${svg('flecha')}</button>
  <div class="tMusica"><i class="ic azul">${svg('musica')}</i><span><b>Música</b><small>Bluetooth del teléfono</small></span>
    <button type="button" data-a="prev" aria-label="Anterior">${svg('prev')}</button><button type="button" class="play" data-a="play" aria-label="Reproducir o pausar">${svg('play')}</button><button type="button" data-a="next" aria-label="Siguiente">${svg('next')}</button></div>
</section>`;
    host.appendChild(iniRoot);
    iniRoot.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'nav') abrir('https://www.google.com/maps/@?api=1&map_action=map');
      else if (a === 'musica') ui.open('musica');
      else if (a === 'gas') F.nav ? (F.nav.activo() ? F.nav.parar(true) : F.nav.gas()) : ui.open('gasolineras');
      else if (a === 'viaje') ui.open('viaje');
      else if (a === 'tesla') ui.setSkin('tesla');
      else if (a === 'disenos') ui.open('disenos');
      else media(a);
    }));
    iniT = 1; this.frame(F.V, 1);
  },
  unmount() { if (iniRoot) iniRoot.remove(); iniRoot = null; },
  frame(V, dt) {
    if (!iniRoot) return;
    iniT += dt; if (iniT < .25) return; iniT = 0;
    const noche = F.isNight ? F.isNight() : false;
    iniRoot.dataset.modo = noche ? 'noche' : 'dia';
    $i('hora').textContent = hora(); $i('fecha').textContent = fecha();
    $i('modo').textContent = noche ? 'Modo noche' : 'Modo día';
    $i('vel').textContent = Math.round(V.speed || 0);
    $i('velSrc').textContent = F.conn && F.conn.kind === 'ok' ? 'OBD' : F.gps && !F.gps.sim ? 'GPS' : F.sim ? 'demo' : 'sin datos';
    $i('velBar').style.width = clamp((V.speed || 0) / 160 * 100, 0, 100) + '%';
    $i('gas').textContent = V.fuel == null ? '—' : `${n(V.fuel)} %`;
    $i('mot').textContent = V.coolant == null ? '—' : `${n(V.coolant)}°`;
    $i('bat').textContent = V.volt == null ? '—' : `${n(V.volt, 1)} V`;
    $i('aut').textContent = V.range == null ? '—' : `${n(V.range)} km`;
  },
  back(c, w, h) { c.fillStyle = '#e9edf2'; c.fillRect(0, 0, w, h); },
  draw(c) {
    K.rr(c, 30, 30, 980, 560, 40); c.fillStyle = '#f6f8fb'; c.fill();
    if (FRENTE.complete && FRENTE.naturalWidth) c.drawImage(FRENTE, 200, 170, 620, 386);
    K.txt(c, '19:47', 80, 110, 80, '#111', 'left', 700);
    K.txt(c, '48 km/h', 80, 540, 52, '#2f6bff', 'left', 800);
    [[1050, 30, 520, 150, '#16223a'], [1050, 200, 160, 150, '#fff'], [1230, 200, 160, 150, '#fff'], [1410, 200, 160, 150, '#fff'], [1050, 380, 520, 90, '#fff'], [1050, 490, 520, 100, '#fff']]
      .forEach(([x, y, w, h, col]) => { K.rr(c, x, y, w, h, 26); c.fillStyle = col; c.fill(); });
  }
});

/* ======================================================================
   NEÓN FORTE
   ====================================================================== */
let neoRoot = null, neoT = 0, cv = null, cx = null, obs = null, mov = 0, fase = 0, mapaCv = null;
const $n = k => neoRoot && neoRoot.querySelector(`[data-v="${k}"]`);
F.SKINS.splice(3, 0, {
  id: 'neon', name: 'Neón Forte', kind: 'dom', group: 'Con tu Forte',
  mount(host) {
    neoRoot = document.createElement('div'); neoRoot.className = 'neo';
    neoRoot.innerHTML = `
<div class="nCol">
  <section class="nCard nVel">
    <svg viewBox="0 0 120 120" class="nGauge" aria-hidden="true"><circle cx="60" cy="60" r="48" class="trk"/><circle cx="60" cy="60" r="48" class="arc" data-v="arc"/></svg>
    <div class="nNum"><b data-v="vel">0</b><small>km/h</small></div>
    <dl><dt>Rumbo</dt><dd data-v="rumbo">—</dd><dt>Clima</dt><dd data-v="clima">—</dd><dt>GPS</dt><dd data-v="gps">—</dd></dl>
  </section>
  <section class="nCard nMapa"><canvas data-v="mapa"></canvas><span class="nN">N</span></section>
  <section class="nCard nViaje">
    <div class="fila"><span>Viaje</span><b data-v="viaje">0.0 km</b><button type="button" data-a="reset" aria-label="Reiniciar viaje">↺</button></div>
    <div class="fila"><span>Cambio de aceite</span><b data-v="aceite">—</b></div>
    <div class="barra"><i data-v="aceiteBar"></i></div>
    <button type="button" class="nBtn" data-a="aceite">Ya cambié el aceite</button>
  </section>
</div>
<div class="nCol nDer">
  <section class="nCard nCarro">
    <div class="nTit"><span>Kia Forte 2020 · Urban Gray</span><span><b data-v="saludo"></b> · <b data-v="hora"></b></span></div>
    <canvas data-v="escena"></canvas>
    <span class="nModo" data-v="modo">Estacionado</span>
  </section>
  <div class="nAbajo">
    <section class="nCard nMus"><span class="ic">${svg('musica')}</span><div><b>Música</b><small>Bluetooth del teléfono</small><div class="ctrl"><button type="button" data-a="prev" aria-label="Anterior">${svg('prev')}</button><button type="button" class="play" data-a="play" aria-label="Reproducir o pausar">${svg('play')}</button><button type="button" data-a="next" aria-label="Siguiente">${svg('next')}</button></div></div></section>
    <section class="nCard nMot"><span class="ic">${svg('motor')}</span><div><b>Motor</b><small><span data-v="mot">—</span> · <span data-v="bat">—</span></small><small><span data-v="gas">—</span> gasolina · <span data-v="kml">—</span></small></div></section>
  </div>
</div>
<nav class="nBotones">
  <button type="button" data-a="tel">${svg('tel')}<span>Teléfono</span></button>
  <button type="button" data-a="mapas">${svg('nav')}<span>Mapas</span></button>
  <button type="button" data-a="musica">${svg('musica')}<span>Música</span></button>
  <button type="button" data-a="gas">${svg('gas')}<span>Gasolinera</span></button>
  <button type="button" data-a="ajustes">${svg('ajustes')}<span>Ajustes</span></button>
</nav>`;
    host.appendChild(neoRoot);
    cv = $n('escena'); cx = cv.getContext('2d'); mapaCv = $n('mapa');
    const ajustar = () => {
      for (const c of [cv, mapaCv]) { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); c.width = Math.max(10, Math.round(r.width * d)); c.height = Math.max(10, Math.round(r.height * d)); }
    };
    obs = new ResizeObserver(ajustar); obs.observe(cv); obs.observe(mapaCv); ajustar();
    neoRoot.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'reset') { F.resetTrip(); ui.toast('Viaje en cero'); }
      else if (a === 'aceite') ui.open('aceite');
      else if (a === 'tel') abrir('tel:');
      else if (a === 'mapas') abrir('https://www.google.com/maps/@?api=1&map_action=map');
      else if (a === 'musica') ui.open('musica');
      else if (a === 'gas') F.nav ? (F.nav.activo() ? F.nav.parar(true) : F.nav.gas()) : ui.open('gasolineras');
      else if (a === 'ajustes') ui.open();
      else media(a);
    }));
    neoT = 1; this.frame(F.V, 1);
  },
  unmount() { if (obs) obs.disconnect(); if (neoRoot) neoRoot.remove(); neoRoot = null; },
  frame(V, dt) {
    if (!neoRoot) return;
    escena(V, dt);
    neoT += dt; if (neoT < .25) return; neoT = 0;
    $n('vel').textContent = Math.round(V.speed || 0);
    $n('arc').style.strokeDashoffset = String(301.6 * (1 - .75 * clamp((V.speed || 0) / 200, 0, 1)));
    $n('rumbo').textContent = rumbo(V.heading);
    $n('clima').textContent = V.weather ? `${n(V.weather.temp)}° ${V.weather.text.toLowerCase()}` : 'sin datos';
    const gps = F.gps && !F.gps.sim;
    $n('gps').textContent = gps ? 'Conectado' : F.sim ? 'Demo' : 'Buscando';
    $n('gps').className = gps || F.sim ? 'ok' : '';
    $n('viaje').textContent = `${n(V.tripKm, 1)} km`;
    const falta = F.oil ? Math.max(0, F.oil.intervalo - F.oil.km) : null;
    $n('aceite').textContent = falta == null ? '—' : `${Math.round(falta)} km`;
    $n('aceiteBar').style.width = `${clamp(V.oilPct || 0, 0, 100)}%`;
    $n('aceiteBar').classList.toggle('bajo', (V.oilPct || 0) < 10);
    $n('saludo').textContent = `${saludo()}, ${F.cfg.nombre || 'José Luis'}`;
    $n('hora').textContent = hora();
    $n('mot').textContent = V.coolant == null ? '—' : `${n(V.coolant)} °C`;
    $n('bat').textContent = V.volt == null ? '—' : `${n(V.volt, 1)} V`;
    $n('gas').textContent = V.fuel == null ? '—' : `${n(V.fuel)} %`;
    $n('kml').textContent = V.kml == null ? '—' : `${n(V.kml, 1)} km/L`;
    $n('modo').textContent = mov > .5 ? 'Manejando' : 'Estacionado';
    mapa(V);
  },
  back(c, w, h) { c.fillStyle = '#030a1f'; c.fillRect(0, 0, w, h); },
  draw(c) {
    const box = (x, y, w, h) => { K.rr(c, x, y, w, h, 22); c.fillStyle = 'rgba(14,40,110,.65)'; c.fill(); c.strokeStyle = '#2f7bff'; c.lineWidth = 3; c.stroke(); };
    box(30, 30, 470, 200); box(30, 250, 470, 150); box(30, 420, 470, 170); box(530, 30, 1040, 380); box(530, 430, 510, 160); box(1060, 430, 510, 160);
    if (LADO.complete && LADO.naturalWidth) c.drawImage(LADO, 720, 90, 640, 326);
    K.txt(c, '64', 160, 140, 90, '#fff', 'center', 700);
  }
});

// la escena grande: estacionado = tu Forte de lado; manejando = tu Forte de atrás en un camino neón
function escena(V, dt) {
  if (!cx || !cv.width) return;
  const W = cv.width, H = cv.height, c = cx;
  mov += (((V.speed || 0) > 3 ? 1 : 0) - mov) * Math.min(1, dt * 2.5);
  fase = (fase + (V.speed || 0) / 3.6 * dt * .9) % 1;
  c.clearRect(0, 0, W, H);
  const fondo = c.createRadialGradient(W * .55, H * .55, 10, W * .5, H * .6, W * .7);
  fondo.addColorStop(0, '#12348f'); fondo.addColorStop(.55, '#061a52'); fondo.addColorStop(1, '#020a24');
  c.fillStyle = fondo; c.fillRect(0, 0, W, H);
  const hz = H * .42;
  // piso en perspectiva
  c.save(); c.strokeStyle = 'rgba(80,150,255,.22)'; c.lineWidth = Math.max(1, W / 900);
  for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(W / 2 + i * W * .02, hz); c.lineTo(W / 2 + i * W * .22, H); c.stroke(); }
  for (let k = 0; k < 9; k++) { const t = ((k + (mov > .5 ? fase * 1 : 0)) % 9) / 9, y = hz + (H - hz) * t * t; c.globalAlpha = t; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.restore();
  // camino neón cuando se maneja
  if (mov > .02) {
    c.save(); c.globalAlpha = mov; c.shadowColor = '#3d8bff'; c.shadowBlur = W / 60;
    c.strokeStyle = '#4f9bff'; c.lineWidth = Math.max(2, W / 260);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(W / 2 + s * W * .04, hz); c.lineTo(W / 2 + s * W * .48, H); c.stroke(); }
    c.fillStyle = '#9fd0ff';
    for (let k = 0; k < 8; k++) {
      const t0 = ((k + fase * 2) % 8) / 8, t1 = t0 + .05, y0 = hz + (H - hz) * t0 * t0, y1 = hz + (H - hz) * t1 * t1;
      for (const s of [-1, 1]) { const x0 = W / 2 + s * W * .16 * t0 * t0 * 1.3, x1 = W / 2 + s * W * .16 * t1 * t1 * 1.3; c.beginPath(); c.moveTo(x0 - 2, y0); c.lineTo(x1 - 3, y1); c.lineTo(x1 + 3, y1); c.lineTo(x0 + 2, y0); c.fill(); }
    }
    c.restore();
  }
  // tu Forte: sombra, reflejo y la foto
  const dibuja = (im, alpha, ancho, cyBase) => {
    if (!im.complete || !im.naturalWidth || alpha < .02) return;
    const w = ancho, h = w * im.naturalHeight / im.naturalWidth, x = W / 2 - w / 2, y = cyBase - h;
    c.save(); c.globalAlpha = alpha;
    const sg = c.createRadialGradient(W / 2, cyBase, 4, W / 2, cyBase, w * .55);
    sg.addColorStop(0, 'rgba(0,0,0,.65)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.beginPath(); c.ellipse(W / 2, cyBase - h * .02, w * .55, h * .1, 0, 0, Math.PI * 2); c.fill();
    // luz azul de piso
    const lg = c.createRadialGradient(W / 2, cyBase, 4, W / 2, cyBase, w * .7);
    lg.addColorStop(0, 'rgba(70,140,255,.35)'); lg.addColorStop(1, 'rgba(70,140,255,0)');
    c.fillStyle = lg; c.beginPath(); c.ellipse(W / 2, cyBase, w * .75, h * .22, 0, 0, Math.PI * 2); c.fill();
    // reflejo en el piso
    c.save(); c.globalAlpha = alpha * .22; c.translate(0, cyBase * 2 - h * .02); c.scale(1, -1); c.drawImage(im, x, y, w, h); c.restore();
    c.filter = 'brightness(.92) saturate(1.05)';
    c.shadowColor = 'rgba(80,150,255,.55)'; c.shadowBlur = W / 70;
    c.drawImage(im, x, y, w, h);
    c.restore();
  };
  dibuja(LADO, 1 - mov, Math.min(W * .56, H * 1.25), H * .92);
  dibuja(ATRAS, mov, Math.min(W * .25, H * .62), H * .97);
}
// mini mapa: tu recorrido con la flecha según el rumbo
function mapa(V) {
  const c = mapaCv && mapaCv.getContext('2d'); if (!c) return;
  const W = mapaCv.width, H = mapaCv.height;
  c.clearRect(0, 0, W, H);
  c.strokeStyle = 'rgba(80,150,255,.18)'; c.lineWidth = 1;
  const p = Math.max(14, W / 14);
  for (let x = (W / 2) % p; x < W; x += p) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = (H / 2) % p; y < H; y += p) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  const R = F.trip && F.trip.ruta || [], g = F.gps;
  if (g && R.length > 1) {
    const esc = Math.min(W, H) / .02;   // ~2 km de lado a lado
    c.save(); c.strokeStyle = '#4f9bff'; c.lineWidth = Math.max(2, W / 120); c.shadowColor = '#3d8bff'; c.shadowBlur = 8; c.beginPath();
    R.slice(-400).forEach(([la, lo], i) => { const x = W / 2 + (lo - g.lon) * esc * Math.cos(la * Math.PI / 180), y = H / 2 - (la - g.lat) * esc; i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke(); c.restore();
  }
  c.save(); c.translate(W / 2, H / 2); c.rotate(((V.heading || 0) * Math.PI) / 180);
  const s = Math.max(10, Math.min(W, H) * .12);
  c.fillStyle = '#ffffff'; c.shadowColor = '#7fb4ff'; c.shadowBlur = 12;
  c.beginPath(); c.moveTo(0, -s); c.lineTo(s * .7, s * .8); c.lineTo(0, s * .4); c.lineTo(-s * .7, s * .8); c.closePath(); c.fill();
  c.restore();
}

/* ---- estilos ---- */
const css = document.createElement('style');
css.textContent = `
/* ---------- Inicio Forte ---------- */
.ini{position:absolute;inset:0;display:grid;grid-template-columns:1.62fr 1fr;gap:12px;padding:56px max(14px,env(safe-area-inset-right,0px)) 14px max(14px,env(safe-area-inset-left,0px));
  --bg:#e9edf2;--card:#ffffff;--ink:#121722;--mute:#6c7686;--line:rgba(16,24,40,.08);--acc:#2f6bff;
  background:var(--bg);color:var(--ink);font-family:var(--font);transition:background .6s,color .6s}
.ini[data-modo="noche"]{--bg:#05080f;--card:#121a28;--ink:#eef2f8;--mute:#8592a8;--line:rgba(255,255,255,.07);--acc:#3d86ff}
.heroI{position:relative;border-radius:24px;overflow:hidden;min-height:0;
  background:radial-gradient(120% 90% at 50% 100%,#ffffff 0%,#eef1f6 45%,#dfe4ec 100%);box-shadow:0 10px 30px rgba(20,30,50,.08)}
.ini[data-modo="noche"] .heroI{background:radial-gradient(70% 60% at 50% 72%,#22324f 0%,#0e1626 55%,#070b14 100%);box-shadow:none;border:1px solid var(--line)}
.hTop{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;padding:clamp(10px,3vh,18px) clamp(12px,2.6vw,22px);z-index:3}
.hHora{font-size:clamp(30px,10vh,56px);font-weight:700;line-height:1;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.hFecha{font-size:clamp(10px,2.6vh,13px);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin-top:4px}
.hMarca{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:1px}
.hMarca small{font-size:10px;letter-spacing:.4em;color:var(--mute);font-weight:700}
.hMarca b{font-size:clamp(14px,4vh,20px);letter-spacing:.32em;font-weight:600}
.hMarca i{font-style:normal;font-size:11px;color:var(--mute);letter-spacing:.1em}
.pill{margin-top:5px;font-size:10px;font-weight:700;padding:3px 8px;border-radius:99px;background:var(--line);color:var(--mute)}
.hEsc{position:absolute;inset:0;z-index:1}
.hCar{position:absolute;left:50%;bottom:17%;height:50%;max-width:66%;object-fit:contain;transform:translateX(-50%);filter:drop-shadow(0 18px 18px rgba(0,0,0,.18));transition:filter .6s}
.ini[data-modo="noche"] .hCar{filter:brightness(.82) contrast(1.08) drop-shadow(0 0 22px rgba(70,130,255,.25))}
.hRef{position:absolute;left:50%;bottom:17%;height:50%;max-width:66%;object-fit:contain;transform:translateX(-50%) scaleY(-1);transform-origin:50% 100%;opacity:.12;
  -webkit-mask-image:linear-gradient(to top,rgba(0,0,0,.9),transparent 38%);mask-image:linear-gradient(to top,rgba(0,0,0,.9),transparent 38%);pointer-events:none}
.ini[data-modo="noche"] .hRef{opacity:.28;filter:brightness(.7) saturate(1.3)}
.hSom{position:absolute;left:50%;bottom:15.5%;width:min(58%,480px);height:6%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.35),transparent)}
.ini[data-modo="noche"] .hSom{background:radial-gradient(closest-side,rgba(0,0,0,.6),transparent)}
.hVel{position:absolute;left:clamp(10px,2.4vw,18px);bottom:clamp(10px,2.6vh,16px);z-index:3;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:16px;background:var(--card);box-shadow:0 6px 18px rgba(20,30,50,.1)}
.ini[data-modo="noche"] .hVel{box-shadow:none;border:1px solid var(--line)}
.hVel b{font-size:clamp(24px,8vh,40px);color:var(--acc);font-weight:800;line-height:1;font-variant-numeric:tabular-nums;min-width:1.4em;text-align:right}
.hVel span{font-size:12px;font-weight:700;display:flex;flex-direction:column;line-height:1.1}
.hVel small{font-size:9px;color:var(--mute);letter-spacing:.1em;text-transform:uppercase}
.hBar{display:none;width:clamp(60px,14vw,150px);height:5px;border-radius:3px;background:var(--line);overflow:hidden}
.ini[data-modo="noche"] .hBar{display:block}
.hBar i{display:block;height:100%;background:var(--acc);border-radius:3px;transition:width .3s}
.hDat{position:absolute;right:clamp(10px,2.4vw,18px);bottom:clamp(12px,3vh,20px);z-index:3;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:clamp(10px,2.5vh,12px);color:var(--mute)}
.hDat b{color:var(--ink);font-weight:700}
.colI{display:grid;grid-template-rows:auto minmax(0,1fr) auto auto auto;gap:10px;min-height:0}
.colI button{font:inherit;color:inherit;border:0;cursor:pointer}
.tGrande,.tLinea,.tMusica,.tFila button{background:var(--card);border-radius:18px;box-shadow:0 6px 18px rgba(20,30,50,.06);border:1px solid var(--line)!important}
.ini[data-modo="noche"] .tGrande{background:linear-gradient(135deg,#16233b,#0f1828)}
.ini:not([data-modo="noche"]) .tGrande{background:#172238;color:#fff}
.tGrande{display:flex;align-items:center;gap:12px;padding:12px 14px;text-align:left}
.tGrande span{flex:1;display:flex;flex-direction:column}
.tGrande b{font-size:clamp(14px,4vh,18px)}
.tGrande small{font-size:11px;opacity:.7}
.tGrande>svg,.tLinea>svg:last-child{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;opacity:.6}
.ic{width:clamp(32px,9vh,42px);height:clamp(32px,9vh,42px);border-radius:12px;display:grid;place-items:center;flex:none}
.ic svg{width:58%;height:58%;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ic.azul{background:#2f6bff}.ic.nar{background:#ff8a1f}.ic.ver{background:#20b26b}
.tFila{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tFila button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px 4px}
.tFila small{font-size:11px;font-weight:600;color:var(--mute)}
.tLinea{display:flex;align-items:center;gap:10px;padding:9px 14px;font-size:13px;font-weight:600;text-align:left}
.tLinea span{flex:1}
.tLinea>svg:first-child{width:18px;height:18px;fill:none;stroke:var(--acc);stroke-width:2}
.tMusica{display:flex;align-items:center;gap:8px;padding:8px 10px;min-height:0}
.tMusica span{flex:1;min-width:0;display:flex;flex-direction:column}
.tMusica b{font-size:13px}.tMusica small{font-size:10px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tMusica button{width:34px;height:34px;border-radius:50%;background:transparent;display:grid;place-items:center}
.tMusica button svg{width:16px;height:16px;fill:var(--ink);stroke:none}
.tMusica button.play{background:var(--acc)}
.tMusica button.play svg{fill:#fff}
body[data-skin="inicio"] #musicBar{display:none}
@media (max-height:380px){.tLinea{padding:6px 12px}.colI{gap:7px}}

/* ---------- Neón Forte ---------- */
.neo{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2.15fr);grid-template-rows:minmax(0,1fr) auto;gap:10px;
  padding:54px max(12px,env(safe-area-inset-right,0px)) 10px max(12px,env(safe-area-inset-left,0px));color:#e6f0ff;font-family:var(--font);
  background:radial-gradient(90% 80% at 60% 40%,#0b2366 0%,#051440 50%,#020820 100%)}
.nCol{display:grid;gap:10px;min-height:0;grid-template-rows:1.15fr 1fr 1.2fr}
.nDer{grid-template-rows:minmax(0,2.2fr) minmax(0,1fr)}
.nCard{position:relative;min-height:0;border-radius:16px;background:linear-gradient(160deg,rgba(28,70,170,.42),rgba(8,24,72,.6));border:1.5px solid rgba(70,140,255,.75);
  box-shadow:0 0 14px rgba(47,123,255,.35),inset 0 0 18px rgba(47,123,255,.12);overflow:hidden}
.nVel{display:flex;align-items:center;gap:6px;padding:6px 10px}
.nGauge{height:92%;aspect-ratio:1;flex:none;transform:rotate(135deg)}
.nGauge circle{fill:none;stroke-width:9;stroke-linecap:round}
.nGauge .trk{stroke:rgba(80,150,255,.18);stroke-dasharray:226.2 301.6}
.nGauge .arc{stroke:#4f9bff;stroke-dasharray:301.6;stroke-dashoffset:301.6;filter:drop-shadow(0 0 4px #3d8bff);transition:stroke-dashoffset .3s}
.nNum{position:absolute;left:10px;top:0;bottom:0;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.nNum b{font-size:clamp(20px,8vh,36px);font-weight:700;line-height:1;text-shadow:0 0 10px #3d8bff}
.nNum small{font-size:10px;color:#9fc2ff}
.nVel dl{margin:0;display:grid;grid-template-columns:auto;gap:0;font-size:clamp(10px,2.6vh,12px);min-width:0}
.nVel dt{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#7fa6e8}
.nVel dd{margin:0 0 2px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nVel dd.ok{color:#3dff8b}
.nMapa canvas{position:absolute;inset:0;width:100%;height:100%}
.nN{position:absolute;right:8px;top:6px;font-size:10px;font-weight:800;color:#7fb4ff;border:1px solid #4f9bff;border-radius:50%;width:18px;height:18px;display:grid;place-items:center}
.nViaje{padding:6px 10px;display:flex;flex-direction:column;justify-content:center;gap:3px;font-size:clamp(10px,2.6vh,12px)}
.nViaje .fila{display:flex;align-items:center;gap:6px}
.nViaje .fila span{flex:1;color:#7fa6e8;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
.nViaje .fila b{font-size:clamp(13px,3.6vh,17px)}
.nViaje .fila button{width:24px;height:24px;border-radius:50%;border:1px solid #4f9bff;background:transparent;color:#cfe2ff;font:inherit;cursor:pointer;padding:0}
.nViaje .barra{height:5px;border-radius:3px;background:rgba(80,150,255,.18);overflow:hidden}
.nViaje .barra i{display:block;height:100%;background:#3dff8b;box-shadow:0 0 6px #3dff8b}
.nViaje .barra i.bajo{background:#ff4a4a;box-shadow:0 0 6px #ff4a4a}
.nBtn{margin-top:2px;height:26px;border-radius:9px;border:1px solid #4f9bff;background:rgba(47,123,255,.15);color:#e6f0ff;font:inherit;font-size:11px;font-weight:700;cursor:pointer}
.nCarro canvas{position:absolute;inset:0;width:100%;height:100%}
.nTit{position:absolute;left:0;right:0;top:0;z-index:2;display:flex;justify-content:space-between;gap:8px;padding:7px 12px;font-size:clamp(10px,2.6vh,12px);color:#cfe2ff}
.nTit span:first-child{padding:2px 8px;border-radius:7px;border:1px solid rgba(79,155,255,.6);background:rgba(4,16,48,.5)}
.nModo{position:absolute;right:10px;bottom:8px;z-index:2;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#7fb4ff}
.nAbajo{display:grid;grid-template-columns:1fr 1fr;gap:10px;min-height:0}
.nMus,.nMot{display:flex;align-items:center;gap:10px;padding:6px 12px}
.nMus .ic,.nMot .ic{width:clamp(30px,9vh,40px);height:clamp(30px,9vh,40px);border-radius:12px;background:rgba(47,123,255,.25);border:1px solid #4f9bff}
.nMus>div,.nMot>div{min-width:0;display:flex;flex-direction:column}
.nMus b,.nMot b{font-size:13px}
.nMus small,.nMot small{font-size:10px;color:#9fc2ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nMus .ctrl{display:flex;flex-direction:row;gap:6px;margin-top:3px}
.nMus .ctrl button{width:28px;height:28px;border-radius:50%;border:1px solid #4f9bff;background:transparent;display:grid;place-items:center;cursor:pointer;padding:0}
.nMus .ctrl button svg{width:13px;height:13px;fill:#cfe2ff}
.nMus .ctrl .play{background:#2f6bff;box-shadow:0 0 8px #2f6bff}
.nBotones{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.nBotones button{height:clamp(34px,10vh,44px);display:flex;align-items:center;justify-content:center;gap:6px;border-radius:12px;border:1.5px solid rgba(70,140,255,.75);
  background:linear-gradient(180deg,rgba(28,70,170,.5),rgba(8,24,72,.7));color:#e6f0ff;font:inherit;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 0 10px rgba(47,123,255,.3)}
.nBotones svg{width:16px;height:16px;fill:none;stroke:#7fb4ff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nBotones button:active,.nCard button:active{background:rgba(47,123,255,.45)}
body[data-skin="neon"] #musicBar{display:none}
@media (max-width:640px){.nBotones span{display:none}}`;
document.head.appendChild(css);
})();
