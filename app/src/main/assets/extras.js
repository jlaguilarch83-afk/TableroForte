/* Tablero Forte · extras: límite de la calle, gasolineras, dónde dejé mi carro, topes,
   resumen de viajes y semanal, salud del motor, comandos de voz y detección de carros con la cámara. */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$;
const { btn, kv, esc, n, body } = ui.h;
const store = F.store, clamp = F.clamp;

/* ---------- utilidades ---------- */
const RAD = Math.PI / 180;
function dist(a, b, c, d) {
  const R = 6371000, x = (c - a) * RAD, y = (d - b) * RAD;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function rumbo(a, b, c, d) {
  const y = Math.sin((d - b) * RAD) * Math.cos(c * RAD);
  const x = Math.cos(a * RAD) * Math.sin(c * RAD) - Math.sin(a * RAD) * Math.cos(c * RAD) * Math.cos((d - b) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
const angDif = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const fmtD = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
const gpsReal = () => F.gps && !F.gps.sim ? F.gps : null;
const cool = {};
const cada = (id, s) => { const t = Date.now(); if (cool[id] && t - cool[id] < s * 1000) return false; cool[id] = t; return true; };
function abrirMapa(lat, lon, modo) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=${modo || 'driving'}`;
  if (window.OBD && OBD.openUrl) { OBD.openUrl(url); return; }
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
function overpass(q) {
  return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) }).then(r => r.json());
}
const ICO = {
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  tope: '<svg viewBox="0 0 24 24"><path d="M2 18h20M5 18c1.5-5 4-7 7-7s5.5 2 7 7"/><path d="M9 14l1.5 4M15 14l-1.5 4"/></svg>'
};

/* ---------- botones rápidos en la barra de arriba ---------- */
const barra = document.querySelector('.top.r');
function boton(id, ico, label, fn) {
  const b = document.createElement('button');
  b.className = 'ibtn'; b.id = id; b.type = 'button'; b.innerHTML = ico; b.setAttribute('aria-label', label); b.onclick = fn;
  barra.insertBefore(b, $('btnMenu'));
  return b;
}
boton('btnTope', ICO.tope, 'Marcar tope aquí', () => marcarTope('tope'));
boton('btnVoz', ICO.mic, 'Comando de voz', () => escuchar());

/* ================= límite automático según la calle (GPS + mapa) ================= */
// Se baja la red de calles alrededor (300 m) y se busca, con el GPS, la calle en la que vas.
// Si la calle no tiene límite en el mapa, se estima por el tipo de vía.
const LIM_TIPO = { motorway: 110, motorway_link: 60, trunk: 80, trunk_link: 50, primary: 60, primary_link: 40, secondary: 50, secondary_link: 40,
  tertiary: 50, tertiary_link: 40, unclassified: 40, residential: 40, living_street: 20, service: 20 };
let red = [], redPos = null, redBusy = false, overLim = 0;
F.streetLimit = null; F.limiteActivo = null;
function bajarRed(g) {
  if (redBusy) return;
  redBusy = true; redPos = [g.lat, g.lon];
  overpass(`[out:json][timeout:15];way(around:350,${g.lat},${g.lon})[highway~"^(${Object.keys(LIM_TIPO).join('|')})$"];out tags geom;`)
    .then(j => { red = (j.elements || []).filter(w => w.geometry && w.geometry.length > 1); })
    .catch(() => {}).finally(() => { redBusy = false; });
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return { d: Math.hypot(px - ax - t * dx, py - ay - t * dy), b: (Math.atan2(dx, dy) / RAD + 360) % 360 };
}
function calleActual(g) {
  const k = Math.cos(g.lat * RAD) * 111320, m = 111320;   // metros por grado
  let best = null, bestScore = 1e9;
  for (const w of red) {
    const G = w.geometry;
    for (let i = 1; i < G.length; i++) {
      const r = segDist(g.lon * k, g.lat * m, G[i - 1].lon * k, G[i - 1].lat * m, G[i].lon * k, G[i].lat * m);
      if (r.d > 35) continue;
      let pen = 0;
      if (g.bearing != null && g.speed > 8) { const a = angDif(r.b, g.bearing); pen = Math.min(a, 180 - a) > 35 ? 25 : 0; }
      const sc = r.d + pen;
      if (sc < bestScore) { bestScore = sc; best = w; }
    }
  }
  return best;
}
function limiteDe(w) {
  const t = w.tags || {}, ms = parseInt(t.maxspeed);
  if (ms > 0) return { v: ms, est: false };
  const v = LIM_TIPO[t.highway];
  return v ? { v, est: true } : null;
}
setInterval(() => {
  const g = gpsReal();
  if (!g || F.cfg.limiteAuto === false) { if (F.streetLimit) { F.streetLimit = null; actualizarLimite(); } return; }
  if (!redPos || dist(redPos[0], redPos[1], g.lat, g.lon) > 220) bajarRed(g);
  const w = calleActual(g);
  const L = w ? limiteDe(w) : null;
  const nuevo = L ? { v: L.v, est: L.est, name: (w.tags && w.tags.name) || '' } : null;
  const cambio = (nuevo && nuevo.v) !== (F.streetLimit && F.streetLimit.v);
  F.streetLimit = nuevo;
  if (cambio) actualizarLimite();
}, 2000);
F.on('tolerancia', () => actualizarLimite());
function actualizarLimite() {
  const tol = F.cfg.tolerancia ?? 5;
  F.limiteActivo = F.streetLimit ? F.streetLimit.v + tol : null;
  if (F.syncServicio) F.syncServicio();
}
ui.addPanel('limites', 'Límite por calle', () => {
  const L = F.streetLimit, c = F.cfg;
  body.innerHTML = `<p class="note">Con el GPS detecto la calle en la que vas y su límite. Si el mapa no lo tiene, lo estimo por el tipo de calle (avenida 60, calle 40…). Te aviso con voz cuando pasas el límite más la tolerancia.</p>` +
    kv('Calle', L ? esc(L.name || 'sin nombre') : '—') + kv('Límite', L ? `${L.v} km/h${L.est ? ' (estimado)' : ''}` : '—') + kv('Te aviso arriba de', L ? `${L.v + (c.tolerancia ?? 5)} km/h` : '—') +
    `<label class="chk"><input id="lAuto" type="checkbox"${c.limiteAuto !== false ? ' checked' : ''}> Límite automático por calle</label>
     <label>Tolerancia (km/h arriba del límite)<input id="lTol" type="number" min="0" max="20" step="1" inputmode="numeric" value="${c.tolerancia ?? 5}"></label>` +
    btn('lSave', 'Guardar', 'pri') + '<p class="note">Los límites salen de OpenStreetMap; si ves uno mal, el estimado manda hasta que alguien lo corrija en el mapa.</p>';
  $('lSave').onclick = () => { c.limiteAuto = $('lAuto').checked; c.tolerancia = clamp(parseInt($('lTol').value) || 0, 0, 20); F.save(); actualizarLimite(); ui.toast('Guardado'); };
});

/* ================= viaje: datos extra, resumen al terminar y estacionado ================= */
let extra = { coolMax: null, voltMin: null };
F.on('frame', () => {
  const S = F.S;
  if (S.coolant != null) extra.coolMax = Math.max(extra.coolMax ?? -99, S.coolant);
  if (S.volt != null && S.rpm > 400) extra.voltMin = Math.min(extra.voltMin ?? 99, S.volt);
});
let prevKind = F.conn.kind;
F.on('conn', c => {
  if (prevKind === 'ok' && c.kind !== 'ok') { guardarEstacionado(true); viajeTerminado(); }
  prevKind = c.kind;
});
function viajeTerminado() {
  const T = F.trip;
  if (T.km < 0.3) return;
  const v = { t: Date.now(), km: +T.km.toFixed(2), seg: Math.round(T.seg), litros: +T.litros.toFixed(3), gasto: +(T.litros * F.cfg.precio).toFixed(2),
    vmax: Math.round(T.vmax), score: F.scoreVal(), coolMax: extra.coolMax, voltMin: extra.voltMin, eventos: F.score.eventos.length };
  const L = store('forte-viajes') || []; L.push(v); if (L.length > 300) L.splice(0, L.length - 300); store('forte-viajes', L);
  store('forte-ultimo', v);
  F.speak(`Viaje terminado. ${v.km.toFixed(1)} kilómetros. Calificación ${v.score} de 100.`);
  F.resetTrip(); extra = { coolMax: null, voltMin: null };
  ui.open('ultimo');
}
function guardarEstacionado(auto) {
  const g = gpsReal();
  if (!g) { if (!auto) ui.toast('Necesito el GPS para guardar dónde está el auto'); return; }
  const p = { lat: g.lat, lon: g.lon, t: Date.now() };
  store('forte-estacionado', p);
  if (window.OBD && OBD.parked) OBD.parked(p.lat, p.lon);
  if (!auto) ui.toast('Lugar guardado');
}

ui.addPanel('ultimo', 'Último viaje', () => {
  const v = store('forte-ultimo');
  if (!v) { body.innerHTML = '<p class="note">Aquí aparece el resumen cuando terminas un viaje (al apagar el auto).</p>'; return; }
  const rend = v.litros > .01 ? v.km / v.litros : null;
  body.innerHTML = `<div class="bigval">${v.score}<small> / 100</small></div><p class="note">${v.score >= 90 ? 'Manejo excelente' : v.score >= 75 ? 'Buen manejo' : 'Puedes manejar más suave'}</p>` +
    kv('Distancia', `${n(v.km, 1)} km`) + kv('Tiempo', F.fmtTime(v.seg)) + kv('Rendimiento', rend ? `${n(rend, 1)} km/L` : '—') +
    kv('Gasolina', `${n(v.litros, 2)} L · $${n(v.gasto, 2)}`) + kv('Velocidad máxima', `${v.vmax} km/h`) +
    kv('Motor máximo', v.coolMax == null ? '—' : `${n(v.coolMax)} °C`) + kv('Descuentos de manejo', String(v.eventos || 0)) +
    btn('uShare', 'Compartir por WhatsApp', 'pri');
  $('uShare').onclick = () => compartirTexto(`Viaje en mi Kia Forte\n${n(v.km, 1)} km en ${F.fmtTime(v.seg)}\n${rend ? n(rend, 1) + ' km/L · ' : ''}$${n(v.gasto, 2)} de gasolina\nCalificación: ${v.score}/100`);
});
function compartirTexto(t) {
  if (window.OBD && OBD.share) { OBD.share(t); return; }
  const a = document.createElement('a'); a.href = 'https://wa.me/?text=' + encodeURIComponent(t); a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

ui.addPanel('estacionado', 'Dónde dejé mi carro', () => {
  const p = store('forte-estacionado'), g = gpsReal();
  let h = '<p class="note">Se guarda solo cuando apagas el auto (se desconecta el OBD). También lo mandamos al reloj, a la carátula "Mi carro".</p>';
  if (p) {
    h += kv('Guardado', new Date(p.t).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }));
    if (g) h += kv('Distancia', fmtD(dist(g.lat, g.lon, p.lat, p.lon))) + kv('Dirección', `${Math.round(rumbo(g.lat, g.lon, p.lat, p.lon))}°`);
    h += btn('eIr', 'Cómo llegar caminando', 'pri');
  } else h += '<p class="note">Todavía no hay un lugar guardado.</p>';
  h += btn('eGuardar', 'Guardar aquí ahora');
  body.innerHTML = h;
  if ($('eIr')) $('eIr').onclick = () => abrirMapa(p.lat, p.lon, 'walking');
  $('eGuardar').onclick = () => { guardarEstacionado(false); ui.render(); };
});

/* ================= gasolineras cercanas ================= */
function buscarGas() {
  const g = gpsReal(); if (!g) return Promise.reject(new Error('sin GPS'));
  return overpass(`[out:json][timeout:15];(node(around:6000,${g.lat},${g.lon})[amenity=fuel];way(around:6000,${g.lat},${g.lon})[amenity=fuel];);out center 30;`)
    .then(j => (j.elements || []).map(e => {
      const la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon);
      return { name: (e.tags && (e.tags.brand || e.tags.name)) || 'Gasolinera', lat: la, lon: lo, d: la == null ? 1e9 : dist(g.lat, g.lon, la, lo) };
    }).filter(x => x.lat != null).sort((a, b) => a.d - b.d));
}
F.on('alert', a => {
  if (a.id !== 'gas') return;
  buscarGas().then(L => { if (L[0]) F.alert('gas2', `Gasolinera más cercana: ${L[0].name} a ${fmtD(L[0].d)}`, 'warn', true); }).catch(() => {});
});
ui.addPanel('gasolineras', 'Gasolineras cercanas', () => {
  body.innerHTML = '<p class="note">Busca gasolineras a menos de 6 km con el GPS. Cuando la gasolina baja del aviso, te dice la más cercana.</p>' + btn('gBuscar', 'Buscar ahora', 'pri') + '<div id="gLista"></div>';
  const buscar = () => {
    $('gLista').innerHTML = '<p class="note">Buscando…</p>';
    buscarGas().then(L => {
      if (ui.section() !== 'gasolineras') return;
      $('gLista').innerHTML = L.length ? '<ul class="list">' + L.slice(0, 15).map((x, i) => `<li><span>${esc(x.name)} · ${fmtD(x.d)}</span><button type="button" class="mini" data-i="${i}">Ir</button></li>`).join('') + '</ul>' : '<p class="note">No encontré gasolineras cerca.</p>';
      $('gLista').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const x = L[+b.dataset.i]; abrirMapa(x.lat, x.lon); });
    }).catch(e => { $('gLista').innerHTML = `<p class="note">${e.message === 'sin GPS' ? 'Necesito el GPS del teléfono (solo en la app).' : 'No se pudo buscar. Revisa que tengas datos móviles.'}</p>`; });
  };
  $('gBuscar').onclick = buscar;
  if (gpsReal()) buscar();
});

/* ================= topes y baches ================= */
const topes = store('forte-topes') || [];            // los que marcas tú: {tipo:'tope'|'bache'}
let topesMapa = [], tmPos = null, tmBusy = false;    // topes que vienen en el mapa
const avisados = {};
F.peligro = null;                                    // el más cercano adelante, para dibujarlo en el camino
function marcarTope(tipo) {
  tipo = tipo === 'bache' ? 'bache' : 'tope';
  const g = gpsReal();
  if (!g) { ui.toast(`Necesito el GPS para marcar el ${tipo}`); return; }
  topes.push({ tipo, lat: g.lat, lon: g.lon, rumbo: g.bearing ?? null, t: Date.now() });
  store('forte-topes', topes);
  const t = tipo === 'bache' ? 'Bache guardado' : 'Tope guardado';
  ui.toast(t); F.speak(t);
}
F.marcarTope = marcarTope;
function bajarTopesMapa(g) {
  if (tmBusy) return; tmBusy = true; tmPos = [g.lat, g.lon];
  overpass(`[out:json][timeout:15];node(around:2000,${g.lat},${g.lon})[traffic_calming~"^(bump|hump|table|cushion|yes|rumble_strip)$"];out 200;`)
    .then(j => { topesMapa = (j.elements || []).map(e => ({ tipo: 'tope', lat: e.lat, lon: e.lon, id: 'm' + e.id })); })
    .catch(() => {}).finally(() => { tmBusy = false; });
}
setInterval(() => {
  const g = gpsReal(); F.peligro = null;
  if (!g || F.S.speed < 8) return;
  if (!tmPos || dist(tmPos[0], tmPos[1], g.lat, g.lon) > 1200) bajarTopesMapa(g);
  const todos = topes.map((t, i) => Object.assign({ id: 'u' + i }, t)).concat(topesMapa);
  let cerca = null;
  for (const tp of todos) {
    const d = dist(g.lat, g.lon, tp.lat, tp.lon);
    if (d > 180 || d < 8) continue;
    if (g.bearing != null && angDif(rumbo(g.lat, g.lon, tp.lat, tp.lon), g.bearing) > 40) continue;
    if (!cerca || d < cerca.d) cerca = { tipo: tp.tipo || 'tope', d };
    if (d < 160 && !(avisados[tp.id] && Date.now() - avisados[tp.id] < 120000)) {
      avisados[tp.id] = Date.now();
      const T = (tp.tipo || 'tope') === 'bache' ? 'Bache' : 'Tope';
      F.alert('tope', `${T} adelante, a ${fmtD(d)}`, 'warn', `${T} adelante`);
    }
  }
  F.peligro = cerca;
}, 1000);
ui.addPanel('topes', 'Topes y baches', () => {
  const nT = topes.filter(t => t.tipo !== 'bache').length, nB = topes.length - nT;
  body.innerHTML = '<p class="note">Marca un tope o un bache cuando pases por él (botones de abajo en Forte Tesla, di "tope" o "bache", o mantén presionado el reloj para un tope). La próxima vez te aviso 160 m antes y lo ves dibujado en el camino. También aviso los topes que ya vienen en el mapa.</p>' +
    `<div class="row">${btn('tMarcar', 'Marcar tope', 'pri')}${btn('bMarcar', 'Marcar bache', 'pri')}</div>` +
    kv('Topes tuyos', String(nT)) + kv('Baches tuyos', String(nB)) + kv('Topes del mapa cerca', String(topesMapa.length)) +
    (topes.length ? '<h3>Guardados</h3><ul class="list">' + topes.slice().reverse().slice(0, 40).map((t, k) => {
      const i = topes.length - 1 - k, g = gpsReal();
      return `<li><span>${t.tipo === 'bache' ? 'Bache' : 'Tope'} · ${new Date(t.t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}${g ? ' · a ' + fmtD(dist(g.lat, g.lon, t.lat, t.lon)) : ''}</span><button type="button" class="mini" data-del="${i}">Quitar</button></li>`;
    }).join('') + '</ul>' : '');
  $('tMarcar').onclick = () => { marcarTope('tope'); ui.render(); };
  $('bMarcar').onclick = () => { marcarTope('bache'); ui.render(); };
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = '¿Seguro?'; return; }
    topes.splice(+b.dataset.del, 1); store('forte-topes', topes); ui.render();
  });
});

/* ================= resumen semanal ================= */
function semana() {
  const L = store('forte-viajes') || [], d = new Date(), lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const V = L.filter(v => v.t >= lunes.getTime());
  const dias = [0, 0, 0, 0, 0, 0, 0];
  V.forEach(v => { dias[(new Date(v.t).getDay() + 6) % 7] += v.km; });
  const km = V.reduce((s, v) => s + v.km, 0), lit = V.reduce((s, v) => s + v.litros, 0), gasto = V.reduce((s, v) => s + v.gasto, 0);
  const score = V.length ? Math.round(V.reduce((s, v) => s + v.score, 0) / V.length) : null;
  return { V, dias, km, lit, gasto, score, rend: lit > .05 ? km / lit : null };
}
ui.addPanel('resumen', 'Resumen semanal', () => {
  const S = semana(), max = Math.max(1, ...S.dias);
  const DN = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  body.innerHTML = `<p class="note">Desde el lunes. Se cuentan los viajes con el OBD conectado.</p>` +
    kv('Viajes', String(S.V.length)) + kv('Kilómetros', n(S.km, 1)) + kv('Rendimiento', S.rend ? `${n(S.rend, 1)} km/L` : '—') +
    kv('Gasolina', `${n(S.lit, 1)} L · $${n(S.gasto, 2)}`) + kv('Calificación promedio', S.score == null ? '—' : `${S.score}/100`) +
    '<h3>Kilómetros por día</h3><div class="semana">' + S.dias.map((k, i) => `<div><i style="height:${Math.round(k / max * 110)}px"></i><b>${k ? n(k, 0) : ''}</b><span>${DN[i]}</span></div>`).join('') + '</div>' +
    btn('sShare', 'Compartir por WhatsApp', 'pri');
  $('sShare').onclick = () => compartirTexto(`Mi semana en el Kia Forte\n${S.V.length} viajes · ${n(S.km, 1)} km\n${S.rend ? n(S.rend, 1) + ' km/L · ' : ''}$${n(S.gasto, 2)} de gasolina\nCalificación: ${S.score ?? '—'}/100`);
});
const st = document.createElement('style');
st.textContent = `.semana{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;height:150px;align-items:stretch}
.semana div{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px;font-size:12px;color:var(--label)}
.semana i{display:block;width:70%;min-height:2px;max-height:110px;background:var(--blue);border-radius:4px 4px 0 0}
.semana b{color:var(--fg);font-size:12px}`;
document.head.appendChild(st);

/* ================= salud del motor ================= */
function mini(vals, lo, hi, col) {
  if (vals.length < 2) return '<p class="note">Faltan datos; se llena con el uso.</p>';
  const w = 300, h = 70, pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - (clamp((v - lo) / (hi - lo), 0, 1)) * h).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:80px"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round"/></svg>`;
}
ui.addPanel('salud', 'Salud del motor', () => {
  const B = F.batteryLog ? F.batteryLog() : [], V = store('forte-viajes') || [];
  const rep = B.filter(e => e.tipo === 'reposo').map(e => e.v).slice(-20), arr = B.filter(e => e.tipo === 'arranque').map(e => e.v).slice(-20);
  const cool = V.map(v => v.coolMax).filter(x => x != null).slice(-20);
  const ltft = F.D.ltft, stft = F.D.stft;
  const veredicto = [];
  if (rep.length >= 3) { const a = rep[rep.length - 3], b = rep[rep.length - 1]; if (b < a - .15) veredicto.push(['a', 'El voltaje en reposo va bajando: algo descarga la batería o ya está gastada.']); }
  if (arr.length && arr[arr.length - 1] < 9.6) veredicto.push(['r', 'Al arrancar la batería baja de 9.6 V: está débil.']);
  if (cool.length && Math.max(...cool.slice(-5)) >= 105) veredicto.push(['r', 'El motor ha pasado de 105 °C en viajes recientes: revisa anticongelante y ventilador.']);
  if (ltft != null && Math.abs(ltft) > 10) veredicto.push(['a', `Ajuste de combustible largo en ${n(ltft, 1)} %: posible fuga de vacío, sensor o inyectores (mezcla ${ltft > 0 ? 'pobre' : 'rica'}).`]);
  if (F.codes && F.codes.length) veredicto.push(['a', `Hay ${F.codes.length} código(s) de falla guardado(s).`]);
  if (!veredicto.length) veredicto.push(['g', 'Todo se ve bien con los datos que hay.']);
  body.innerHTML = '<div class="kvs">' + veredicto.map(([c, t]) => `<p class="note"><b class="${c}">●</b> ${t}</p>`).join('') + '</div>' +
    '<h3>Batería en reposo (V)</h3>' + mini(rep, 11.8, 12.9, '#4be36d') +
    '<h3>Batería al arrancar (V)</h3>' + mini(arr, 8.5, 11, '#ffb02e') +
    '<h3>Temperatura máxima por viaje (°C)</h3>' + mini(cool, 70, 115, '#ff3b45') +
    '<h3>Ahora</h3>' + kv('Ajuste corto / largo', `${n(stft, 1)} % / ${n(ltft, 1)} %`) + kv('Avance de encendido', `${n(F.D.timing, 1)}°`) + kv('Aceite', `${n(F.D.oil)} °C`) +
    '<p class="note">Algunos datos dependen de que tu Forte los reporte por el OBD.</p>';
});

/* ================= comandos de voz ================= */
const sinAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
window.forteDash.heard = txt => procesar(txt);
function escuchar() {
  if (window.OBD && OBD.listen) { OBD.listen(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { ui.toast('Los comandos de voz funcionan en la app del teléfono'); return; }
  const r = new SR(); r.lang = 'es-MX'; r.onresult = e => procesar(e.results[0][0].transcript); r.onerror = () => ui.toast('No te escuché'); r.start();
}
function decir(t) { F.speak(t); F.emit('alert', { id: 'voz', text: t, kind: 'ok' }); }
function procesar(txt) {
  const t = sinAcento(txt || ''), V = F.V;
  if (!t) { ui.toast('No te escuché'); return; }
  if (/gasolinera/.test(t) && F.nav) { decir('Te llevo a la gasolinera más cercana'); F.nav.gas(); return; }
  if (/gasolinera/.test(t)) { decir('Buscando la gasolinera más cercana'); buscarGas().then(L => { if (!L[0]) return decir('No encontré gasolineras cerca'); decir(`${L[0].name}, a ${fmtD(L[0].d)}`); abrirMapa(L[0].lat, L[0].lon); }).catch(() => decir('Necesito el GPS y datos móviles')); return; }
  if (/gasolina|combustible|tanque/.test(t)) return decir(V.fuel == null ? 'No tengo el dato de gasolina' : `Tienes ${Math.round(V.fuel)} por ciento de gasolina, unos ${Math.round(V.range || 0)} kilómetros`);
  if (/bateria|voltaje/.test(t)) return decir(V.volt == null ? 'No tengo el dato de la batería' : `La batería está en ${V.volt.toFixed(1)} voltios`);
  if (/temperatura|motor|calient/.test(t)) return decir(V.coolant == null ? 'No tengo la temperatura del motor' : `El motor está a ${Math.round(V.coolant)} grados`);
  if (/velocidad|que tan rapido/.test(t)) return decir(`Vas a ${Math.round(V.speed)} kilómetros por hora`);
  if (/rendimiento|consumo|kilometros por litro/.test(t)) return decir(V.avg ? `Llevas ${V.avg.toFixed(1)} kilómetros por litro en este viaje` : 'Todavía no hay rendimiento del viaje');
  if (/estacion|donde (deje|esta) (mi|el) (carro|auto|coche)/.test(t)) {
    const p = store('forte-estacionado'), g = gpsReal();
    if (!p) return decir('No tengo guardado dónde está el auto');
    decir(g ? `Tu auto está a ${fmtD(dist(g.lat, g.lon, p.lat, p.lon))}` : 'Abriendo dónde dejaste el auto');
    abrirMapa(p.lat, p.lon, 'walking'); return;
  }
  if (/bache/.test(t)) return marcarTope('bache');
  if (/tope/.test(t)) return marcarTope('tope');
  if (/foto/.test(t)) { if (!ui.cam.stream) ui.camStart().then(() => setTimeout(ui.camFoto, 800)); else ui.camFoto(); return decir('Tomando foto'); }
  if (/graba|video/.test(t)) { (ui.cam.stream ? Promise.resolve() : ui.camStart()).then(() => ui.recStart()); return decir('Grabando'); }
  if (/viaje/.test(t)) return decir(`Llevas ${F.trip.km.toFixed(1)} kilómetros, calificación ${F.scoreVal()}`);
  if (/falla|check/.test(t)) { F.readCodes(); return decir('Leyendo fallas'); }
  if (/noche/.test(t)) { F.cfg.noche = F.isNight() ? 'off' : 'on'; F.save(); return decir(F.cfg.noche === 'on' ? 'Modo noche' : 'Modo día'); }
  if (/diseno|pantalla|siguiente/.test(t)) { const i = F.SKINS.findIndex(s => s.id === F.cfg.skin); const s = F.SKINS[(i + 1) % F.SKINS.length]; ui.setSkin(s.id); return decir(s.name); }
  if (/ayuda|que puedes/.test(t)) return decir('Pregúntame por gasolina, batería, motor, velocidad o rendimiento. Di gasolinera, dónde está mi carro, tope, foto, grabar, fallas, modo noche o siguiente diseño.');
  decir('No entendí. Di ayuda para ver los comandos.');
}
ui.addPanel('voz', 'Comandos de voz', () => {
  body.innerHTML = '<p class="note">Toca el micrófono de arriba y di, por ejemplo:</p><ul class="list">' +
    ['"¿Cuánta gasolina tengo?"', '"Batería" · "Temperatura" · "Velocidad" · "Rendimiento"', '"Gasolinera" (te guía con flechas a la más cercana)', '"¿Dónde está mi carro?"', '"Tope" o "Bache" (lo guarda)', '"Foto" · "Grabar"', '"Fallas" · "Modo noche" · "Siguiente diseño"'].map(x => `<li>${x}</li>`).join('') + '</ul>' +
    btn('vProbar', 'Probar ahora', 'pri');
  $('vProbar').onclick = () => { ui.close(); escuchar(); };
});

/* ================= carros alrededor con la cámara ================= */
F.objs = []; F.frontDist = null;
let modelo = null, detectando = false, cargando = false;
const ANCHO = { car: 1.8, truck: 2.5, bus: 2.5, motorcycle: .8, bicycle: .6, person: .5 };
function cargarScript(src) {
  return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('no cargó ' + src)); document.head.appendChild(s); });
}
// el detector corre si lo pide cualquiera: carros, peatones o semáforo
const quiereModelo = () => !!(F.cfg.deteccion || (F.cfg.peatones && F.cfg.peatones !== 'off') || F.cfg.semaforo);
async function iniciarDeteccion() {
  if (detectando || cargando) return;
  cargando = true;
  try {
    if (!ui.cam.stream) await ui.camStart();
    if (!ui.cam.stream) throw new Error('sin cámara');
    if (!window.cocoSsd) {
      await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');
      await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
    }
    F.detStatus = { estado: 'cargando detector', n: 0 };
    if (window.tf && tf.getBackend && tf.getBackend() !== 'webgl') { try { await tf.setBackend('webgl'); } catch (e) {} }
    if (window.tf && tf.ready) await tf.ready();
    modelo = modelo || await window.cocoSsd.load({ base: 'mobilenet_v2' });
    detectando = true;
    ui.toast('Cámara inteligente activa');
    ciclo();
  } catch (e) {
    F.detStatus = { estado: 'error: ' + (e.message || e), n: 0 };
    ui.toast('No se pudo activar la detección: ' + (e.message || e) + '. Necesita internet la primera vez.');
  } finally { cargando = false; }
}
function detenerDeteccion() { detectando = false; F.objs = []; F.frontDist = null; F.detStatus = { estado: 'apagada', n: 0 }; F.emit('det', null); }
// prende o apaga el detector según lo que esté activado
F.visionRevisar = () => { if (quiereModelo()) return iniciarDeteccion(); if (detectando) detenerDeteccion(); return Promise.resolve(); };
F.det = { on: () => { F.cfg.deteccion = true; F.save(); return F.visionRevisar(); }, off: () => { F.cfg.deteccion = false; F.save(); F.visionRevisar(); } };
// la detección corre sobre una copia chica del cuadro (el visor está escondido)
const lienzo = document.createElement('canvas'), lctx = lienzo.getContext('2d', { willReadFrequently: true });
F.detStatus = { estado: 'apagada', n: 0 };
async function ciclo() {
  if (!detectando) return;
  const v = $('camVid');
  if (ui.cam.stream && v.paused) v.play().catch(() => {});
  if (!ui.cam.stream) F.detStatus = { estado: 'sin cámara', n: 0 };
  else if (!v.videoWidth) F.detStatus = { estado: 'esperando imagen', n: 0 };
  if (ui.cam.stream && v.videoWidth) {
    try {
      const vw = 640, vh = Math.round(640 * v.videoHeight / v.videoWidth), focal = vw * .714;
      if (lienzo.width !== vw || lienzo.height !== vh) { lienzo.width = vw; lienzo.height = vh; }
      lctx.drawImage(v, 0, 0, vw, vh);
      const det = await modelo.detect(lienzo, 20, .35);
      if (!detectando) return;
      F.emit('det', { det, lienzo, lctx, vw, vh, focal });
      F.objs = det.filter(d => ANCHO[d.class] && d.score >= .4).map(d => {
        const [x, y, w, h] = d.bbox;
        return { cls: d.class, cx: (x + w / 2) / vw, w: w / vw, h: h / vh, dist: ANCHO[d.class] * focal / Math.max(8, w) };
      });
      const frente = F.objs.filter(o => Math.abs(o.cx - .5) < .16 && o.cls !== 'person' && o.cls !== 'bicycle').sort((a, b) => a.dist - b.dist)[0];
      F.frontDist = frente ? frente.dist : null;
      F.detStatus = { estado: 'activa', n: F.objs.filter(o => o.cls !== 'person' && o.cls !== 'bicycle').length, t: Date.now() };
      const vms = F.S.speed / 3.6;
      if (frente && vms > 4 && F.cfg.deteccion) {
        const seg = frente.dist / vms;
        if (seg < 1.0 && cada('distancia', 6)) F.alert('distancia', `Muy cerca del de adelante: ${Math.round(frente.dist)} m`, 'crit', 'Cuidado, muy cerca');
      }
    } catch (e) { F.detStatus = { estado: 'error: ' + (e.message || e), n: 0 }; }
  }
  setTimeout(ciclo, 200);
}
ui.addPanel('deteccion', 'Carros alrededor (cámara)', () => {
  body.innerHTML = '<p class="note">Pon el teléfono en un soporte con la cámara trasera viendo hacia el frente. La app detecta carros, motos y personas, los dibuja en el camino del diseño Forte Tesla y te avisa con voz si vas muy pegado al de adelante. Gasta más batería y la primera vez necesita internet para bajar el detector.</p>' +
    (detectando ? kv('Estado', esc(F.detStatus.estado)) + kv('Backend', window.tf && tf.getBackend ? tf.getBackend() : '—') + kv('Objetos', String(F.objs.length)) + kv('Al frente', F.frontDist == null ? '—' : `${Math.round(F.frontDist)} m`) + btn('dOff', 'Apagar detección')
      : btn('dOn', cargando ? 'Cargando…' : 'Activar detección', 'pri')) +
    '<p class="note">La distancia es aproximada; no sustituye tu atención al manejar.</p>';
  if ($('dOn')) $('dOn').onclick = () => F.det.on().then(() => ui.render());
  if ($('dOff')) $('dOff').onclick = () => { F.det.off(); ui.render(); };
});
if (quiereModelo() && F.app) setTimeout(iniciarDeteccion, 3000);
})();

