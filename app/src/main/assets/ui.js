/* Tablero Forte · interfaz: menú, paneles, alertas, cámara, bienvenida y HUD */
(function () {
'use strict';
const F = window.F, $ = F.$, K = F.K;
const n = (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toFixed(d);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const ui = F.ui = {};

/* ---------- códigos de falla ---------- */
const DTC = {
  P0420: 'Eficiencia del catalizador baja (banco 1). Revisa catalizador y sensores de oxígeno.',
  P0171: 'Mezcla muy pobre (banco 1). Común por fuga de vacío o inyectores sucios.',
  P0172: 'Mezcla muy rica (banco 1).',
  P0300: 'Falla de encendido aleatoria en varios cilindros.',
  P0301: 'Falla de encendido en el cilindro 1.', P0302: 'Falla de encendido en el cilindro 2.',
  P0303: 'Falla de encendido en el cilindro 3.', P0304: 'Falla de encendido en el cilindro 4.',
  P0128: 'El motor tarda en calentar; posible termostato.',
  P0133: 'Sensor de oxígeno lento (banco 1, sensor 1).',
  P0135: 'Calentador del sensor de oxígeno (banco 1, sensor 1).',
  P0141: 'Calentador del sensor de oxígeno (banco 1, sensor 2).',
  P0442: 'Fuga pequeña en el sistema de vapores de gasolina (EVAP).',
  P0455: 'Fuga grande en el sistema EVAP. Revisa que el tapón de gasolina cierre bien.',
  P0456: 'Fuga muy pequeña en el sistema EVAP.',
  P0500: 'Falla en el sensor de velocidad del vehículo.',
  P0506: 'Ralentí más bajo de lo esperado.', P0507: 'Ralentí más alto de lo esperado.'
};
F.dtcText = c => DTC[c] || `Código registrado. Búscalo como "${c} Kia Forte" para ver la causa.`;

/* ---------- diseños ---------- */
const host = $('skinHost'), cv = $('cv'), cx = cv.getContext('2d');
let canvasDef = null;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
}
window.addEventListener('resize', resize);
ui.setSkin = function (id) {
  const def = F.SKINS.find(s => s.id === id) || F.SKINS[0];
  if (F.skin && F.skin.unmount) F.skin.unmount();
  document.body.dataset.skin = def.id;
  if (def.kind === 'dom') {
    cv.hidden = true; host.hidden = false; canvasDef = null;
    def.mount(host); F.skin = def;
  } else {
    host.hidden = true; cv.hidden = false; resize(); canvasDef = def;
    F.skin = { frame(V) { F.renderCanvas(cx, canvasDef, cv.width, cv.height, V); } };
  }
  F.cfg.skin = def.id; F.save();
};

/* ---------- barra superior ---------- */
const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 5v14M19 5l-10 7 10 7z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
};
$('btnMenu').innerHTML = ICON.menu;
$('mPrev').innerHTML = ICON.prev; $('mPlay').innerHTML = ICON.play; $('mNext').innerHTML = ICON.next;
$('btnShot').innerHTML = ICON.cam;
$('musicBar').hidden = !F.app;
const media = a => { if (window.OBD && OBD.media) OBD.media(a); };
$('mPrev').onclick = () => media('prev'); $('mPlay').onclick = () => media('play'); $('mNext').onclick = () => media('next');
$('btnMenu').onclick = () => ui.open();
$('chip').onclick = () => ui.open('conexion');
function pintarConn() { $('chipTxt').textContent = F.conn.text; $('chip').dataset.k = F.conn.kind; }
F.on('conn', () => { pintarConn(); if (seccion === 'conexion') render(); });
pintarConn();

/* ---------- avisos ---------- */
let bannerT = null;
F.on('alert', a => {
  const b = $('banner'); b.textContent = a.text; b.dataset.k = a.kind; b.hidden = false;
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, a.kind === 'crit' ? 7000 : 5000);
});
$('banner').onclick = () => { $('banner').hidden = true; };
function toast(t) { F.emit('alert', { text: t, kind: 'ok' }); }
ui.toast = toast;

/* ---------- menú ---------- */
const SECCIONES = [
  ['disenos', 'Diseños'], ['conexion', 'Conexión OBD'], ['bateria', 'Batería'], ['viaje', 'Viaje'], ['mapa', 'Mapa del viaje'],
  ['herramientas', 'Arrancadas y fuerza G'], ['fallas', 'Fallas'], ['aceite', 'Aceite'], ['gasolina', 'Bitácora de gasolina'],
  ['camara', 'Cámara (dashcam)'], ['musica', 'Música'], ['alertas', 'Alertas y valet'], ['clima', 'Clima'], ['ajustes', 'Ajustes']
];
let seccion = null;
const body = $('dBody');
ui.open = function (sec) {
  $('drawer').hidden = false; $('scrim').hidden = false;
  seccion = sec || null; render();
};
ui.close = function () { $('drawer').hidden = true; $('scrim').hidden = true; seccion = null; stopLive(); };
$('dClose').onclick = ui.close; $('scrim').onclick = ui.close;
$('dBack').onclick = () => { seccion = null; stopLive(); render(); };

