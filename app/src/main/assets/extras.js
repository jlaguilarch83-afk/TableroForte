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
boton('btnTope', ICO.tope, 'Marcar tope aquí', () => marcarTope());
boton('btnVoz', ICO.mic, 'Comando de voz', () => escuchar());

/* ================= límite de velocidad de la calle ================= */
F.streetLimit = null;
let limPos = null, limT = 0, limBusy = false, overCalle = 0;
function revisarLimite() {
  const g = gpsReal(); if (!g || limBusy) return;
  if (limPos && dist(limPos[0], limPos[1], g.lat, g.lon) < 120 && Date.now() - limT < 90000) return;
  limBusy = true; limPos = [g.lat, g.lon]; limT = Date.now();
  overpass(`[out:json][timeout:10];way(around:30,${g.lat},${g.lon})[highway][maxspeed];out tags 3;`)
    .then(j => {
      const w = (j.elements || [])[0], v = w && parseInt(w.tags.maxspeed);
      F.streetLimit = v > 0 ? { v, name: w.tags.name || '' } : null;
    }).catch(() => {}).finally(() => { limBusy = false; });
}
setInterval(() => { if (F.S.speed > 5) revisarLimite(); }, 5000);
F.on('frame', dt => {
  const L = F.streetLimit;
  if (L && F.S.speed > L.v + 5) {
    overCalle += dt;
    if (overCalle > 2 && cada('calle', 30)) F.alert('calle', `Límite de esta calle: ${L.v} km/h`, 'crit', `Cuidado, el límite aquí es ${L.v}`);
  } else overCalle = 0;
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
const topes = store('forte-topes') || [];
const avisados = {};
function marcarTope() {
  const g = gpsReal();
  if (!g) { ui.toast('Necesito el GPS para marcar el tope'); return; }
  topes.push({ lat: g.lat, lon: g.lon, rumbo: g.bearing ?? null, t: Date.now() });
  store('forte-topes', topes);
  ui.toast('Tope guardado'); F.speak('Tope guardado');
}
setInterval(() => {
  const g = gpsReal(); if (!g || F.S.speed < 12) return;
  topes.forEach((tp, i) => {
    const d = dist(g.lat, g.lon, tp.lat, tp.lon);
    if (d > 160 || d < 15 || (avisados[i] && Date.now() - avisados[i] < 120000)) return;
    if (g.bearing != null && angDif(rumbo(g.lat, g.lon, tp.lat, tp.lon), g.bearing) > 45) return;
    avisados[i] = Date.now();
    F.alert('tope', `Tope adelante, a ${fmtD(d)}`, 'warn', 'Tope adelante');
  });
}, 1500);
ui.addPanel('topes', 'Topes y baches', () => {
  body.innerHTML = '<p class="note">Toca el botón de tope (arriba, junto al menú) o di "tope" cuando pases uno. La próxima vez que vayas hacia él, te aviso con voz 150 m antes.</p>' +
    btn('tMarcar', 'Marcar tope aquí', 'pri') +
    (topes.length ? `<h3>${topes.length} guardados</h3><ul class="list">` + topes.slice().reverse().slice(0, 30).map((t, k) => {
      const i = topes.length - 1 - k, g = gpsReal();
      return `<li><span>${new Date(t.t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}${g ? ' · a ' + fmtD(dist(g.lat, g.lon, t.lat, t.lon)) : ''}</span><button type="button" class="mini" data-del="${i}">Quitar</button></li>`;
    }).join('') + '</ul>' : '<p class="note">Todavía no hay topes guardados.</p>');
  $('tMarcar').onclick = () => { marcarTope(); ui.render(); };
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
  if (/tope|bache/.test(t)) return marcarTope();
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
    ['"¿Cuánta gasolina tengo?"', '"Batería" · "Temperatura" · "Velocidad" · "Rendimiento"', '"Gasolinera" (te lleva a la más cercana)', '"¿Dónde está mi carro?"', '"Tope" (lo guarda)', '"Foto" · "Grabar"', '"Fallas" · "Modo noche" · "Siguiente diseño"'].map(x => `<li>${x}</li>`).join('') + '</ul>' +
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
    modelo = modelo || await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    detectando = true; F.cfg.deteccion = true; F.save();
    ui.toast('Detección de carros activa');
    ciclo();
  } catch (e) {
    ui.toast('No se pudo activar la detección: ' + (e.message || e) + '. Necesita internet la primera vez.');
  } finally { cargando = false; }
}
function detenerDeteccion() { detectando = false; F.objs = []; F.frontDist = null; F.cfg.deteccion = false; F.save(); }
async function ciclo() {
  if (!detectando) return;
  const v = $('camVid');
  if (ui.cam.stream && v.videoWidth) {
    try {
      const det = await modelo.detect(v, 8, .5), vw = v.videoWidth, vh = v.videoHeight, focal = vw * .714;
      F.objs = det.filter(d => ANCHO[d.class]).map(d => {
        const [x, y, w, h] = d.bbox;
        return { cls: d.class, cx: (x + w / 2) / vw, w: w / vw, h: h / vh, dist: ANCHO[d.class] * focal / Math.max(8, w) };
      });
      const frente = F.objs.filter(o => Math.abs(o.cx - .5) < .16 && o.cls !== 'person').sort((a, b) => a.dist - b.dist)[0];
      F.frontDist = frente ? frente.dist : null;
      const vms = F.S.speed / 3.6;
      if (frente && vms > 4) {
        const seg = frente.dist / vms;
        if (seg < 1.0 && cada('distancia', 6)) F.alert('distancia', `Muy cerca del de adelante: ${Math.round(frente.dist)} m`, 'crit', 'Cuidado, muy cerca');
      }
    } catch (e) { /* cuadro perdido */ }
  }
  setTimeout(ciclo, 250);
}
ui.addPanel('deteccion', 'Carros alrededor (cámara)', () => {
  body.innerHTML = '<p class="note">Pon el teléfono en un soporte con la cámara trasera viendo hacia el frente. La app detecta carros, motos y personas, los dibuja en el camino del diseño Forte Tesla y te avisa con voz si vas muy pegado al de adelante. Gasta más batería y la primera vez necesita internet para bajar el detector.</p>' +
    (detectando ? kv('Estado', 'Activa') + kv('Objetos', String(F.objs.length)) + kv('Al frente', F.frontDist == null ? '—' : `${Math.round(F.frontDist)} m`) + btn('dOff', 'Apagar detección')
      : btn('dOn', cargando ? 'Cargando…' : 'Activar detección', 'pri')) +
    '<p class="note">La distancia es aproximada; no sustituye tu atención al manejar.</p>';
  if ($('dOn')) $('dOn').onclick = () => iniciarDeteccion().then(() => ui.render());
  if ($('dOff')) $('dOff').onclick = () => { detenerDeteccion(); ui.render(); };
});
if (F.cfg.deteccion && F.app) setTimeout(iniciarDeteccion, 3000);
})();