/* ================= barra de botones de Forte Tesla ================= */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$;
const store = F.store;
const RAD = Math.PI / 180;
const dist = (a, b, c, d) => { const R = 6371000, x = (c - a) * RAD, y = (d - b) * RAD, h = Math.sin(x / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const rumbo = (a, b, c, d) => { const y = Math.sin((d - b) * RAD) * Math.cos(c * RAD), x = Math.cos(a * RAD) * Math.sin(c * RAD) - Math.sin(a * RAD) * Math.cos(c * RAD) * Math.cos((d - b) * RAD); return (Math.atan2(y, x) / RAD + 360) % 360; };
const angDif = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const gpsReal = () => F.gps && !F.gps.sim ? F.gps : null;
const fmtD = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

/* ---- guardar los últimos segundos (búfer en memoria mientras la cámara está prendida) ---- */
const B = { rec: null, prev: null, salvar: false, mime: '' };
function bufferCiclo() {
  const cam = ui.cam;
  if (!cam.stream || cam.rec || B.rec) return;
  B.mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  const chunks = [];
  let r;
  try { r = new MediaRecorder(cam.stream, B.mime ? { mimeType: B.mime, videoBitsPerSecond: 2_000_000 } : { videoBitsPerSecond: 2_000_000 }); } catch (e) { return; }
  r.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  r.onstop = () => {
    const type = r.mimeType || 'video/webm', blob = new Blob(chunks, { type });
    if (B.salvar) {
      B.salvar = false;
      const ext = type.includes('mp4') ? 'mp4' : 'webm', st = ui.stamp();
      if (B.prev) ui.guardar(B.prev, 'evento', `Evento_${st}_a.${ext}`, type.split(';')[0]);
      ui.guardar(blob, 'evento', `Evento_${st}_b.${ext}`, type.split(';')[0]);
      B.prev = null;
      F.alert('evento', 'Video del evento guardado', 'ok', 'Video guardado');
    } else B.prev = blob;
    if (B.rec === r) B.rec = null;
    bufferCiclo();
  };
  B.rec = r; r.start(1000);
  setTimeout(() => { if (r.state === 'recording') r.stop(); }, 20000);
}
setInterval(() => {
  if (ui.cam.stream && !ui.cam.rec) bufferCiclo();
  if ((!ui.cam.stream || ui.cam.rec) && B.rec && B.rec.state === 'recording') { B.salvar = false; B.rec.stop(); }
}, 2000);
function guardarEvento() {
  const cam = ui.cam;
  if (!cam.stream) { ui.toast('Prende la cámara (Grabar o Carros) para guardar eventos'); return; }
  if (cam.rec && cam.rec.state === 'recording') { cam.rec.stop(); F.alert('evento', 'Guardando el video de este momento', 'ok', 'Video guardado'); return; }
  if (B.rec && B.rec.state === 'recording') { B.salvar = true; B.rec.stop(); return; }
  ui.toast('Espera un segundo, la cámara está empezando');
}

/* ---- radares de velocidad (mapa comunitario) ---- */
let radares = [], radPos = null, radBusy = false;
const avisoRad = {};
function cargarRadares() {
  const g = gpsReal(); if (!g || radBusy) return;
  if (radPos && dist(radPos[0], radPos[1], g.lat, g.lon) < 1500) return;
  radBusy = true; radPos = [g.lat, g.lon];
  fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(`[out:json][timeout:15];node(around:5000,${g.lat},${g.lon})[highway=speed_camera];out 60;`) })
    .then(r => r.json()).then(j => { radares = (j.elements || []).map(e => ({ id: e.id, lat: e.lat, lon: e.lon, max: parseInt((e.tags || {}).maxspeed) || null })); })
    .catch(() => {}).finally(() => { radBusy = false; });
}
setInterval(() => {
  if (F.cfg.radares === false) return;
  const g = gpsReal(); if (!g) return;
  if (F.S.speed > 5) cargarRadares();
  if (F.S.speed < 15) return;
  for (const r of radares) {
    const d = dist(g.lat, g.lon, r.lat, r.lon);
    if (d > 450 || d < 20 || (avisoRad[r.id] && Date.now() - avisoRad[r.id] < 180000)) continue;
    if (g.bearing != null && angDif(rumbo(g.lat, g.lon, r.lat, r.lon), g.bearing) > 40) continue;
    avisoRad[r.id] = Date.now();
    F.alert('radar', `Radar de velocidad a ${fmtD(d)}${r.max ? ' · límite ' + r.max : ''}`, 'warn', `Radar a ${Math.round(d / 50) * 50} metros`);
  }
}, 2000);