let live = null;
function stopLive() { if (live) { cancelAnimationFrame(live); live = null; } }
function render() {
  stopLive();
  const title = seccion ? SECCIONES.find(s => s[0] === seccion)[1] : 'Menú';
  $('dTitle').textContent = title; $('dBack').hidden = !seccion;
  if (!seccion) {
    body.innerHTML = '<div class="nav">' + SECCIONES.map(([id, l]) => `<button type="button" data-sec="${id}">${l}</button>`).join('') + '</div>';
    body.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { seccion = b.dataset.sec; render(); });
    return;
  }
  (PANELES[seccion] || (() => { body.innerHTML = ''; }))();
  body.scrollTop = 0;
}
const btn = (id, t, cls = '') => `<button type="button" id="${id}" class="${cls}">${t}</button>`;
const kv = (l, v) => `<div class="kv"><span>${l}</span><b>${v}</b></div>`;

/* ---------- paneles ---------- */
const PANELES = {
  disenos() {
    body.innerHTML = '<p class="note">Toca un diseño para usarlo. Los datos del auto son los mismos en todos.</p><div class="skins">' +
      F.SKINS.map(s => `<button type="button" class="skin${s.id === F.cfg.skin ? ' on' : ''}" data-id="${s.id}"><canvas width="320" height="124"></canvas><span>${s.name}</span></button>`).join('') + '</div>';
    const V = Object.assign({}, F.V, { speed: 88, rpm: 3200, throttle: 35, load: 42, coolant: 90, fuel: 64, volt: 14.2, kml: 17.4, avg: 15.8, tripKm: 23.6, gLong: .12, gLat: .18, heading: 42, pitch: 4, roll: -3, alt: 1440, score: 92 });
    body.querySelectorAll('.skin').forEach(b => {
      const def = F.SKINS.find(s => s.id === b.dataset.id), c = b.querySelector('canvas').getContext('2d');
      try { F.renderCanvas(c, def, 320, 124, V); } catch (e) { console.error(e); }
      b.onclick = () => { ui.setSkin(def.id); ui.close(); };
    });
  },

  conexion() {
    const st = window.OBD ? OBD.state() : 'web';
    let h = kv('Estado', esc(F.conn.text));
    if (!window.OBD) {
      h += '<p class="note">Estás viendo datos de ejemplo. En la app Android esta sección conecta tu adaptador ELM327 por Bluetooth.</p>';
      body.innerHTML = h; return;
    }
    if (st === 'nobt') h += '<p class="note">Este teléfono no tiene Bluetooth.</p>';
    else if (st === 'noperm') h += '<p class="note">Falta el permiso de "Dispositivos cercanos".</p>' + btn('perm', 'Dar permiso', 'pri');
    else if (st === 'off') h += '<p class="note">Prende el Bluetooth del teléfono y vuelve a abrir esta sección.</p>';
    else {
      let devs = []; try { devs = JSON.parse(OBD.devices()); } catch (e) {}
      const g = F.store('forte-obd');
      h += devs.length ? '<p class="note">Elige tu adaptador:</p>' + devs.map((d, i) =>
        `<button type="button" class="dev${g === d.address ? ' pri' : ''}" data-i="${i}">${esc(d.name)}<small>${esc(d.address)}</small></button>`).join('')
        : '<p class="note">No hay dispositivos emparejados. En Ajustes › Bluetooth empareja el que se llama "OBDII" (PIN 1234 o 0000).</p>';
      h += btn('desc', 'Desconectar');
      body.innerHTML = h;
      body.querySelectorAll('.dev').forEach(b => b.onclick = () => { const d = devs[+b.dataset.i]; F.store('forte-obd', d.address); OBD.connect(d.address); ui.close(); });
      $('desc').onclick = () => OBD.disconnect();
      return;
    }
    body.innerHTML = h;
    if ($('perm')) $('perm').onclick = () => OBD.askPermission();
  },

  bateria() {
    const tipoTxt = { reposo: 'En reposo (auto apagado)', arranque: 'Al arrancar (mínimo)', carga: 'Con el motor encendido' };
    const hora = t => new Date(t).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const reposoTxt = v => v >= 12.6 ? ['Llena', 'g'] : v >= 12.4 ? ['Alrededor de 75 %', 'g'] : v >= 12.2 ? ['Alrededor de 50 %', 'a'] : v >= 12.0 ? ['Alrededor de 25 %', 'r'] : ['Descargada', 'r'];
    const arranqueTxt = v => v >= 10 ? ['Bien', 'g'] : v >= 9.6 ? ['Regular', 'a'] : ['Débil', 'r'];
    const cargaTxt = v => v >= 13.2 ? ['Cargando bien', 'g'] : v >= 12.4 ? ['Carga baja (normal en Kia a velocidad constante)', 'a'] : ['No está cargando', 'r'];
    const paint = () => {
      const v = F.D.volt, on = F.S.rpm >= 400, log = F.batteryLog(), ult = t => log.filter(e => e.tipo === t).slice(-1)[0];
      let ahora = '—', cls = '';
      if (v != null) { const [txt, c] = on ? cargaTxt(v) : (F.S.rpm < 100 ? reposoTxt(v) : ['Encendido sin arrancar', 'a']); ahora = txt; cls = c; }
      const res = (e, f) => e ? `${n(e.v, 2)} V · <span class="${f(e.v)[1]}">${f(e.v)[0]}</span>` : '—';
      body.querySelector('.bnow').innerHTML =
        `<div class="bigval">${n(v, 2)}<small> V</small></div><p class="note"><span class="${cls}">${ahora}</span>${on ? ' · motor encendido' : ''}</p>` +
        kv('Último reposo', res(ult('reposo'), reposoTxt)) + kv('Último arranque', res(ult('arranque'), arranqueTxt)) + kv('Con motor encendido', res(ult('carga'), cargaTxt));
      const rep = log.filter(e => e.tipo === 'reposo');
      let tendencia = '';
      if (rep.length >= 2) {
        const a = rep[rep.length - 2], b = rep[rep.length - 1];
        if (b.v < a.v - .15) tendencia = `<p class="note warnbox">El voltaje en reposo bajó de ${n(a.v, 2)} a ${n(b.v, 2)} V. Algo la está descargando con el auto apagado.</p>`;
      }
      body.querySelector('.btrend').innerHTML = tendencia;
      body.querySelector('.blog').innerHTML = log.length ? '<ul class="list">' + log.slice(-15).reverse().map(e =>
        `<li><span>${hora(e.t)} · ${tipoTxt[e.tipo] || e.tipo}</span><b>${n(e.v, 2)} V</b></li>`).join('') + '</ul>' : '<p class="note">Todavía no hay registros. Se guardan solos cada vez que conectas el OBD con el auto apagado, al arrancar y con el motor encendido.</p>';
    };
    body.innerHTML = '<div class="bnow"></div><div class="btrend"></div>' +
      '<h3>Cómo medirla bien</h3><p class="note">Por la mañana, antes de arrancar, abre la app con la llave en ON sin encender el motor o con el auto apagado: guarda el voltaje en reposo. Luego arranca: guarda cuánto bajó al arrancar.</p>' +
      '<h3>Si se descarga muy pronto</h3><ul class="list tips">' +
      '<li>Desconecta el adaptador OBD al estacionarte. Los ELM327 baratos se quedan prendidos y descargan la batería en pocos días.</li>' +
      '<li>Revisa luces de cajuela, guantera o cortesía que se queden encendidas, y accesorios conectados siempre (cámaras, cargadores).</li>' +
      '<li>Si al arrancar baja de 9.6 V, la batería ya está débil; si tiene más de 3 o 4 años, conviene una prueba de carga en una refaccionaria.</li>' +
      '<li>Bornes sulfatados (polvo blanco o verde) también hacen que no cargue bien.</li></ul>' +
      '<h3>Registro</h3><div class="blog"></div>';
    paint(); const iv = setInterval(() => { if (seccion !== 'bateria') return clearInterval(iv); paint(); }, 1000);
  },

  viaje() {
    const paint = () => {
      const T = F.trip, V = F.V;
      body.querySelector('.kvs').innerHTML = kv('Distancia', `${n(T.km, 1)} km`) + kv('Tiempo', F.fmtTime(T.seg)) +
        kv('Rendimiento promedio', V.avg ? `${n(V.avg, 1)} km/L` : '—') + kv('Velocidad promedio', T.mov > 5 ? `${n(T.km / (T.mov / 3600))} km/h` : '—') +
        kv('Velocidad máxima', `${n(T.vmax)} km/h`) + kv('Gasolina usada', `${n(T.litros, 2)} L`) + kv('Gasto', `$${n(T.litros * F.cfg.precio, 2)}`) +
        kv('Calificación de manejo', `${F.scoreVal()} / 100`);
    };
    body.innerHTML = '<div class="kvs"></div>' + btn('share', 'Compartir por WhatsApp', 'pri') + btn('reset', 'Reiniciar viaje');
    paint(); const iv = setInterval(() => { if (seccion !== 'viaje') return clearInterval(iv); paint(); }, 1000);
    $('share').onclick = compartir;
    $('reset').onclick = () => { F.resetTrip(); paint(); toast('Viaje reiniciado'); };
  },

  mapa() {
    body.innerHTML = '<div class="map" id="map"><div class="tiles" id="tiles"></div><canvas id="route"></canvas><span class="attr">© OpenStreetMap</span></div>' +
      `<div class="row">${btn('zin', 'Acercar')}${btn('zout', 'Alejar')}</div><p class="note" id="mapNote"></p>`;
    let zoom = null;
    const draw = () => mapa($('map'), zoom, z => { zoom = z; });
    $('zin').onclick = () => { zoom = (zoom || 14) + 1; draw(); };
    $('zout').onclick = () => { zoom = Math.max(3, (zoom || 14) - 1); draw(); };
    draw();
    const iv = setInterval(() => { if (seccion !== 'mapa') return clearInterval(iv); draw(); }, 5000);
  },

  herramientas() {
    const P = F.perf;
    body.innerHTML = `<h3>0 a 100 km/h</h3>${kv('Último', P.c100 ? n(P.c100, 2) + ' s' : '—')}${kv('Mejor', P.b100 ? n(P.b100, 2) + ' s' : '—')}
      <h3>Cuarto de milla (402 m)</h3>${kv('Último', P.qm ? `${n(P.qm, 2)} s a ${n(P.trap)} km/h` : '—')}${kv('Mejor', P.bqm ? n(P.bqm, 2) + ' s' : '—')}
      <p class="note" id="perfSt"></p>
      <h3>Fuerza G</h3><canvas id="gcv" width="300" height="300" class="gcv"></canvas><div id="gVals" class="note"></div>
      <h3>Calificación de manejo</h3><div id="scoreBox"></div>
      <h3>Inclinómetro</h3><p class="note">Con el auto en piso plano y el teléfono en su soporte, toca Nivelar.</p>${btn('nivel', 'Nivelar')}
      ${btn('resetPerf', 'Borrar tiempos')}`;
    let gmax = 0;
    const c = $('gcv').getContext('2d');
    const loop = () => {
      const V = F.V, R = F.perfRun || {};
      $('perfSt').textContent = F.S.speed < 1 ? 'Listo: arranca y el cronómetro empieza solo.' : R.armado ? 'Midiendo…' : 'Detén el auto por completo para medir una arrancada.';
      gmax = Math.max(gmax, Math.hypot(V.gLong, V.gLat));
      c.clearRect(0, 0, 300, 300); K.gmeter(c, 150, 150, 130, V.gLat, V.gLong, '#5aa9ff', 'rgba(150,180,230,.3)', '#ff5b3a');
      $('gVals').textContent = `Frenado/aceleración ${n(V.gLong, 2)} G · Curva ${n(V.gLat, 2)} G · Máxima ${n(gmax, 2)} G`;
      const ev = F.score.eventos.slice(-4).reverse();
      $('scoreBox').innerHTML = kv('Puntos', `${F.scoreVal()} / 100`) + (ev.length ? '<ul class="list">' + ev.map(e => `<li>${new Date(e.t).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })} · ${esc(e.txt)}</li>`).join('') + '</ul>' : '<p class="note">Sin descuentos. Así se hace.</p>');
      live = requestAnimationFrame(loop);
    };
    loop();
    $('nivel').onclick = () => toast(F.nivelar() ? 'Inclinómetro nivelado' : 'Este teléfono no reporta inclinación');
    $('resetPerf').onclick = () => { Object.assign(F.perf, { c100: null, b100: null, qm: null, bqm: null, trap: null }); F.store('forte-tiempos', F.perf); render(); };
  },

  fallas() {
    const list = F.codes;
    const items = list == null ? '<p class="note">Toca "Leer fallas" para revisar la computadora del motor.</p>'
      : !list.length ? '<p class="okmsg">Sin códigos de falla.</p>'
      : '<ul class="codes2">' + list.map(cd => `<li><b>${cd}</b><span>${esc(F.dtcText(cd))}</span></li>`).join('') + '</ul>';
    body.innerHTML = items + btn('leer', 'Leer fallas', 'pri') + (list && list.length ? btn('borrar', 'Borrar códigos y apagar el check engine') : '') +
      '<div id="confirm"></div>';
    $('leer').onclick = () => { body.querySelector('p, ul').outerHTML = '<p class="note">Leyendo…</p>'; F.readCodes(); };
    if ($('borrar')) $('borrar').onclick = () => {
      $('confirm').innerHTML = '<p class="note warnbox">Borrar los códigos apaga el testigo, pero no arregla la falla: si sigue, vuelve a aparecer. También reinicia los monitores de emisiones, así que no lo hagas justo antes de una verificación. Hazlo con el motor apagado y la llave en ON.</p>' +
        btn('borrarSi', 'Sí, borrar códigos', 'danger');
      $('borrarSi').onclick = () => { $('confirm').innerHTML = '<p class="note">Borrando…</p>'; F.clearCodes(); };
    };
  },

  aceite() {
    const pct = F.V.oilPct;
    body.innerHTML = kv('Vida restante', `${n(pct)} %`) + kv('Recorrido desde el cambio', `${n(F.oil.km)} km`) + kv('Próximo cambio en', `${n(Math.max(0, F.oil.intervalo - F.oil.km))} km`) +
      '<p class="note">La app suma los kilómetros que manejas con el OBD conectado.</p>' +
      `<label>Km desde el último cambio<input id="oKm" type="number" min="0" inputmode="numeric" value="${Math.round(F.oil.km)}"></label>
       <label>Cambiar cada (km)<input id="oInt" type="number" min="500" step="500" inputmode="numeric" value="${F.oil.intervalo}"></label>` +
      btn('oSave', 'Guardar', 'pri') + btn('oNow', 'Ya cambié el aceite hoy');
    $('oSave').onclick = () => { const k = parseFloat($('oKm').value), i = parseFloat($('oInt').value);
      if (isFinite(k) && k >= 0) F.oil.km = k; if (isFinite(i) && i >= 500) F.oil.intervalo = i; F.oilSave(); toast('Aceite guardado'); render(); };
    $('oNow').onclick = () => { F.oil.km = 0; F.oilSave(); toast('Listo, contador en cero'); render(); };
  },

  gasolina() {
    const log = F.store('forte-gasolina') || [];
    const hoy = new Date().toISOString().slice(0, 10);
    // rendimiento real: entre cargas de tanque lleno
    const ord = log.slice().sort((a, b) => a.odo - b.odo), rend = {};
    let prevFull = null, litrosAcum = 0;
    for (const e of ord) {
      litrosAcum += e.litros;
      if (e.lleno) { if (prevFull) rend[e.id] = (e.odo - prevFull.odo) / litrosAcum; prevFull = e; litrosAcum = 0; }
    }
    const mes = hoy.slice(0, 7), delMes = log.filter(e => e.fecha.slice(0, 7) === mes);
    const rs = delMes.map(e => rend[e.id]).filter(Boolean);
    body.innerHTML = '<h3>Este mes</h3>' + kv('Gastado', `$${n(delMes.reduce((s, e) => s + e.total, 0), 2)}`) + kv('Litros', n(delMes.reduce((s, e) => s + e.litros, 0), 1)) +
      kv('Rendimiento real', rs.length ? `${n(rs.reduce((a, b) => a + b, 0) / rs.length, 1)} km/L` : 'Faltan 2 cargas de tanque lleno') +
      `<h3>Nueva carga</h3>
       <label>Fecha<input id="gFecha" type="date" value="${hoy}"></label>
       <label>Kilometraje del tablero (odómetro)<input id="gOdo" type="number" inputmode="numeric" min="0"></label>
       <div class="row2"><label>Litros<input id="gLit" type="number" inputmode="decimal" step="0.01" min="0"></label>
       <label>Total $<input id="gTot" type="number" inputmode="decimal" step="0.01" min="0"></label></div>
       <label class="chk"><input id="gLleno" type="checkbox" checked> Llené el tanque</label>` +
      btn('gAdd', 'Agregar carga', 'pri') + '<p class="note" id="gErr"></p>' +
      (log.length ? '<h3>Historial</h3><ul class="list">' + log.slice().reverse().map(e =>
        `<li><span>${e.fecha} · ${n(e.litros, 1)} L · $${n(e.total, 2)} · ${n(e.odo)} km${rend[e.id] ? ` · <b>${n(rend[e.id], 1)} km/L</b>` : ''}</span><button type="button" class="mini" data-del="${e.id}">Quitar</button></li>`).join('') + '</ul>' : '');
    $('gAdd').onclick = () => {
      const e = { id: Date.now(), fecha: $('gFecha').value || hoy, odo: parseFloat($('gOdo').value), litros: parseFloat($('gLit').value), total: parseFloat($('gTot').value), lleno: $('gLleno').checked };
      if (!(e.odo > 0) || !(e.litros > 0) || !(e.total >= 0)) { $('gErr').textContent = 'Escribe el kilometraje, los litros y el total.'; return; }
      log.push(e); F.store('forte-gasolina', log);
      if (e.litros > 0 && e.total > 0) { F.cfg.precio = +(e.total / e.litros).toFixed(2); F.save(); }
      toast('Carga guardada'); render();
    };
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (b.dataset.ok) { F.store('forte-gasolina', log.filter(x => x.id !== +b.dataset.del)); render(); }
      else { b.dataset.ok = 1; b.textContent = '¿Seguro?'; }
    });
  },

  camara() {
    const on = !!cam.stream;
    body.innerHTML = '<p class="note">Graba con la cámara trasera mientras ves el tablero. Los videos se guardan en partes de 1 minuto y se borran los más viejos para no llenar el teléfono.</p>' +
      (on ? btn('cOff', 'Apagar cámara') + btn('cFoto', 'Tomar foto', 'pri') + btn('cRec', cam.rec ? 'Detener grabación' : 'Grabar video', cam.rec ? 'danger' : 'pri')
          : btn('cOn', 'Encender cámara', 'pri')) +
      `<label>Guardar los últimos<select id="cKeep">${[5, 10, 20, 30, 60].map(m => `<option value="${m}"${m === cam.keep ? ' selected' : ''}>${m} minutos</option>`).join('')}</select></label>` +
      `<p class="note" id="cMsg">${F.app ? 'Las fotos van a Imágenes › TableroForte y los videos a Películas › TableroForte.' : 'En el navegador puedes probar la cámara, pero los archivos se guardan solo en la app.'}</p>`;
    if ($('cOn')) $('cOn').onclick = () => camStart().then(render);
    if ($('cOff')) $('cOff').onclick = () => { camStop(); render(); };
    if ($('cFoto')) $('cFoto').onclick = camFoto;
    if ($('cRec')) $('cRec').onclick = () => { cam.rec ? recStop() : recStart(); render(); };
    $('cKeep').onchange = e => { cam.keep = +e.target.value; F.store('forte-cam-keep', cam.keep); };
  },

  musica() {
    body.innerHTML = F.app ? '<p class="note">Controla la música que suena en el teléfono (Spotify, YouTube Music, etc.). También tienes estos botones arriba a la derecha.</p><div class="mbig">' +
      `<button type="button" id="b1">${ICON.prev}</button><button type="button" id="b2">${ICON.play}</button><button type="button" id="b3">${ICON.next}</button></div>`
      : '<p class="note">Los controles de música funcionan dentro de la app Android.</p>';
    if (F.app) { $('b1').onclick = () => media('prev'); $('b2').onclick = () => media('play'); $('b3').onclick = () => media('next'); }
  },

  alertas() {
    const c = F.cfg, va = c.valet;
    body.innerHTML = `<label>Alerta de velocidad (km/h, 0 = apagada)<input id="aLim" type="number" min="0" step="5" inputmode="numeric" value="${c.limite}"></label>
      <label>Avisar cuando la gasolina baje de (%)<input id="aGas" type="number" min="5" max="50" step="1" inputmode="numeric" value="${c.gasAviso}"></label>
      <label>Avisar si el auto está encendido sin moverse por (min)<input id="aIdle" type="number" min="1" max="60" inputmode="numeric" value="${c.estacionadoMin}"></label>
      <label class="chk"><input id="aVoz" type="checkbox"${c.voz ? ' checked' : ''}> Avisos con voz</label>` + btn('aSave', 'Guardar', 'pri') +
      `<p class="note">${F.app ? 'Las alertas de voz siguen funcionando con la pantalla del teléfono apagada y en Android Auto. Al conectar, también te avisa si ya toca cambio de aceite.' : 'En la app, las alertas de voz siguen funcionando con la pantalla apagada y en Android Auto.'}</p>` +
      `<h3>Modo valet</h3><p class="note">Para cuando alguien más maneja tu auto: avisa si pasa el límite y guarda cada vez que lo hizo. Se quita solo con tu PIN.</p>` +
      (va.on ? `<p class="warnbox note">Modo valet activo · límite ${va.limite} km/h</p><label>PIN para desactivar<input id="vPin" type="password" inputmode="numeric" maxlength="6"></label>${btn('vOff', 'Desactivar y ver registro', 'pri')}`
             : `<label>Límite para el valet (km/h)<input id="vLim" type="number" min="20" step="5" inputmode="numeric" value="${va.limite}"></label>
                <label>${va.pin ? 'Tu PIN' : 'Crea un PIN (4 a 6 números)'}<input id="vPin" type="password" inputmode="numeric" maxlength="6"></label>${btn('vOn', 'Activar modo valet', 'pri')}`) +
      '<p class="note" id="vMsg"></p><div id="vLog"></div>';
    $('aSave').onclick = () => {
      c.limite = Math.max(0, parseInt($('aLim').value) || 0); c.gasAviso = F.clamp(parseInt($('aGas').value) || 15, 5, 50);
      c.estacionadoMin = F.clamp(parseInt($('aIdle').value) || 5, 1, 60); c.voz = $('aVoz').checked; F.save(); toast('Alertas guardadas');
    };
    const pinOk = p => /^\d{4,6}$/.test(p);
    if ($('vOn')) $('vOn').onclick = () => {
      const p = $('vPin').value;
      if (va.pin ? p !== va.pin : !pinOk(p)) { $('vMsg').textContent = va.pin ? 'PIN incorrecto.' : 'El PIN debe tener de 4 a 6 números.'; return; }
      if (!va.pin) va.pin = p;
      va.limite = Math.max(20, parseInt($('vLim').value) || 80); va.on = true; F.save();
      F.valetLog.length = 0; F.store('forte-valet', F.valetLog); updValet(); render();
    };
    if ($('vOff')) $('vOff').onclick = () => {
      if ($('vPin').value !== va.pin) { $('vMsg').textContent = 'PIN incorrecto.'; return; }
      va.on = false; F.save(); updValet();
      const L = F.valetLog;
      render();
      $('vLog').innerHTML = '<h3>Registro del valet</h3>' + (L.length ? '<ul class="list">' + L.map(e => `<li>${new Date(e.t).toLocaleString('es-MX', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })} · ${e.v} km/h</li>`).join('') + '</ul>' : '<p class="okmsg">No pasó el límite ni una vez.</p>');
    };
  },

  clima() {
    const w = F.weather;
    body.innerHTML = w ? kv('Temperatura', `${n(w.temp, 1)} °C`) + kv('Cielo', esc(w.text)) + kv('Amanecer', w.sunrise) + kv('Atardecer', w.sunset) +
      `<p class="note">Actualizado ${new Date(w.t).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}. Se muestra también en los diseños que llevan temperatura.</p>`
      : `<p class="note">${F.app ? 'El clima aparece cuando el GPS ubica al teléfono (necesita datos móviles).' : 'El clima se obtiene con el GPS dentro de la app.'}</p>` + (F.app ? btn('gpsPerm', 'Activar ubicación', 'pri') : '');
    if ($('gpsPerm')) $('gpsPerm').onclick = () => OBD.startGps();
  },

  ajustes() {
    const c = F.cfg;
    body.innerHTML = `<label>Precio de la gasolina ($/L)<input id="sPre" type="number" step="0.01" min="0" inputmode="decimal" value="${c.precio}"></label>` + btn('sSave', 'Guardar precio', 'pri') +
      `<h3>Pantalla</h3><label class="chk"><input id="sHud" type="checkbox"${c.hud ? ' checked' : ''}> Modo HUD (para reflejar en el parabrisas)</label>
       <p class="note">Pon el teléfono acostado en el tablero, con la parte de arriba hacia el parabrisas, y baja el brillo de la cabina. Úsalo de noche.</p>
       <label class="chk"><input id="sBien" type="checkbox"${c.bienvenida ? ' checked' : ''}> Animación de bienvenida al abrir</label>` +
      (F.app ? '' : btn('sFs', 'Pantalla completa')) + btn('sWel', 'Ver bienvenida') +
      '<p class="note">Tablero Forte 2.0 · datos por OBD-II con ELM327.</p>';
    $('sSave').onclick = () => { const v = parseFloat($('sPre').value); if (isFinite(v) && v >= 0) { c.precio = v; F.save(); toast('Precio guardado'); } };
    $('sHud').onchange = e => { c.hud = e.target.checked; F.save(); aplicarHud(); };
    $('sBien').onchange = e => { c.bienvenida = e.target.checked; F.save(); };
    if ($('sFs')) $('sFs').onclick = () => { document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : document.documentElement.requestFullscreen?.().catch(() => {}); };
    $('sWel').onclick = () => { ui.close(); bienvenida(true); };
  }
};

