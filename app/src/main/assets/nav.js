/* Tablero Forte · flechas hasta la gasolinera y testigos del tablero (batería, check engine, temperatura, gasolina). */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$, store = F.store, clamp = F.clamp;
const RAD = Math.PI / 180;
const dist = (a, b, c, d) => { const R = 6371000, x = (c - a) * RAD, y = (d - b) * RAD, h = Math.sin(x / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const rumbo = (a, b, c, d) => { const y = Math.sin((d - b) * RAD) * Math.cos(c * RAD), x = Math.cos(a * RAD) * Math.sin(c * RAD) - Math.sin(a * RAD) * Math.cos(c * RAD) * Math.cos((d - b) * RAD); return (Math.atan2(y, x) / RAD + 360) % 360; };
const angDif = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const gps = () => F.gps && !F.gps.sim ? F.gps : (F.navSimGps || null);
const fmtD = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ---------- interfaz: caja arriba al centro ---------- */
const top = document.createElement('div');
top.id = 'topCenter';
top.innerHTML = `<div id="lamps"></div>
  <div id="navBox" hidden>
    <svg id="navFlecha" viewBox="0 0 24 24"></svg>
    <div class="nt"><b id="navDist"></b><span id="navInst"></span><small id="navDest"></small></div>
    <button type="button" id="navX" aria-label="Terminar guía">✕</button>
  </div>`;
document.body.appendChild(top);
const css = document.createElement('style');
css.textContent = `
#topCenter{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 6px);z-index:15;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:min(46vw,440px)}
#topCenter>*{pointer-events:auto}
#lamps{display:flex;gap:8px;justify-content:center}
#lamps:empty{display:none}
#lamps span{width:40px;height:34px;display:grid;place-items:center;border-radius:9px;background:rgba(0,0,0,.55)}
#lamps svg{width:28px;height:28px;fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
#lamps .r svg{stroke:#ff3b3b;filter:drop-shadow(0 0 5px #ff2020)}
#lamps .a svg{stroke:#ffb02e;filter:drop-shadow(0 0 5px #ff9a00)}
#lamps .nuevo{animation:parpadeo .5s 4}
@keyframes parpadeo{50%{opacity:.15}}
#navBox{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:16px;background:#0f6b3a;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35)}
#navBox[hidden]{display:none!important}
#navFlecha{flex:none;width:58px;height:58px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
#navBox .nt{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.15}
#navDist{font-size:26px;font-weight:800;font-stretch:110%}
#navInst{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#navDest{font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#navX{flex:none;width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:16px;cursor:pointer}
html.hud #topCenter{display:none}
@media (prefers-reduced-motion:reduce){#lamps .nuevo{animation:none}}`;
document.head.appendChild(css);

/* ---------- flechas ---------- */
const FLECHA = {
  straight: '<path d="M12 21V4M6 10l6-6 6 6"/>',
  right: '<path d="M7 21v-8a4 4 0 0 1 4-4h9M15 4l5 5-5 5"/>',
  'slight right': '<path d="M8 21v-7l9-9M10 5h7v7"/>',
  'sharp right': '<path d="M7 3v12a3 3 0 0 0 3 3h1l8-8M19 16v-6h-6"/>',
  uturn: '<path d="M16 21V9a5 5 0 0 0-10 0v4M2 9l4 4 4-4"/>',
  rotonda: '<circle cx="12" cy="9" r="4"/><path d="M12 13v8M16 9h5M17 5l4 4-4 4"/>',
  llegar: '<path d="M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M3 21h13M7 8h5"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/>'
};
function flecha(m) {
  if (!m) return FLECHA.straight;
  const mod = m.modifier || 'straight';
  if (m.type === 'arrive') return FLECHA.llegar;
  if (m.type === 'roundabout' || m.type === 'rotary' || m.type === 'roundabout turn') return FLECHA.rotonda;
  if (mod === 'uturn') return FLECHA.uturn;
  const izq = mod.includes('left'), base = mod.replace('left', 'right');
  const p = FLECHA[base] || FLECHA.straight;
  return izq ? `<g transform="translate(24 0) scale(-1 1)">${p}</g>` : p;
}
const VERBO = { right: 'Gira a la derecha', left: 'Gira a la izquierda', 'slight right': 'Mantente a la derecha', 'slight left': 'Mantente a la izquierda',
  'sharp right': 'Vuelta cerrada a la derecha', 'sharp left': 'Vuelta cerrada a la izquierda', straight: 'Sigue derecho', uturn: 'Da vuelta en U' };
function instruccion(S) {
  const m = S.maneuver, calle = S.name ? ` en ${S.name}` : '';
  if (m.type === 'arrive') return 'Llegas a la gasolinera';
  if (m.type === 'roundabout' || m.type === 'rotary') return `En la glorieta toma la ${m.exit || 1}ª salida${calle}`;
  if (m.type === 'depart') return `Avanza${calle}`;
  return (VERBO[m.modifier] || 'Sigue derecho') + calle;
}

/* ---------- búsqueda y ruta ---------- */
function gasolineras(g) {
  return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(`[out:json][timeout:15];(node(around:7000,${g.lat},${g.lon})[amenity=fuel];way(around:7000,${g.lat},${g.lon})[amenity=fuel];);out center 40;`) })
    .then(r => r.json()).then(j => (j.elements || []).map(e => {
      const la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon);
      return { id: e.id, name: (e.tags && (e.tags.brand || e.tags.name)) || 'Gasolinera', lat: la, lon: lo };
    }).filter(x => x.lat != null));
}
function ruta(g, st) {
  return fetch(`https://router.project-osrm.org/route/v1/driving/${g.lon},${g.lat};${st.lon},${st.lat}?steps=true&overview=full&geometries=geojson`)
    .then(r => r.json()).then(j => {
      if (!j.routes || !j.routes[0]) throw new Error('sin ruta');
      const R = j.routes[0];
      return { steps: R.legs[0].steps, coords: R.geometry.coordinates, dist: R.distance };
    });
}