/* ---- mandar ubicación ---- */
function mandarUbicacion() {
  const g = gpsReal();
  if (!g) { ui.toast('Necesito el GPS del teléfono'); return; }
  const t = `Aquí voy en mi Forte: https://maps.google.com/?q=${g.lat.toFixed(6)},${g.lon.toFixed(6)}`;
  if (window.OBD && OBD.share) OBD.share(t);
  else { const a = document.createElement('a'); a.href = 'https://wa.me/?text=' + encodeURIComponent(t); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
}

/* ---- gasolinera más cercana directo ---- */
function irGasolinera() {
  const g = gpsReal();
  if (!g) { ui.toast('Necesito el GPS del teléfono'); return; }
  ui.toast('Buscando la gasolinera más cercana…');
  fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(`[out:json][timeout:15];(node(around:6000,${g.lat},${g.lon})[amenity=fuel];way(around:6000,${g.lat},${g.lon})[amenity=fuel];);out center 30;`) })
    .then(r => r.json()).then(j => {
      const L = (j.elements || []).map(e => { const la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon); return { n: (e.tags && (e.tags.brand || e.tags.name)) || 'Gasolinera', la, lo, d: la == null ? 1e9 : dist(g.lat, g.lon, la, lo) }; }).sort((a, b) => a.d - b.d);
      if (!L[0]) { ui.toast('No encontré gasolineras cerca'); return; }
      F.alert('gasnav', `${L[0].n} a ${fmtD(L[0].d)}`, 'ok', `Te llevo a ${L[0].n}`);
      const url = `https://www.google.com/maps/dir/?api=1&destination=${L[0].la},${L[0].lo}&travelmode=driving`;
      if (window.OBD && OBD.openUrl) OBD.openUrl(url); else window.open(url, '_blank', 'noopener');
    }).catch(() => ui.toast('No se pudo buscar. Revisa los datos móviles.'));
}

