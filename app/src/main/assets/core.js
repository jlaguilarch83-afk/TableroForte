/* Tablero Forte · núcleo
   Datos del auto (OBD o simulación), GPS, sensores, viaje, alertas y el ciclo de dibujo.
   Los diseños leen F.V (vista lista para dibujar) en cada cuadro. */
(function () {
'use strict';
const F = window.F = {};
F.$ = id => document.getElementById(id);
F.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
F.store = function (k, v) {
  try {
    if (v === undefined) { const s = localStorage.getItem(k); return s == null ? null : JSON.parse(s); }
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) { return null; }
};
F.app = !!window.OBD;
const TANQUE_L = 53;           // Kia Forte 2020: 14 galones
F.REDLINE = 6500; F.RPM_MAX = 8000;

/* ---------- eventos simples ---------- */
const handlers = {};
F.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
F.emit = (ev, a) => { (handlers[ev] || []).forEach(fn => { try { fn(a); } catch (e) { console.error(e); } }); };

/* ---------- ajustes ---------- */
const DEF = {
  skin: 'pano', precio: 24.5, voz: true, hud: false, bienvenida: true,
  limite: 0, gasAviso: 15, estacionadoMin: 5,
  valet: { on: false, pin: '', limite: 80 },
  nivel: { pitch: 0, roll: 0 }
};
F.cfg = Object.assign({}, DEF, F.store('forte-ajustes') || {});
F.cfg.valet = Object.assign({}, DEF.valet, F.cfg.valet || {});
F.cfg.nivel = Object.assign({}, DEF.nivel, F.cfg.nivel || {});
F.save = () => F.store('forte-ajustes', F.cfg);

/* ---------- estado del auto ---------- */
F.S = { rpm: 720, speed: 0, coolant: 52, volt: 14.1, throttle: 0, load: 18, intake: 31, maf: 3.5, fuel: 62, ambient: 24.5 };
F.D = Object.assign({}, F.S);
F.sim = true;
F.conn = { text: F.app ? 'Toca para conectar' : 'Simulación', kind: F.app ? 'off' : 'sim' };
F.codes = null;

F.oil = F.store('forte-aceite') || { km: 1850, intervalo: 5000 };
F.newTrip = () => ({ km: 0, litros: 0, seg: 0, mov: 0, inicio: Date.now(), vmax: 0, ruta: [] });
F.trip = F.newTrip();
F.perf = Object.assign({ c100: null, b100: null, qm: null, bqm: null, trap: null }, F.store('forte-tiempos') || {});
F.score = { pen: 0, eventos: [] };
F.valetLog = F.store('forte-valet') || [];

F.gps = null;          // {lat, lon, speed (km/h), bearing, alt, acc, t}
F.motion = { gLong: 0, gLat: 0, pitch: 0, roll: 0, sensor: false };
F.weather = null;      // {temp, code, text, sunrise, sunset}

const HN = 600;        // historial de 60 s a 10 Hz
F.hist = { speed: new Float32Array(HN), rpm: new Float32Array(HN), thr: new Float32Array(HN), i: 0 };

/* ---------- puente con la app Android ---------- */
window.forteDash = {
  setData(obj) {
    if (F.sim) {
      F.sim = false;
      Object.assign(F.S, { coolant: null, volt: null, intake: null, maf: null, fuel: null, ambient: null });
      Object.assign(F.D, F.S);
      F.trip = F.newTrip(); F.score = { pen: 0, eventos: [] };
    }
    for (const k in obj) if (typeof obj[k] === 'number' && isFinite(obj[k])) F.S[k] = obj[k];
  },
  status(text, kind) { F.conn = { text, kind: kind || 'busy' }; F.emit('conn', F.conn); },
  codes(list) { F.codes = list; F.emit('codes', list); },
  cleared(ok) { F.emit('cleared', ok); },
  gps(g) {
    const prev = F.gps;
    F.gps = { lat: g.lat, lon: g.lon, speed: g.speed != null ? g.speed * 3.6 : null, bearing: g.bearing, alt: g.alt, acc: g.acc, t: performance.now() };
    if (prev && F.gps.bearing != null && prev.bearing != null && F.gps.speed > 8) {
      let db = F.gps.bearing - prev.bearing; if (db > 180) db -= 360; if (db < -180) db += 360;
      const dt = (F.gps.t - prev.t) / 1000;
      if (dt > 0 && dt < 5) gLatRaw = (F.gps.speed / 3.6) * (db * Math.PI / 180 / dt) / 9.81;
    }
    agregarRuta();
    if (!F.weather || Date.now() - (F.weather.t || 0) > 30 * 60e3) pedirClima();
    F.emit('gps', F.gps);
  },
  saved(kind, name) { F.emit('saved', { kind, name }); },
  camError(msg) { F.emit('camerror', msg); }
};

/* ---------- voz y avisos ---------- */
F.speak = function (t) {
  if (!F.cfg.voz) return;
  if (window.OBD && OBD.speak) { try { OBD.speak(t); } catch (e) {} return; }
  try { const u = new SpeechSynthesisUtterance(t); u.lang = 'es-MX'; speechSynthesis.speak(u); } catch (e) {}
};
F.alert = function (id, text, kind, voz) {
  F.emit('alert', { id, text, kind: kind || 'warn' });
  if (voz) F.speak(voz === true ? text : voz);
};

/* ---------- simulación ---------- */
const ruta = [
  { t: 'hold', v: 0, d: 3 }, { t: 'go', v: 55, thr: 42 }, { t: 'hold', v: 55, d: 6 }, { t: 'go', v: 98, thr: 60 },
  { t: 'hold', v: 98, d: 9 }, { t: 'go', v: 45, thr: 0 }, { t: 'hold', v: 45, d: 5 }, { t: 'go', v: 72, thr: 55 },
  { t: 'hold', v: 72, d: 6 }, { t: 'go', v: 0, thr: 0 }
];
let paso = 0, reloj = 0, simT = 0;
const ruido = a => (Math.random() - .5) * a;
function simular(dt) {
  const S = F.S, p = ruta[paso];
  simT += dt;
  if (p.t === 'hold') {
    S.throttle = S.speed > 1 ? F.clamp(10 + S.speed * .12 + ruido(3), 0, 100) : 0;
    reloj += dt; if (reloj >= p.d) { reloj = 0; paso = (paso + 1) % ruta.length; }
  } else if (p.v > S.speed) {
    S.throttle = F.clamp(p.thr + ruido(4), 0, 100);
    S.speed += (1.2 + S.throttle * .085) * dt;
    if (S.speed >= p.v) { S.speed = p.v; paso = (paso + 1) % ruta.length; }
  } else {
    S.throttle = 0; S.speed -= 10 * dt;
    if (S.speed <= p.v) { S.speed = Math.max(0, p.v); paso = (paso + 1) % ruta.length; }
  }
  const frio = F.clamp((80 - S.coolant) / 40, 0, 1);
  S.rpm = S.speed < 1 ? 720 + frio * 280 + ruido(30) : F.clamp(1050 + S.speed * 12 + S.throttle * 32 + ruido(40), 900, 7200);
  S.load = F.clamp(16 + S.throttle * .8 + S.speed * .05 + ruido(2), 0, 100);
  S.maf = 1.2 + (S.rpm / 1000) * (S.load / 100) * 20;
  S.coolant += (91 - S.coolant) * .025 * dt + ruido(.05);
  S.volt = 14.15 + ruido(.12);
  S.intake = 30 + (S.speed < 5 ? 5 : 0) + ruido(.6);
  S.fuel = Math.max(5, S.fuel - S.maf * dt * 0.00004);
  S.ambient = 24.5;
  if (!F.gps || F.gps.sim) {
    const b = (simT * 6) % 360;
    F.gps = { sim: true, lat: 28.6353 + Math.sin(simT / 60) * .01, lon: -106.0889 + Math.cos(simT / 60) * .01, speed: S.speed, bearing: b, alt: 1440 + Math.sin(simT / 20) * 8, acc: 5, t: performance.now() };
    gLatRaw = S.speed > 10 ? Math.sin(simT / 3) * .25 * (S.speed / 100) : 0;
  }
  if (!F.motion.sensor) { F.motion.pitch = Math.sin(simT / 7) * 6; F.motion.roll = Math.sin(simT / 5) * 4; }
}

/* ---------- sensores del teléfono (inclinación) ---------- */
let grav = null;
window.addEventListener('devicemotion', e => {
  const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
  const a = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const sx = g.x * c + g.y * s, sy = -g.x * s + g.y * c, sz = g.z;
  grav = grav ? { x: grav.x * .9 + sx * .1, y: grav.y * .9 + sy * .1, z: grav.z * .9 + sz * .1 } : { x: sx, y: sy, z: sz };
  F.motion.sensor = true;
  const roll = Math.atan2(grav.x, grav.y) * 180 / Math.PI;
  const pitch = Math.atan2(grav.z, Math.hypot(grav.x, grav.y)) * 180 / Math.PI;
  F.motion.rawRoll = roll; F.motion.rawPitch = pitch;
  F.motion.roll = roll - F.cfg.nivel.roll;
  F.motion.pitch = pitch - F.cfg.nivel.pitch;
});
F.nivelar = () => {
  if (F.motion.rawRoll == null) return false;
  F.cfg.nivel = { roll: F.motion.rawRoll, pitch: F.motion.rawPitch }; F.save(); return true;
};

/* ---------- ruta y clima ---------- */
let ultRuta = 0;
function agregarRuta() {
  const g = F.gps; if (!g || g.sim) return;
  const r = F.trip.ruta, now = Date.now();
  if (now - ultRuta < 5000) return;
  const last = r[r.length - 1];
  if (last && Math.abs(last[0] - g.lat) < 0.0002 && Math.abs(last[1] - g.lon) < 0.0002) return;
  ultRuta = now; r.push([+g.lat.toFixed(5), +g.lon.toFixed(5)]);
  if (r.length > 4000) r.splice(0, r.length - 4000);
}
const WCODE = c => c === 0 ? 'Despejado' : c <= 3 ? 'Parcialmente nublado' : c <= 48 ? 'Niebla' : c <= 57 ? 'Llovizna' :
  c <= 67 ? 'Lluvia' : c <= 77 ? 'Nieve' : c <= 82 ? 'Chubascos' : c <= 86 ? 'Nieve' : 'Tormenta';
let pidiendo = false;
function pedirClima() {
  if (pidiendo || !F.gps || F.gps.sim) return;
  pidiendo = true;
  const g = F.gps;
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat.toFixed(3)}&longitude=${g.lon.toFixed(3)}&current=temperature_2m,weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=1`)
    .then(r => r.json()).then(j => {
      F.weather = { t: Date.now(), temp: j.current.temperature_2m, code: j.current.weather_code, text: WCODE(j.current.weather_code),
        sunrise: (j.daily.sunrise[0] || '').slice(11, 16), sunset: (j.daily.sunset[0] || '').slice(11, 16) };
      F.emit('weather', F.weather);
    }).catch(() => {}).finally(() => { pidiendo = false; });
}
F.pedirClima = pedirClima;

/* ---------- funciones de manejo ---------- */
let gLatRaw = 0, prevSpeed = 0, gLongS = 0;
const perfRun = { armado: false, t0: 0, dist: 0, hecho100: false, hechoQM: false };
let cool = {}, idleSeg = 0, overSeg = 0, ultimoAviso = {};
function cada(id, seg) { const n = performance.now(); if (cool[id] && n - cool[id] < seg * 1000) return false; cool[id] = n; return true; }
function penal(p, txt) { F.score.pen += p; F.score.eventos.push({ t: Date.now(), txt }); if (F.score.eventos.length > 50) F.score.eventos.shift(); }

function funciones(dt) {
  const S = F.S, v = S.speed;
  // fuerza G longitudinal con la velocidad del OBD, lateral con el GPS
  const a = ((v - prevSpeed) / 3.6) / Math.max(dt, 1e-3) / 9.81; prevSpeed = v;
  gLongS += (F.clamp(a, -1.5, 1.5) - gLongS) * Math.min(1, dt * 4);
  F.motion.gLong = gLongS;
  F.motion.gLat += (gLatRaw - F.motion.gLat) * Math.min(1, dt * 3);

  // 0-100 y cuarto de milla
  const P = perfRun;
  if (v < 1) { P.armado = true; P.t0 = 0; P.dist = 0; P.hecho100 = P.hechoQM = false; }
  else if (P.armado) {
    if (!P.t0) P.t0 = performance.now();
    P.dist += v / 3.6 * dt;
    const t = (performance.now() - P.t0) / 1000;
    if (!P.hecho100 && v >= 100) {
      P.hecho100 = true; F.perf.c100 = t; if (!F.perf.b100 || t < F.perf.b100) F.perf.b100 = t;
      F.store('forte-tiempos', F.perf); F.alert('perf', `0 a 100 km/h en ${t.toFixed(1)} s`, 'ok', true);
    }
    if (!P.hechoQM && P.dist >= 402.3) {
      P.hechoQM = true; F.perf.qm = t; F.perf.trap = v; if (!F.perf.bqm || t < F.perf.bqm) F.perf.bqm = t;
      F.store('forte-tiempos', F.perf); F.alert('perf', `Cuarto de milla: ${t.toFixed(1)} s a ${Math.round(v)} km/h`, 'ok', true);
    }
    if (t > 60) P.armado = false;
  }
  F.perfRun = P;

  // calificación de manejo
  if (gLongS > .32 && cada('acel', 4)) penal(2, 'Aceleración brusca');
  if (gLongS < -.38 && cada('freno', 4)) penal(3, 'Frenada brusca');
  if (Math.abs(F.motion.gLat) > .45 && cada('curva', 4)) penal(2, 'Curva fuerte');
  if (S.rpm > 4500 && cada('rpm', 6)) penal(1, 'Revoluciones altas');

  // límite de velocidad y modo valet
  const lim = F.cfg.valet.on ? F.cfg.valet.limite : F.cfg.limite;
  if (lim > 0 && v > lim + 1) {
    overSeg += dt;
    if (overSeg > 1 && cada('vel', 15)) {
      F.alert('vel', `Vas a ${Math.round(v)} km/h. Límite: ${lim}`, 'crit', 'Exceso de velocidad');
      penal(2, 'Exceso de velocidad');
      if (F.cfg.valet.on) { F.valetLog.push({ t: Date.now(), v: Math.round(v) }); if (F.valetLog.length > 200) F.valetLog.shift(); F.store('forte-valet', F.valetLog); }
    }
  } else overSeg = 0;

  // gasolina baja
  if (S.fuel != null) {
    if (S.fuel < F.cfg.gasAviso && !ultimoAviso.gas) { ultimoAviso.gas = true; F.alert('gas', `Gasolina baja: ${Math.round(S.fuel)} %`, 'warn', 'Queda poca gasolina'); }
    if (S.fuel > F.cfg.gasAviso + 5) ultimoAviso.gas = false;
  }
  // motor caliente
  if (S.coolant != null && S.coolant >= 108 && cada('cal', 60)) F.alert('cal', `Motor caliente: ${Math.round(S.coolant)} °C`, 'crit', 'Temperatura del motor alta');

  // modo estacionado (solo con el auto real)
  if (!F.sim) {
    if (v < 1 && S.rpm > 300) {
      idleSeg += dt;
      if (idleSeg > F.cfg.estacionadoMin * 60 && !ultimoAviso.idle) {
        ultimoAviso.idle = true;
        F.alert('idle', `El auto lleva ${F.cfg.estacionadoMin} min encendido sin moverse`, 'warn', true);
      }
    } else { idleSeg = 0; ultimoAviso.idle = false; }
    if (S.rpm < 300 && S.volt != null && S.volt < 12.0 && cada('bat', 300)) F.alert('bat', `Batería baja con el motor apagado: ${S.volt.toFixed(1)} V`, 'crit', 'Batería baja');
  }
  F.idleSeg = idleSeg;
}
F.scoreVal = () => Math.round(F.clamp(100 - F.score.pen, 0, 100));

/* ---------- vista para los diseños ---------- */
F.V = {};
let histAcc = 0, guardar = 0;
function vista(lh) {
  const D = F.D, T = F.trip, V = F.V;
  V.speed = D.speed; V.rpm = D.rpm; V.coolant = D.coolant; V.volt = D.volt; V.throttle = D.throttle;
  V.load = D.load; V.intake = D.intake; V.fuel = D.fuel; V.ambient = F.weather ? F.weather.temp : D.ambient;
  V.lh = lh;
  V.kml = (F.S.speed > 3 && lh) ? F.clamp(F.S.speed / lh, 0, 40) : null;
  V.avg = T.litros > .005 ? T.km / T.litros : null;
  V.tripKm = T.km; V.tripSeg = T.seg; V.litros = T.litros; V.gasto = T.litros * F.cfg.precio;
  V.range = D.fuel == null ? null : D.fuel / 100 * TANQUE_L * ((V.avg && T.km > 1) ? V.avg : 14);
  V.gLong = F.motion.gLong; V.gLat = F.motion.gLat; V.pitch = F.motion.pitch; V.roll = F.motion.roll;
  V.heading = F.gps ? F.gps.bearing : null; V.alt = F.gps ? F.gps.alt : null; V.gpsSpeed = F.gps ? F.gps.speed : null;
  V.score = F.scoreVal(); V.sim = F.sim;
  V.codes = F.codes ? F.codes.length : 0;
  const d = new Date();
  V.clock = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  V.weather = F.weather;
  V.oilPct = F.clamp(100 - F.oil.km / F.oil.intervalo * 100, 0, 100);
  V.hist = F.hist; V.perf = F.perf;
  V.limite = F.cfg.valet.on ? F.cfg.valet.limite : F.cfg.limite;
}

/* ---------- ciclo principal ---------- */
let ultimo = performance.now();
F.skin = null;
function frame(now) {
  const dt = Math.min(.1, (now - ultimo) / 1000); ultimo = now;
  F.t = now / 1000; F.dt = dt;
  if (F.sim) simular(dt);
  const S = F.S, D = F.D;
  for (const k in S) {
    if (S[k] == null) D[k] = null;
    else if (D[k] == null) D[k] = S[k];
    else D[k] += (S[k] - D[k]) * Math.min(1, dt * 8);
  }
  const lh = S.maf != null ? S.maf * 3600 / (14.7 * 745) : null;   // L/h desde MAF
  const T = F.trip;
  T.km += S.speed * dt / 3600; T.seg += dt; if (S.speed > 1) T.mov += dt;
  if (lh != null) T.litros += lh * dt / 3600;
  if (S.speed > T.vmax) T.vmax = S.speed;
  if (!F.sim) { F.oil.km += S.speed * dt / 3600; guardar += dt; if (guardar > 15) { guardar = 0; F.store('forte-aceite', F.oil); } }
  histAcc += dt;
  while (histAcc >= .1) {
    histAcc -= .1; const H = F.hist, i = H.i % HN;
    H.speed[i] = S.speed; H.rpm[i] = S.rpm; H.thr[i] = S.throttle; H.i++;
  }
  funciones(dt);
  vista(lh);
  if (F.skin) { try { F.skin.frame(F.V, dt); } catch (e) { console.error(e); } }
  F.emit('frame', dt);
  requestAnimationFrame(frame);
}
F.start = () => requestAnimationFrame(t => { ultimo = t; frame(t); });

/* ---------- acciones ---------- */
F.readCodes = () => {
  if (window.OBD) OBD.readCodes();
  else setTimeout(() => window.forteDash.codes(['P0420']), 600);
};
F.clearCodes = () => {
  if (window.OBD && OBD.clearCodes) OBD.clearCodes();
  else setTimeout(() => { window.forteDash.cleared(true); window.forteDash.codes([]); }, 600);
};
F.resetTrip = () => { F.trip = F.newTrip(); F.score = { pen: 0, eventos: [] }; };
F.fmtTime = s => { const m = Math.floor(s / 60), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min ${Math.floor(s % 60)} s`; };
F.tripText = () => {
  const T = F.trip, V = F.V;
  return `Viaje en mi Kia Forte\n` +
    `Distancia: ${T.km.toFixed(1)} km\nTiempo: ${F.fmtTime(T.seg)}\n` +
    (V.avg ? `Rendimiento: ${V.avg.toFixed(1)} km/L\n` : '') +
    `Gasolina: ${T.litros.toFixed(2)} L ($${(T.litros * F.cfg.precio).toFixed(2)})\n` +
    `Velocidad máxima: ${Math.round(T.vmax)} km/h\nCalificación de manejo: ${F.scoreVal()}/100`;
};
})();