/* ---------- estado de la guía ---------- */
let N = null;                  // { st, steps, coords, idx, off, dichos, prev }
const saltadas = new Set();
let descartado = false;        // ya llegaste o la cancelaste: no vuelve a empezar sola hasta cargar gasolina
let buscando = false;

function decir(t) { F.speak(t); }
async function iniciar(motivo) {
  const g = gps();
  if (!g) { ui.toast('Necesito el GPS del teléfono para guiarte'); return; }
  if (buscando) return;
  buscando = true;
  try {
    const L = await gasolineras(g);
    const cand = L.filter(x => !saltadas.has(x.id)).map(x => {
      const d = dist(g.lat, g.lon, x.lat, x.lon);
      const atras = g.bearing != null && (g.speed || 0) > 8 && angDif(rumbo(g.lat, g.lon, x.lat, x.lon), g.bearing) > 100;
      return Object.assign(x, { d, score: d * (atras ? 1.7 : 1) });
    }).sort((a, b) => a.score - b.score);
    if (!cand.length) { ui.toast('No encontré gasolineras cerca'); return; }
    const st = cand[0], R = await ruta(g, st);
    N = { st, steps: R.steps, coords: R.coords, total: R.dist, idx: R.steps.length > 1 ? 1 : 0, off: 0, dichos: {}, prev: null };
    $('navBox').hidden = false;
    const primera = N.steps[N.idx];
    decir(`${motivo || 'Te llevo a la gasolinera más cercana'}: ${st.name}, a ${fmtD(R.dist)}. ${primera ? instruccion(primera) : ''}`);
    pintar();
  } catch (e) {
    ui.toast('No pude calcular la ruta. Revisa los datos móviles.');
  } finally { buscando = false; }
}
function parar(manual) {
  N = null; $('navBox').hidden = true;
  if (manual) { descartado = true; ui.toast('Guía a la gasolinera terminada'); }
}
F.nav = { gas: () => { descartado = false; saltadas.clear(); iniciar(); }, parar, activo: () => !!N };
$('navX').onclick = () => parar(true);