F.on('codes', list => { if (seccion === 'fallas') render(); if (list && list.length) F.alert('dtc', `Check engine: ${list.join(', ')}`, 'warn'); });
F.on('cleared', ok => { toast(ok ? 'Códigos borrados' : 'El auto no aceptó el borrado'); if (ok) F.readCodes(); });
F.on('weather', () => { if (seccion === 'clima') render(); });

/* ---------- compartir ---------- */
function compartir() {
  const t = F.tripText();
  if (window.OBD && OBD.share) { OBD.share(t); return; }
  const a = document.createElement('a'); a.href = 'https://wa.me/?text=' + encodeURIComponent(t); a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- mapa con mosaicos de OpenStreetMap ---------- */
function mapa(box, zoomIn, setZoom) {
  const ruta = F.trip.ruta.length ? F.trip.ruta : (F.gps && !F.gps.sim ? [[F.gps.lat, F.gps.lon]] : []);
  const note = $('mapNote'), W = box.clientWidth, H = box.clientHeight;
  const cvR = $('route'); cvR.width = W; cvR.height = H;
  const c = cvR.getContext('2d'); c.clearRect(0, 0, W, H);
  if (!ruta.length) { note.textContent = F.app ? 'Todavía no hay ruta. Se dibuja cuando el GPS empieza a registrar el viaje.' : 'El mapa del viaje usa el GPS del teléfono dentro de la app.'; $('tiles').innerHTML = ''; return; }
  const lx = lon => (lon + 180) / 360, ly = lat => { const s = Math.sin(lat * Math.PI / 180); return .5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const [la, lo] of ruta) { const x = lx(lo), y = ly(la); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let z = zoomIn;
  if (!z) { z = 17; while (z > 3 && ((x1 - x0) * 256 * 2 ** z > W * .8 || (y1 - y0) * 256 * 2 ** z > H * .8)) z--; setZoom(z); }
  const S = 256 * 2 ** z, cxw = (x0 + x1) / 2 * S, cyw = (y0 + y1) / 2 * S, ox = cxw - W / 2, oy = cyw - H / 2;
  let tiles = '';
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++)
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
      const m = 2 ** z; if (ty < 0 || ty >= m) continue;
      tiles += `<img alt="" src="https://tile.openstreetmap.org/${z}/${((tx % m) + m) % m}/${ty}.png" style="left:${tx * 256 - ox}px;top:${ty * 256 - oy}px">`;
    }
  $('tiles').innerHTML = tiles;
  c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = '#2f7bff'; c.beginPath();
  ruta.forEach(([la, lo], i) => { const px = lx(lo) * S - ox, py = ly(la) * S - oy; i ? c.lineTo(px, py) : c.moveTo(px, py); });
  c.stroke();
  const [la, lo] = ruta[ruta.length - 1], px = lx(lo) * S - ox, py = ly(la) * S - oy;
  c.beginPath(); c.arc(px, py, 8, 0, Math.PI * 2); c.fillStyle = '#ff5b3a'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
  note.textContent = `${ruta.length} puntos · ${n(F.trip.km, 1)} km`;
}