F.guardarEvento = guardarEvento;

/* ---- desde el reloj ---- */
window.forteDash.watchTope = () => F.marcarTope('tope');

/* ---- la barra ---- */
const I = {
  rec: '<circle cx="12" cy="12" r="6"/>',
  evento: '<path d="M12 3v10M7 9l5 5 5-5M5 20h14"/>',
  carros: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 12h16"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/>',
  gas: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M7 8h5"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  tope: '<path d="M2 18h20M5 18c1.5-5 4-7 7-7s5.5 2 7 7"/>',
  bache: '<path d="M3 15h4l2 3h6l2-3h4"/><path d="M8 12l1-2M12 11V8M16 12l-1-2"/>',
  carro: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  ubic: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  radar: '<circle cx="12" cy="13" r="3"/><path d="M6.5 7.5a8 8 0 0 1 11 0M4 5a11.5 11.5 0 0 1 16 0"/>',
  voz: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  viaje: '<path d="M4 19h16M6 15l4-6 4 3 4-7"/>'
};
const BOTONES = [
  ['rec', 'Grabar', () => { const c = ui.cam; if (c.rec) { ui.recStop(); } else (c.stream ? Promise.resolve() : ui.camStart()).then(() => { if (ui.cam.stream) ui.recStart(); pintar(); }); pintar(); }],
  ['evento', 'Guardar', guardarEvento],
  ['carros', 'Carros', () => { if (F.cfg.deteccion) { F.det.off(); ui.toast('Detección de carros apagada'); pintar(); } else { ui.toast('Activando la detección…'); F.det.on().then(pintar); } }],
  ['gas', 'Gasolina', () => F.nav ? (F.nav.activo() ? F.nav.parar(true) : F.nav.gas()) : irGasolinera()],
  ['tope', 'Tope', () => F.marcarTope('tope')],
  ['bache', 'Bache', () => F.marcarTope('bache')],
  ['carro', 'Mi carro', () => ui.open('estacionado')],
  ['ubic', 'Ubicación', mandarUbicacion],
  ['radar', 'Radares', () => { F.cfg.radares = F.cfg.radares === false; F.save(); ui.toast(F.cfg.radares ? 'Aviso de radares activado' : 'Aviso de radares apagado'); pintar(); }],
  ['voz', 'Voz', () => $('btnVoz').click()],
  ['viaje', 'Viaje', () => ui.open('viaje')]
];
const dock = document.createElement('nav');
dock.id = 'dock'; dock.setAttribute('aria-label', 'Accesos rápidos');
dock.innerHTML = BOTONES.map(([id, l]) => `<button type="button" data-b="${id}"><svg viewBox="0 0 24 24">${I[id]}</svg><span>${l}</span></button>`).join('');
document.body.appendChild(dock);
dock.querySelectorAll('button').forEach(b => { const def = BOTONES.find(x => x[0] === b.dataset.b); b.onclick = () => def[2](); });
function pintar() {
  const on = { rec: !!ui.cam.rec, carros: !!F.cfg.deteccion, radar: F.cfg.radares !== false, gas: !!(F.nav && F.nav.activo()) };
  dock.querySelectorAll('button').forEach(b => b.classList.toggle('on', !!on[b.dataset.b]));
}
setInterval(pintar, 1000); pintar();
const css = document.createElement('style');
css.textContent = `
#dock{display:none;position:fixed;left:0;right:0;bottom:0;z-index:14;height:calc(58px + env(safe-area-inset-bottom,0px));
  padding:4px max(10px,env(safe-area-inset-right,0px)) env(safe-area-inset-bottom,0px) max(10px,env(safe-area-inset-left,0px));
  background:rgba(14,18,26,.92);backdrop-filter:blur(8px);border-top:1px solid rgba(255,255,255,.08);justify-content:center;gap:4px}
body[data-skin="tesla"] #dock{display:flex}
body[data-skin="tesla"] #stage{bottom:calc(58px + env(safe-area-inset-bottom,0px))}
body[data-skin="tesla"] #btnTope,body[data-skin="tesla"] #btnVoz{display:none}
#dock button{flex:1;max-width:96px;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:0;border-radius:12px;background:transparent;color:#cfd6e2;cursor:pointer;padding:4px 2px}
#dock svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#dock span{font-size:11px;font-weight:600;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#dock button:active{background:rgba(255,255,255,.08)}
#dock button.on{color:#fff;background:rgba(47,123,255,.28)}
#dock button[data-b="rec"].on{background:rgba(229,53,43,.35)}
#dock button[data-b="rec"] svg circle{fill:currentColor}
html.hud #dock{display:none!important}`;
document.head.appendChild(css);
// al entrar o salir de Forte Tesla cambia el alto disponible
new MutationObserver(() => window.dispatchEvent(new Event('resize'))).observe(document.body, { attributes: true, attributeFilter: ['data-skin'] });
})();