// distancia de un punto a la ruta, en metros
function fueraDeRuta(g) {
  const k = Math.cos(g.lat * RAD) * 111320, m = 111320, px = g.lon * k, py = g.lat * m;
  let best = 1e9;
  const C = N.coords;
  for (let i = 1; i < C.length; i++) {
    const ax = C[i - 1][0] * k, ay = C[i - 1][1] * m, bx = C[i][0] * k, by = C[i][1] * m, dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
}
function avanzar() {
  if (!N) return;
  const g = gps(); if (!g) return;
  // ¿llegaste?
  if (dist(g.lat, g.lon, N.st.lat, N.st.lon) < 45) {
    decir(`Llegaste a ${N.st.name}`); F.alert('nav', `Llegaste a ${N.st.name}`, 'ok');
    parar(false); descartado = true; return;
  }
  // ¿ignoraste la vuelta? → la próxima gasolinera
  const fuera = fueraDeRuta(g);
  N.off = fuera > 60 ? N.off + 1 : 0;
  if (N.off >= 4) {
    saltadas.add(N.st.id);
    const anterior = N.st.name;
    N = null;
    iniciar(`Te pasaste de ${anterior}. Te llevo a la próxima gasolinera`);
    return;
  }
  // siguiente maniobra
  let S = N.steps[N.idx];
  while (S && N.idx < N.steps.length - 1) {
    const [lo, la] = S.maneuver.location, d = dist(g.lat, g.lon, la, lo);
    if (d < 25 || (N.prev != null && N.prev.idx === N.idx && d > N.prev.d + 15 && d < 80)) { N.idx++; S = N.steps[N.idx]; N.prev = null; continue; }
    N.prev = { idx: N.idx, d };
    break;
  }
  if (!S) return;
  const [lo, la] = S.maneuver.location, d = dist(g.lat, g.lon, la, lo);
  const key = N.idx;
  if (d < 380 && d > 140 && !N.dichos[key + 'l']) { N.dichos[key + 'l'] = 1; decir(`En ${fmtD(d)}, ${instruccion(S).toLowerCase()}`); }
  if (d < 90 && !N.dichos[key + 'c']) { N.dichos[key + 'c'] = 1; decir(instruccion(S)); }
  N.d = d;
  pintar();
}
function pintar() {
  if (!N) return;
  const S = N.steps[N.idx], g = gps();
  $('navFlecha').innerHTML = flecha(S && S.maneuver);
  $('navDist').textContent = N.d != null ? fmtD(N.d) : fmtD(S ? S.distance : N.total);
  $('navInst').textContent = S ? instruccion(S) : '';
  const falta = g ? dist(g.lat, g.lon, N.st.lat, N.st.lon) : N.total;
  $('navDest').textContent = `${N.st.name} · ${fmtD(falta)}`;
}
F.on('gps', avanzar);
setInterval(avanzar, 1500);

// empieza sola cuando queda poca gasolina y vas manejando
setInterval(() => {
  const fu = F.S.fuel;
  if (fu != null && fu > (F.cfg.gasAviso || 15) + 5) { descartado = false; saltadas.clear(); }
  if (N || descartado || buscando || F.cfg.navGas === false) return;
  if (fu == null || fu >= (F.cfg.gasAviso || 15) || F.sim) return;
  if (!gps() || (F.S.speed || 0) < 5) return;
  iniciar(`Queda poca gasolina, ${Math.round(fu)} por ciento. Te llevo a la más cercana`);
}, 5000);

ui.addPanel('navgas', 'Guía a gasolinera', () => {
  const b = ui.h.body;
  b.innerHTML = `<p class="note">Cuando la gasolina baja del aviso (${F.cfg.gasAviso || 15} %) y vas manejando, te guío con flechas y voz a la gasolinera más cercana que te quede de pasada. Si no das la vuelta, busco la siguiente.</p>` +
    ui.h.kv('Estado', N ? `Guiando a ${esc(N.st.name)}` : 'Sin guía') +
    `<label class="chk"><input id="ngAuto" type="checkbox"${F.cfg.navGas !== false ? ' checked' : ''}> Guiar sola con poca gasolina</label>` +
    ui.h.btn('ngIr', N ? 'Terminar guía' : 'Guiarme ahora', 'pri') +
    (N ? ui.h.btn('ngMaps', 'Abrir esta ruta en Google Maps') : '');
  $('ngAuto').onchange = e => { F.cfg.navGas = e.target.checked; F.save(); };
  $('ngIr').onclick = () => { if (N) parar(true); else F.nav.gas(); ui.close(); };
  if ($('ngMaps')) $('ngMaps').onclick = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${N.st.lat},${N.st.lon}&travelmode=driving`;
    if (window.OBD && OBD.openUrl) OBD.openUrl(url); else window.open(url, '_blank', 'noopener');
  };
});

/* ---------- testigos del tablero ---------- */
const ICON = {
  bat: '<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M7 7V4h3v3M14 7V4h3v3M6.5 13.5h4M14 13.5h4M16 11.5v4"/>',
  motor: '<path d="M2 10h3V7h10l3 3h2v-2h2v9h-2v-2h-2v4h-4l-2 2H7l-2-2H2z"/>',
  temp: '<path d="M12 3v11"/><circle cx="12" cy="17" r="3"/><path d="M12 6h4M12 9h4M3 22q2-2 4 0t4 0 4 0 4 0 4 0"/>',
  gas: '<path d="M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M3 21h13M7 8h5"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  aceite: '<path d="M3 15l3-4h7l4-3 4 2-6 7H5z"/><path d="M19 15q1 2 0 3a1 1 0 0 1-2 0q0-1 1-3"/>'
};
let altSince = 0;
const activos = new Set();
function testigos() {
  const S = F.S, on = (S.rpm || 0) >= 400, L = [];
  if (S.volt != null) {
    if (on && S.volt < 12.4) { altSince = altSince || Date.now(); } else altSince = 0;
    if ((!on && S.volt < 12.2) || (on && altSince && Date.now() - altSince > 60000)) L.push(['bat', 'r', `Batería ${S.volt.toFixed(1)} V`]);
  }
  if (F.codes && F.codes.length) L.push(['motor', 'a', 'Check engine']);
  if (S.coolant != null && S.coolant >= 108) L.push(['temp', 'r', 'Motor caliente']);
  if (S.fuel != null && S.fuel < (F.cfg.gasAviso || 15)) L.push(['gas', 'a', 'Gasolina baja']);
  if (F.oil && F.oil.intervalo && F.oil.km >= F.oil.intervalo) L.push(['aceite', 'a', 'Cambio de aceite']);
  return L;
}
function pintarTestigos() {
  const box = $('lamps');
  if (document.body.dataset.skin === 'pano') { box.innerHTML = ''; return; }
  const L = testigos(), ids = new Set(L.map(x => x[0]));
  box.innerHTML = L.map(([id, c, t]) => `<span class="${c}${activos.has(id) ? '' : ' nuevo'}" title="${t}" aria-label="${t}"><svg viewBox="0 0 24 24">${ICON[id]}</svg></span>`).join('');
  activos.clear(); ids.forEach(i => activos.add(i));
}
setInterval(pintarTestigos, 1000);
pintarTestigos();
F.testigos = testigos;
})();