/* ---------- cámara ---------- */
const cam = { stream: null, rec: null, keep: F.store('forte-cam-keep') || 10, seg: null, mime: '' };
async function camStart() {
  try {
    if (window.OBD && OBD.askCamera && !OBD.hasCamera()) { OBD.askCamera(); toast('Acepta el permiso de cámara y vuelve a intentar'); return; }
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    $('camVid').srcObject = cam.stream; $('camBox').hidden = false; $('btnShot').hidden = false;
  } catch (e) { toast('No se pudo abrir la cámara: ' + (e.message || e.name)); }
}
function camStop() {
  recStop();
  if (cam.stream) cam.stream.getTracks().forEach(t => t.stop());
  cam.stream = null; $('camBox').hidden = true; $('btnShot').hidden = true;
}
function stamp() { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
function camFoto() {
  const v = $('camVid'); if (!cam.stream || !v.videoWidth) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d'); g.drawImage(v, 0, 0);
  g.font = `600 ${Math.round(c.height / 28)}px Saira, sans-serif`; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, c.height - c.height / 14, c.width, c.height / 14);
  g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.fillText(`${new Date().toLocaleString('es-MX')} · ${Math.round(F.S.speed)} km/h`, c.height / 40, c.height - c.height / 28);
  c.toBlob(b => guardar(b, 'foto', `Forte_${stamp()}.jpg`, 'image/jpeg'), 'image/jpeg', .9);
  const fl = $('flash'); fl.hidden = false; setTimeout(() => { fl.hidden = true; }, 150);
}
$('btnShot').onclick = camFoto;
function recStart() {
  if (!cam.stream || cam.rec) return;
  cam.mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  const seg = () => {
    if (!cam.stream) return;
    const chunks = [], r = new MediaRecorder(cam.stream, cam.mime ? { mimeType: cam.mime, videoBitsPerSecond: 2_000_000 } : { videoBitsPerSecond: 2_000_000 });
    r.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const type = r.mimeType || 'video/webm', ext = type.includes('mp4') ? 'mp4' : 'webm';
      guardar(new Blob(chunks, { type }), 'video', `Forte_${stamp()}.${ext}`, type.split(';')[0]);
      if (cam.rec === r) seg();
    };
    cam.rec = r; r.start(1000);
    cam.seg = setTimeout(() => { if (r.state === 'recording') r.stop(); }, 60000);
  };
  seg(); $('recDot').hidden = false;
}
function recStop() {
  const r = cam.rec; cam.rec = null; clearTimeout(cam.seg);
  if (r && r.state === 'recording') r.stop();
  $('recDot').hidden = true;
}
async function guardar(blob, kind, name, mime) {
  if (!(window.OBD && OBD.fileBegin)) { toast(kind === 'foto' ? 'Foto tomada (se guarda en la app)' : 'Parte de video lista (se guarda en la app)'); return; }
  const id = OBD.fileBegin(kind, name, mime);
  if (id < 0) { toast('No se pudo guardar el archivo'); return; }
  const CH = 393216;
  for (let i = 0; i < blob.size; i += CH) {
    const buf = new Uint8Array(await blob.slice(i, i + CH).arrayBuffer());
    let s = ''; for (let k = 0; k < buf.length; k += 8192) s += String.fromCharCode.apply(null, buf.subarray(k, k + 8192));
    OBD.fileAppend(id, btoa(s));
  }
  OBD.fileEnd(id, kind === 'video' ? cam.keep : 0);
  if (kind === 'foto') toast('Foto guardada en la galería');
}

