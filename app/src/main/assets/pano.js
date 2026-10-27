/* Tablero Forte · diseño "Azul Panorámico" (SVG + HTML) */
(function () {
'use strict';
const F = window.F;
const NS = 'http://www.w3.org/2000/svg';
const TPL = `<svg viewBox="0 0 1600 620" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <radialGradient id="p_gBody" cx="50%" cy="46%" r="64%">
      <stop offset="0" stop-color="#1a4fc4"/><stop offset=".32" stop-color="#0c2878"/>
      <stop offset=".72" stop-color="#05113c"/><stop offset="1" stop-color="#020617"/>
    </radialGradient>
    <linearGradient id="p_gFloor" gradientUnits="userSpaceOnUse" x1="0" y1="330" x2="0" y2="620">
      <stop offset="0" stop-color="#4a86ff" stop-opacity="0"/><stop offset="1" stop-color="#4a86ff" stop-opacity=".5"/>
    </linearGradient>
    <linearGradient id="p_gBar" x1="0" x2="1">
      <stop offset="0" stop-color="#7fb4ff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#7fb4ff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="p_gSpd" gradientUnits="userSpaceOnUse" x1="250" y1="590" x2="510" y2="70">
      <stop offset="0" stop-color="#1d4dff"/><stop offset="1" stop-color="#9fd8ff"/>
    </linearGradient>
    <linearGradient id="p_gRpm" gradientUnits="userSpaceOnUse" x1="1350" y1="590" x2="1090" y2="70">
      <stop offset="0" stop-color="#1d4dff"/><stop offset="1" stop-color="#9fd8ff"/>
    </linearGradient>
    <linearGradient id="p_gTemp" x1="0" x2="1"><stop offset="0" stop-color="#3b8cff"/><stop offset="1" stop-color="#9fd8ff"/></linearGradient>
    <linearGradient id="p_gCar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d95ff" stop-opacity=".35"/><stop offset="1" stop-color="#5d95ff" stop-opacity=".05"/></linearGradient>
    <clipPath id="p_cBody"><path d="M90 14H1510Q1586 14 1586 90V530Q1586 606 1510 606H90Q14 606 14 530V90Q14 14 90 14Z"/></clipPath>
  </defs>

  <!-- Bisel y fondo -->
  <path d="M90 14H1510Q1586 14 1586 90V530Q1586 606 1510 606H90Q14 606 14 530V90Q14 14 90 14Z" fill="url(#p_gBody)"/>
  <g clip-path="url(#p_cBody)" id="p_floor" stroke="url(#p_gFloor)" stroke-width="1.5" fill="none"></g>
  <path d="M90 14H1510Q1586 14 1586 90V530Q1586 606 1510 606H90Q14 606 14 530V90Q14 14 90 14Z" fill="none" stroke="#5f86d8" stroke-width="3"/>
  <path d="M92 22H1508Q1578 22 1578 92" fill="none" stroke="#c8dbff" stroke-opacity=".35" stroke-width="2"/>

  <!-- Barra de luz bajo la velocidad -->
  <ellipse cx="800" cy="172" rx="230" ry="16" fill="#4a86ff" opacity=".25"/>
  <rect x="580" y="169" width="440" height="5" rx="2.5" fill="url(#p_gBar)"/>

  <!-- Arcos -->
  <g id="p_ticks"></g>
  <path id="p_spdGlow" fill="none" stroke="#2f7bff" stroke-opacity=".35" stroke-width="36" stroke-linecap="round"/>
  <path id="p_spdVal" fill="none" stroke="url(#p_gSpd)" stroke-width="16" stroke-linecap="round"/>
  <path id="p_rpmGlow" fill="none" stroke="#2f7bff" stroke-opacity=".35" stroke-width="36" stroke-linecap="round"/>
  <path id="p_rpmVal" fill="none" stroke="url(#p_gRpm)" stroke-width="16" stroke-linecap="round"/>

  <!-- Silueta de sedán (propia) -->
  <g transform="translate(1135 298) scale(.86)" stroke="#9cc3ff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="112" cy="72" rx="118" ry="7" fill="#2f7bff" opacity=".35" stroke="none"/>
    <path d="M6 58 L12 47 Q24 41 58 38 L90 21 Q100 16 120 16 L148 16 Q163 17 176 29 L192 38 Q212 41 216 50 L216 60 L190 60 M156 60 L70 60 M36 60 L6 60 Z" fill="url(#p_gCar)"/>
    <path d="M70 37 L94 23 Q101 19 118 19 L146 19 Q156 20 167 31 L170 37 Z" fill="#0a1b4a" stroke-width="1.6"/>
    <path d="M122 19 L120 37" stroke-width="1.6"/>
    <circle cx="53" cy="60" r="14" fill="#061133"/><circle cx="53" cy="60" r="6"/>
    <circle cx="173" cy="60" r="14" fill="#061133"/><circle cx="173" cy="60" r="6"/>
  </g>

  <!-- Testigos -->
  <g transform="translate(305 408)">
    <g id="p_lampEng" class="lamp" fill="none" stroke="#ffb02e" stroke-width="2.6" stroke-linejoin="round">
      <path d="M2 10h5v-4h12l3 4h5v4h3v-3h3v12h-3v-3h-3v6h-6l-3 3H9l-2-3H2z"/>
    </g>
    <g id="p_lampBat" class="lamp" transform="translate(52 0)" fill="none" stroke="#ff3b45" stroke-width="2.6" stroke-linejoin="round">
      <rect x="2" y="8" width="30" height="20" rx="2"/><path d="M8 8V4h5v4M21 8V4h5v4M8 18h6M21 18h6M24 15v6"/>
    </g>
    <g id="p_lampTmp" class="lamp" transform="translate(104 0)" fill="none" stroke="#ff3b45" stroke-width="2.6" stroke-linecap="round">
      <path d="M17 4v16"/><circle cx="17" cy="24" r="5"/><path d="M17 8h7M17 13h7M5 31q3-3 6 0t6 0 6 0 6 0"/>
    </g>
  </g>

  <!-- Barras de temperatura y combustible -->
  <g id="p_tempBar"></g>
  <g id="p_fuelBar"></g>
</svg>


<div class="ov clock" style="--x:600;--y:64" id="p_clock">--:--</div>
<div class="ov amb" style="--x:1000;--y:64" id="p_amb">--.- °C</div>
<div class="ov speed" style="--x:800;--y:96" id="p_speed">0</div>
<div class="ov kmh" style="--x:800;--y:150">KM/H</div>

<div class="ov stack" style="--x:365;--y:255">
  <span class="lbl">Consumo instantáneo</span>
  <span class="bigv" id="p_kml">—<small>km/L</small></span>
  <span class="lbl" id="p_kmlAvg">Promedio —</span>
</div>
<div class="ov stack" style="--x:1250;--y:238">
  <span class="bigv" id="p_rpmNum">0<small>rpm</small></span>
  <span class="lbl" id="p_loadTxt">Carga 0 %</span>
</div>
<div class="ov stack" style="--x:368;--y:348">
  <span class="midv" id="p_tripKm">0.0<small>km</small></span><span class="lbl">Viaje</span>
</div>
<div class="ov stack" style="--x:1232;--y:424">
  <span class="midv" id="p_range">—<small>km</small></span><span class="lbl">Autonomía</span>
</div>
<div class="ov lbl" style="--x:325;--y:598" id="p_tempLbl">Temp. motor —</div>
<div class="ov lbl" style="--x:1275;--y:598" id="p_fuelLbl">Combustible —</div>

<section class="panel" id="p_panel" aria-live="polite">
  <div class="ptitle"><h2 id="p_pTitle">INFORMACIÓN GENERAL</h2></div>

  <div class="page" id="p_pg-general">
    <div class="grid">
      <div class="tile"><span class="lbl">Temp. refrigerante</span><span class="midv" id="p_gCool">—</span></div>
      <div class="tile"><span class="lbl">Voltaje batería</span><span class="midv" id="p_gVolt">—</span></div>
      <div class="tile"><span class="lbl">Aire de admisión</span><span class="midv" id="p_gAir">—</span></div>
      <div class="tile"><span class="lbl">Carga del motor</span><span class="midv" id="p_gLoad">—</span></div>
      <div class="tile"><span class="lbl">Acelerador</span><span class="midv" id="p_gThr">—</span></div>
      <div class="tile"><span class="lbl">Gasto de gasolina</span><span class="midv" id="p_gLh">—</span></div>
    </div>
  </div>

  <div class="page" id="p_pg-viaje" hidden>
    <div class="grid">
      <div class="tile"><span class="lbl">Distancia</span><span class="midv" id="p_vKm">—</span></div>
      <div class="tile"><span class="lbl">Tiempo</span><span class="midv" id="p_vTime">—</span></div>
      <div class="tile"><span class="lbl">Rendimiento promedio</span><span class="midv" id="p_vAvg">—</span></div>
      <div class="tile"><span class="lbl">Velocidad promedio</span><span class="midv" id="p_vSpd">—</span></div>
      <div class="tile"><span class="lbl">Litros usados</span><span class="midv" id="p_vL">—</span></div>
      <button class="tile" id="p_vCostBtn" type="button"><span class="lbl" id="p_vPrice">Gasto · $24.50/L</span><span class="midv" id="p_vCost">—</span></button>
    </div>
    <button class="pact" id="p_tripReset" type="button">Reiniciar viaje</button>
  </div>

  <div class="page" id="p_pg-aceite" hidden>
    <div class="oil">
      <div class="col">
        <div class="tile"><span class="lbl">Estado</span><span class="midv" id="p_oState">—</span></div>
        <div class="tile"><span class="lbl">Cambiar al</span><span class="midv">10<small>%</small></span></div>
      </div>
      <svg viewBox="0 0 200 200" aria-label="Vida del aceite">
        <circle cx="100" cy="100" r="80" fill="none" stroke="#173070" stroke-width="16" stroke-dasharray="377 503" transform="rotate(135 100 100)"/>
        <circle id="p_oRing" cx="100" cy="100" r="80" fill="none" stroke="#4be36d" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 503" transform="rotate(135 100 100)"/>
        <text x="100" y="104" class="num" style="font-size:52px;font-weight:700" id="p_oPct">—</text>
        <text x="100" y="142" class="small" style="font-size:13px;letter-spacing:1px">% restante</text>
      </svg>
      <div class="col">
        <div class="tile"><span class="lbl">Próximo cambio en</span><span class="midv" id="p_oLeft">—</span></div>
        <div class="tile"><span class="lbl">Desde el cambio</span><span class="midv" id="p_oDone">—</span></div>
      </div>
    </div>
    <button class="pact" id="p_oilSet" type="button">Ajustar aceite</button>
  </div>

  <div class="page" id="p_pg-fallas" hidden>
    <ul class="codes" id="p_codes"><li class="okc"><b>—</b><p>Toca el botón para revisar la computadora del auto.</p></li></ul>
    <button class="pact" id="p_readCodes" type="button">Leer fallas</button>
  </div>
</section>

<div class="tabs" role="tablist" aria-label="Pantallas">
  <button type="button" role="tab" data-p="general" aria-selected="true">GENERAL</button>
  <button type="button" role="tab" data-p="viaje" aria-selected="false">VIAJE</button>
  <button type="button" role="tab" data-p="aceite" aria-selected="false">ACEITE</button>
  <button type="button" role="tab" data-p="fallas" aria-selected="false">FALLAS</button>
</div>`;
let root = null, acum = 0, pagina = 'general';
const $ = id => root.querySelector('#p_' + id);
const pt = (cx, cy, r, deg) => { const a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
function arcD(cx, cy, r, a0, a1) {
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function el(tag, attrs, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  parent.appendChild(e); return e;
}
const SPD = { cx: 380, cy: 300, r: 250, a0: 118, span: 180, dir: 1, max: 220 };
const RPM = { cx: 1220, cy: 300, r: 250, a0: 62, span: 180, dir: -1, max: 8000, red: 6500 };
const ang = (g, f) => g.a0 + g.dir * g.span * f;

function buildStatic() {
  const T = $('ticks');
  for (const g of [SPD, RPM]) {
    el('path', { d: arcD(g.cx, g.cy, g.r + 16, ang(g, 0), ang(g, 1)), fill: 'none', stroke: '#a9c9ff', 'stroke-width': 2.5, 'stroke-opacity': .8 }, T);
    el('path', { d: arcD(g.cx, g.cy, g.r, ang(g, 0), ang(g, 1)), fill: 'none', stroke: '#0f2a72', 'stroke-width': 16, 'stroke-linecap': 'round' }, T);
  }
  for (let v = 0; v <= 220; v += 10) {
    const a = ang(SPD, v / 220), mj = v % 20 === 0;
    const [x1, y1] = pt(SPD.cx, SPD.cy, SPD.r - 14, a), [x2, y2] = pt(SPD.cx, SPD.cy, SPD.r - (mj ? 34 : 24), a);
    el('line', { x1, y1, x2, y2, class: 'tk' + (mj ? ' mj' : '') }, T);
    if (mj) { const [lx, ly] = pt(SPD.cx, SPD.cy, SPD.r - 62, a); el('text', { x: lx, y: ly, class: 'num' }, T, v); }
  }
  for (let v = 0; v <= 8000; v += 500) {
    const a = ang(RPM, v / 8000), mj = v % 1000 === 0, rd = v >= RPM.red;
    const [x1, y1] = pt(RPM.cx, RPM.cy, RPM.r - 14, a), [x2, y2] = pt(RPM.cx, RPM.cy, RPM.r - (mj ? 34 : 24), a);
    el('line', { x1, y1, x2, y2, class: 'tk' + (mj ? ' mj' : '') + (rd ? ' rd' : '') }, T);
    if (mj) { const [lx, ly] = pt(RPM.cx, RPM.cy, RPM.r - 64, a); el('text', { x: lx, y: ly, class: 'num big' + (v >= 7000 ? ' red' : '') }, T, v / 1000); }
  }
  el('path', { d: arcD(RPM.cx, RPM.cy, RPM.r + 16, ang(RPM, RPM.red / 8000), ang(RPM, 1)), fill: 'none', stroke: '#ff3b45', 'stroke-width': 7 }, T);
  const Fl = $('floor');
  for (let i = -9; i <= 9; i++) el('line', { x1: 800 + i * 14, y1: 330, x2: 800 + i * 170, y2: 620 }, Fl);
  for (const y of [470, 505, 548, 600]) el('line', { x1: 0, y1: y, x2: 1600, y2: y, 'stroke-opacity': .6 }, Fl);
  bar($('tempBar'), 150, 500, 575, ['C', '90', 'H'], true);
  bar($('fuelBar'), 1100, 1450, 575, ['E', '½', 'F'], false);
}
function bar(g, x0, x1, y, labels, temp) {
  el('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: '#2a4a9a', 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
  g._fill = el('line', { x1: x0, y1: y, x2: x0, y2: y, stroke: 'url(#p_gTemp)', 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
  for (let i = 0; i <= 8; i++) { const x = x0 + (x1 - x0) * i / 8; el('line', { x1: x, y1: y - 10, x2: x, y2: y - (i % 4 ? 15 : 20), class: 'tk' + (temp && i >= 7 ? ' rd' : '') }, g); }
  const pos = [0, temp ? (90 - 40) / (130 - 40) : .5, 1];
  labels.forEach((t, i) => el('text', { x: x0 + (x1 - x0) * pos[i], y: y - 34, class: 'small', style: (temp && i === 2) || (!temp && i === 0) ? 'fill:#ff3b45' : '' }, g, t));
  g._x0 = x0; g._x1 = x1;
}
function setBar(g, f, color) { f = F.clamp(f, 0, 1); g._fill.setAttribute('x2', g._x0 + (g._x1 - g._x0) * f); g._fill.setAttribute('stroke', color || 'url(#p_gTemp)'); }
function setArc(g, f, val, glow) {
  f = F.clamp(f, 0, 1);
  const d = f < .004 ? '' : arcD(g.cx, g.cy, g.r, ang(g, 0), ang(g, f));
  val.setAttribute('d', d); glow.setAttribute('d', d);
}
const unidad = (v, d, u) => v == null ? '—' : `${v.toFixed(d)}<small>${u}</small>`;

function textos(V) {
  $('kml').innerHTML = F.S.speed <= 3 ? 'Alto<small>' + (V.lh ? V.lh.toFixed(1) + ' L/h' : '') + '</small>' : unidad(V.kml, 1, 'km/L');
  $('kmlAvg').textContent = 'Promedio ' + (V.avg ? V.avg.toFixed(1) + ' km/L' : '—');
  $('rpmNum').innerHTML = `${Math.round(V.rpm / 10) * 10}<small>rpm</small>`;
  $('loadTxt').textContent = `Carga ${Math.round(V.load)} %`;
  $('tripKm').innerHTML = unidad(V.tripKm, 1, 'km');
  $('amb').textContent = V.ambient == null ? '' : V.ambient.toFixed(1) + ' °C';
  $('clock').textContent = V.clock;
  const c = V.coolant, cc = c == null ? '' : c < 60 ? 'c' : c < 108 ? 'g' : 'r';
  $('tempLbl').textContent = 'Temp. motor ' + (c == null ? '—' : Math.round(c) + ' °C');
  setBar($('tempBar'), c == null ? 0 : (c - 40) / 90, c != null && c >= 108 ? '#ff3b45' : null);
  $('gCool').innerHTML = c == null ? '—' : `<span class="${cc}">${Math.round(c)}</span><small>°C</small>`;
  $('lampTmp').classList.toggle('on', c != null && c >= 110);
  const fu = V.fuel;
  $('fuelLbl').textContent = 'Combustible ' + (fu == null ? '—' : Math.round(fu) + ' %');
  setBar($('fuelBar'), fu == null ? 0 : fu / 100, fu != null && fu < 12 ? '#ff3b45' : null);
  $('range').innerHTML = V.range == null ? '—<small>km</small>' : unidad(V.range, 0, 'km');
  const v = V.volt;
  $('gVolt').innerHTML = v == null ? '—' : `<span class="${v >= 13.2 ? 'g' : v >= 12.2 ? 'a' : 'r'}">${v.toFixed(1)}</span><small>V</small>`;
  $('lampBat').classList.toggle('on', v != null && v < 12.2);
  $('lampEng').classList.toggle('on', V.codes > 0);
  $('gAir').innerHTML = unidad(V.intake, 0, '°C');
  $('gLoad').innerHTML = unidad(V.load, 0, '%');
  $('gThr').innerHTML = unidad(V.throttle, 0, '%');
  $('gLh').innerHTML = unidad(V.lh, 1, 'L/h');
  const T = F.trip, m = Math.floor(T.seg / 60), h = Math.floor(m / 60);
  $('vKm').innerHTML = unidad(T.km, 1, 'km');
  $('vTime').innerHTML = h ? `${h}<small>h</small> ${m % 60}<small>min</small>` : `${m}<small>min</small> ${Math.floor(T.seg % 60)}<small>s</small>`;
  $('vAvg').innerHTML = unidad(V.avg, 1, 'km/L');
  $('vSpd').innerHTML = unidad(T.mov > 5 ? T.km / (T.mov / 3600) : null, 0, 'km/h');
  $('vL').innerHTML = unidad(T.litros, 2, 'L');
  $('vCost').innerHTML = '$' + (T.litros * F.cfg.precio).toFixed(2);
  $('vPrice').textContent = `Gasto · $${F.cfg.precio.toFixed(2)}/L`;
  const pct = V.oilPct, col = pct > 30 ? '#4be36d' : pct > 10 ? '#ffb02e' : '#ff3b45';
  $('oRing').setAttribute('stroke-dasharray', `${(377 * pct / 100).toFixed(1)} 503`);
  $('oRing').setAttribute('stroke', col);
  $('oPct').textContent = Math.round(pct);
  $('oState').innerHTML = pct > 60 ? '<span class="g">Excelente</span>' : pct > 30 ? '<span class="g">Bueno</span>' : pct > 10 ? '<span class="a">Pronto</span>' : '<span class="r">Cambiar</span>';
  $('oLeft').innerHTML = unidad(Math.max(0, F.oil.intervalo - F.oil.km), 0, 'km');
  $('oDone').innerHTML = unidad(F.oil.km, 0, 'km');
}

const PAGES = ['general', 'viaje', 'aceite', 'fallas'];
const TITLES = { general: 'INFORMACIÓN GENERAL', viaje: 'VIAJE ACTUAL', aceite: 'VIDA ÚTIL DEL ACEITE', fallas: 'CÓDIGOS DE FALLA' };
function ir(p) {
  pagina = p;
  PAGES.forEach(x => { $('pg-' + x).hidden = x !== p; });
  root.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.p === p)));
  $('pTitle').textContent = TITLES[p];
  F.store('forte-pagina', p);
}
function pintarFallas(list) {
  if (!root) return;
  const ul = $('codes');
  if (list === null) { ul.innerHTML = '<li class="okc"><b>—</b><p>Conecta el OBD para leer las fallas.</p></li>'; return; }
  ul.innerHTML = !list.length ? '<li class="okc"><b>OK</b><p>La computadora del motor no reporta códigos de falla.</p></li>'
    : list.map(c => `<li><b>${c}</b><p>${F.dtcText(c)}</p></li>`).join('');
  ir('fallas');
}
F.on('codes', pintarFallas);

F.SKINS.unshift({
  id: 'pano', name: 'Azul Panorámico', kind: 'dom',
  mount(host) {
    root = document.createElement('div'); root.className = 'pano';
    root.innerHTML = '<div class="cluster">' + TPL + '</div>';
    host.appendChild(root);
    buildStatic();
    root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => ir(b.dataset.p)));
    let x0 = null;
    $('panel').addEventListener('pointerdown', e => { x0 = e.clientX; });
    $('panel').addEventListener('pointerup', e => {
      if (x0 != null && Math.abs(e.clientX - x0) > 50) ir(PAGES[(PAGES.indexOf(pagina) + (e.clientX < x0 ? 1 : -1) + 4) % 4]);
      x0 = null;
    });
    $('vCostBtn').addEventListener('click', () => F.ui.open('ajustes'));
    $('tripReset').addEventListener('click', () => F.resetTrip());
    $('oilSet').addEventListener('click', () => F.ui.open('aceite'));
    $('readCodes').addEventListener('click', () => { $('codes').innerHTML = '<li class="okc"><b>…</b><p>Leyendo la computadora del auto…</p></li>'; F.readCodes(); });
    const g = F.store('forte-pagina'); ir(PAGES.includes(g) ? g : 'general');
    if (F.codes) pintarFallas(F.codes);
    acum = 1;
  },
  unmount() { if (root) root.remove(); root = null; },
  frame(V, dt) {
    if (!root) return;
    setArc(SPD, V.speed / SPD.max, $('spdVal'), $('spdGlow'));
    setArc(RPM, V.rpm / RPM.max, $('rpmVal'), $('rpmGlow'));
    $('rpmVal').setAttribute('stroke', V.rpm > 6000 ? '#ff3b45' : 'url(#p_gRpm)');
    $('speed').textContent = Math.round(V.speed);
    acum += dt; if (acum >= .25) { acum = 0; textos(V); }
  },
  // miniatura para el selector
  back(c, w, h) { c.fillStyle = '#02040a'; c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const K = F.K;
    K.rr(c, 14, 14, 1572, 592, 76); c.fillStyle = K.rad(c, 800, 290, 0, 900, ['#1a4fc4', '#0c2878', '#05113c', '#020617']); c.fill();
    c.strokeStyle = '#5f86d8'; c.lineWidth = 4; c.stroke();
    K.arcG(c, { cx: 380, cy: 300, r: 250, a0: 118, a1: 298, v: V.speed, max: 220, w: 16, track: '#0f2a72', col: ['#1d4dff', '#9fd8ff'], cap: 'round' });
    K.arcG(c, { cx: 1220, cy: 300, r: 250, a0: 62, a1: -118, v: V.rpm, max: 8000, w: 16, track: '#0f2a72', col: ['#1d4dff', '#9fd8ff'], cap: 'round', red: { from: 6500, col: '#ff3b45', r: 266, w: 7 } });
    K.txt(c, Math.round(V.speed), 800, 100, 120, '#fff', 'center', 700);
    c.fillStyle = '#fff'; c.fillRect(580, 169, 440, 5);
    for (let i = 0; i < 6; i++) { K.rr(c, 560 + (i % 2) * 250, 220 + Math.floor(i / 2) * 100, 230, 85, 10); c.fillStyle = 'rgba(14,36,98,.9)'; c.fill(); c.strokeStyle = 'rgba(120,165,255,.45)'; c.lineWidth = 2; c.stroke(); }
  }
});
})();