/* ---------- HUD ---------- */
function aplicarHud() { document.documentElement.classList.toggle('hud', !!F.cfg.hud); }

/* ---------- bienvenida ---------- */
function bienvenida(forzar) {
  if (!forzar && !F.cfg.bienvenida) return;
  const ov = $('welcome'), c = $('wcv').getContext('2d'); ov.hidden = false;
  const W = $('wcv').width = ov.clientWidth * Math.min(2, devicePixelRatio || 1), H = $('wcv').height = ov.clientHeight * Math.min(2, devicePixelRatio || 1);
  const t0 = performance.now(), dur = 2900;
  let stop = false; ov.onclick = () => { stop = true; };
  const step = now => {
    const t = (now - t0) / dur;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const u = Math.min(W / 1600, H / 620); c.setTransform(u, 0, 0, u, (W - 1600 * u) / 2, (H - 620 * u) / 2);
    const sweep = t < .45 ? t / .45 : t < .75 ? 1 - (t - .45) / .3 : 0;
    const ease = x => 1 - (1 - x) ** 3;
    for (const [x, dir] of [[400, 1], [1200, -1]]) {
      K.arc(c, x, 330, 210, dir > 0 ? 120 : -150, dir > 0 ? 330 : 60, 'rgba(80,140,255,.15)', 14);
      const a0 = dir > 0 ? 120 : 60, a1 = a0 + dir * 210 * ease(F.clamp(sweep, 0, 1));
      K.glow(c, '#4a86ff', 20, () => K.arc(c, x, 330, 210, Math.min(a0, a1), Math.max(a0, a1), '#6aa8ff', 14));
    }
    const L = 'FORTE';
    for (let i = 0; i < L.length; i++) {
      const k = F.clamp((t - .1 - i * .07) / .25, 0, 1);
      c.globalAlpha = k;
      K.glow(c, '#4a86ff', 24 * k, () => K.txt(c, L[i], 800 + (i - 2) * 110, 310 + (1 - k) * 30, 130, '#fff', 'center', 700, 'Saira', 'middle', 'expanded'));
    }
    c.globalAlpha = F.clamp((t - .55) / .2, 0, 1);
    K.txt(c, '2020', 800, 420, 30, '#8fb0e6', 'center', 600);
    c.globalAlpha = 1;
    if (t > .85) { ov.style.opacity = String(F.clamp(1 - (t - .85) / .15, 0, 1)); }
    if (t < 1 && !stop) requestAnimationFrame(step); else { ov.hidden = true; ov.style.opacity = '1'; }
  };
  requestAnimationFrame(step);
}

/* ---------- valet: aviso permanente ---------- */
function updValet() { $('valetTag').hidden = !F.cfg.valet.on; $('valetTag').textContent = `VALET · ${F.cfg.valet.limite} km/h`; }

/* ---------- arranque ---------- */
ui.setSkin(F.cfg.skin);
aplicarHud(); updValet();
F.start();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (seccion === 'disenos') render(); });
bienvenida(false);
if (window.OBD) {
  const a = F.store('forte-obd');
  if (a && OBD.state() === 'ok') OBD.connect(a);
  if (OBD.startGps) OBD.startGps();
}
})();
