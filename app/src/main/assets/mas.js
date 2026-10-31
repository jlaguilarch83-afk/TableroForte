/* Tablero Forte · menú de tres puntitos de Forte Tesla y lo que se prende desde ahí:
   avisos de la cámara, tolerancia, ralentí raro, prueba de batería, arrancones,
   sonido de motor (10 estilos), detector de choque y clima (animación y aviso adelante). */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$, K = F.K;
const clamp = F.clamp, store = F.store;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gpsReal = () => F.gps && !F.gps.sim ? F.gps : null;
const cool = {};
const cada = (id, s) => { const t = Date.now(); if (cool[id] && t - cool[id] < s * 1000) return false; cool[id] = t; return true; };

// valores de fábrica de lo nuevo
const DEF = { carril: 'off', peatones: 'off', semaforo: false, ralenti: true, batSiempre: true, arrancones: false,
  motor: false, motorEstilo: 'mustang', motorVol: .7, choque: false, contacto: null, climaFx: true, climaAdelante: true };
for (const k in DEF) if (F.cfg[k] === undefined) F.cfg[k] = DEF[k];

/* =====================================================================
   SONIDO DE MOTOR: se genera en el momento con las revoluciones reales
   ===================================================================== */
const ESTILOS = [
  { id: 'mustang', n: 'V8 tipo Mustang', cil: 8, h: [1, .8, .55, .42, .3, .2, .12, .08], s2: .55, s4: .32, drv: 3, lp: [320, .34], ru: .05, pops: .3 },
  { id: 'lambo', n: 'V10 tipo Lamborghini', cil: 10, h: [1, .6, .72, .45, .42, .3, .26, .2, .15], s2: .16, s4: 0, drv: 4.5, lp: [650, .75], ru: .05, pops: .6 },
  { id: 'gtr', n: 'Seis turbo tipo GT-R', cil: 6, h: [1, .7, .42, .3, .16, .1], s2: .1, s4: 0, drv: 2.3, lp: [480, .45], ru: .08, turbo: 1, bov: .8 },
  { id: 'hellcat', n: 'V8 supercargado tipo Hellcat', cil: 8, h: [1, .85, .62, .45, .3, .2, .1], s2: .5, s4: .26, drv: 3.6, lp: [360, .38], ru: .05, sc: 1, pops: .2 },
  { id: 'ferrari', n: 'V12 tipo Ferrari', cil: 12, h: [1, .5, .62, .52, .46, .36, .3, .26, .2, .15], s2: 0, s4: 0, drv: 3, lp: [900, .9], ru: .04, pops: .4 },
  { id: 'supra', n: 'Seis en línea tipo Supra', cil: 6, h: [1, .66, .46, .35, .25, .15], s2: .06, s4: 0, drv: 2.1, lp: [520, .52], ru: .06, turbo: .7, bov: .5 },
  { id: 'rx7', n: 'Rotativo tipo RX-7', cil: 4, h: [1, .92, .82, .72, .62, .52, .42, .34], s2: .3, s4: .1, drv: 5.5, lp: [780, .85], ru: .1, turbo: .4, pops: .8 },
  { id: 'subaru', n: 'Bóxer tipo Subaru', cil: 4, h: [1, .62, .42, .3, .2], s2: .72, s4: .22, drv: 2.6, lp: [400, .42], ru: .07, turbo: .6, bov: .6 },
  { id: 'tuner', n: 'Cuatro turbo tipo tuner', cil: 4, h: [1, .7, .52, .42, .3, .2, .15], s2: .1, s4: 0, drv: 3.2, lp: [600, .65], ru: .08, turbo: 1, bov: 1, pops: .5 },
  { id: 'tesla', n: 'Eléctrico tipo Tesla', elec: true }
];
const estilo = () => ESTILOS.find(e => e.id === F.cfg.motorEstilo) || ESTILOS[0];
let M = null, ruidoBuf = null;
function ruido(ac) {
  if (ruidoBuf) return ruidoBuf;
  ruidoBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = ruidoBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ruidoBuf;
}
function curva(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } return c; }
function motorCrear() {
  const ac = F.audio(); if (!ac) return;
  motorParar();
  const e = estilo(), m = { e, ac, boost: 0, prevThr: 0, popT: 0 };
  m.master = ac.createGain(); m.master.gain.value = 0;
  m.comp = ac.createDynamicsCompressor(); m.comp.threshold.value = -14; m.comp.ratio.value = 4;
  m.master.connect(m.comp); m.comp.connect(ac.destination);
  m.lp = ac.createBiquadFilter(); m.lp.type = 'lowpass'; m.lp.Q.value = .9; m.lp.connect(m.master);
  m.shaper = ac.createWaveShaper(); m.shaper.curve = curva(e.drv || 1.2); m.shaper.oversample = '2x'; m.shaper.connect(m.lp);
  m.pre = ac.createGain(); m.pre.gain.value = .55; m.pre.connect(m.shaper);
  const osc = (tipo, g) => { const o = ac.createOscillator(), gg = ac.createGain(); if (tipo === 'pw') o.setPeriodicWave(onda(ac, e.h)); else o.type = tipo; gg.gain.value = g; o.connect(gg); gg.connect(m.pre); o.start(); return [o, gg]; };
  if (e.elec) {
    [m.o1, m.g1] = osc('sine', .5); [m.o2, m.g2] = osc('sine', .3); [m.o4, m.g4] = osc('triangle', .12);
  } else {
    [m.o1, m.g1] = osc('pw', .7); [m.o2, m.g2] = osc('triangle', e.s2 * .9); [m.o4, m.g4] = osc('sine', e.s4 * .9);
  }
  // aire / escape
  m.nz = ac.createBufferSource(); m.nz.buffer = ruido(ac); m.nz.loop = true;
  m.nf = ac.createBiquadFilter(); m.nf.type = 'bandpass'; m.nf.Q.value = .8;
  m.ng = ac.createGain(); m.ng.gain.value = 0; m.nz.connect(m.nf); m.nf.connect(m.ng); m.ng.connect(m.pre); m.nz.start();
  // turbo (silbido) y supercargador (chillido)
  m.tu = ac.createOscillator(); m.tu.type = 'sine'; m.tg = ac.createGain(); m.tg.gain.value = 0; m.tu.connect(m.tg); m.tg.connect(m.master); m.tu.start();
  m.sc = ac.createOscillator(); m.sc.type = 'triangle'; m.sg = ac.createGain(); m.sg.gain.value = 0; m.sc.connect(m.sg); m.sg.connect(m.master); m.sc.start();
  M = m;
}
function onda(ac, h) { const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1); h.forEach((v, i) => { im[i + 1] = v; }); return ac.createPeriodicWave(re, im); }
function motorParar() {
  if (!M) return;
  const m = M; M = null;
  try { m.master.gain.setTargetAtTime(0, m.ac.currentTime, .05); } catch (e) {}
  setTimeout(() => { [m.o1, m.o2, m.o4, m.nz, m.tu, m.sc].forEach(o => { try { o.stop(); } catch (e) {} }); try { m.comp.disconnect(); } catch (e) {} }, 300);
}
function rafaga(m, dur, f, tipo, vol) {
  // pssst de la válvula de alivio o petardeo del escape
  const ac = m.ac, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
  s.buffer = ruido(ac); fl.type = tipo; fl.frequency.value = f; fl.Q.value = tipo === 'bandpass' ? 1.2 : .7;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(m.master); s.start(t, Math.random()); s.stop(t + dur + .05);
}
F.motorAplicar = () => { if (F.cfg.motor) motorCrear(); else motorParar(); };
F.on('frame', () => {
  const m = M; if (!m) return;
  const ac = m.ac, t = ac.currentTime, e = m.e, D = F.D;
  if (ac.state === 'suspended') return;
  const rpm = D.rpm || 0, encendido = rpm > 300, thr = (D.throttle || 0) / 100, load = (D.load || 0) / 100;
  const drive = clamp(Math.max((thr - .14) / .6, (load - .25) / .6, 0), 0, 1);
  const vol = (F.cfg.motorVol ?? .7) * (encendido || e.elec && F.S.speed > 1 ? 1 : 0);
  const S = (p, v, k = .05) => p.setTargetAtTime(v, t, k);
  if (e.elec) {
    const v = F.D.speed || 0, base = 70 + v * 7;
    S(m.o1.frequency, base); S(m.o2.frequency, base * 1.5); S(m.o4.frequency, base * 3.01);
    S(m.lp.frequency, 1800 + v * 30); S(m.tu.frequency, 900 + v * 38); S(m.tg.gain, .015 + drive * .035);
    S(m.ng.gain, .02 + v / 2500); S(m.nf.frequency, 600 + v * 20);
    S(m.master.gain, vol * (.22 + .6 * drive + v / 400));
    return;
  }
  const f = Math.max(8, rpm / 60 * e.cil / 2);   // explosiones por segundo
  S(m.o1.frequency, f, .04); S(m.o2.frequency, f / 2, .04); S(m.o4.frequency, f / 4, .04);
  S(m.lp.frequency, e.lp[0] + rpm * e.lp[1] + drive * 1400, .06);
  S(m.nf.frequency, f * 3.2); S(m.ng.gain, (e.ru || .05) * (.4 + drive * 1.6));
  S(m.master.gain, vol * (.32 + .68 * drive), .08);
  // turbo: sube con revoluciones y carga
  const objetivo = clamp((rpm - 2200) / 3300, 0, 1) * clamp(drive * 1.3, 0, 1);
  m.boost += (objetivo - m.boost) * (objetivo > m.boost ? .03 : .12);
  if (e.turbo) { S(m.tu.frequency, 2600 + m.boost * 5200); S(m.tg.gain, e.turbo * m.boost * .05); }
  if (e.sc) { S(m.sc.frequency, rpm / 60 * 9.5); S(m.sg.gain, e.sc * clamp(rpm / 6500, 0, 1) * (.2 + drive) * .045); }
  // al soltar el acelerador con turbo: pssst
  if (e.bov && m.prevThr > .4 && drive < .1 && m.boost > .25) { rafaga(m, .45, 2600, 'highpass', .22 * e.bov * (F.cfg.motorVol ?? .7)); m.boost = 0; }
  // petardeo al bajar de revoluciones
  if (e.pops && drive < .03 && rpm > 2800 && performance.now() > m.popT) {
    m.popT = performance.now() + 70 + Math.random() * 260;
    if (Math.random() < e.pops) rafaga(m, .06 + Math.random() * .05, 350 + Math.random() * 400, 'bandpass', .5 * (F.cfg.motorVol ?? .7));
  }
  m.prevThr = drive;
});

/* =====================================================================
   MODO ARRANCONES: semáforo en pantalla, reacción, 0-60, 0-100 y 400 m
   ===================================================================== */
const DR = { estado: 'cerrado', t0: 0, verde: 0, salida: 0, dist: 0, vmax: 0, marcas: {}, prevV: 0, prevT: 0, timers: [] };
const mejores = () => store('forte-arrancones') || { reac: null, m60: null, m100: null, m400: null, hist: [] };
const drag = document.createElement('div'); drag.id = 'drag'; drag.hidden = true;
drag.innerHTML = `<div class="dbox"><div class="dtree"><i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="v"></i><i data-l="r"></i></div>
<div class="dinfo"><h2 id="dgTit">Arrancones</h2><p id="dgTxt"></p><div id="dgRes"></div>
<div class="dbtns"><button type="button" id="dgGo" class="pri">Listo</button><button type="button" id="dgX">Cerrar</button></div>
<p class="dnote">Solo en un lugar cerrado y seguro, nunca en la calle.</p></div></div>`;
document.body.appendChild(drag);
const fmtS = v => v == null ? '—' : v.toFixed(2) + ' s';
function dragLuces(n) { drag.querySelectorAll('.dtree i').forEach(i => { const l = i.dataset.l; i.classList.toggle('on', l === 'v' ? n === 'v' : l === 'r' ? n === 'r' : typeof n === 'number' && +l <= n); }); }
function dragPintar() {
  const B = mejores(), mk = DR.marcas;
  $('dgRes').innerHTML = `<table><tr><th></th><th>Ahora</th><th>Mejor</th></tr>` +
    [['Reacción', 'reac'], ['0 a 60', 'm60'], ['0 a 100', 'm100'], ['400 m', 'm400']].map(([l, k]) => `<tr><td>${l}</td><td>${fmtS(mk[k])}</td><td>${fmtS(B[k])}</td></tr>`).join('') + '</table>';
}
function dragAbrir() { drag.hidden = false; DR.estado = 'espera'; DR.marcas = {}; dragLuces(null); dragTexto(); dragPintar(); }
function dragCerrar() { DR.timers.forEach(clearTimeout); DR.timers = []; DR.estado = 'cerrado'; drag.hidden = true; }
function dragTexto() {
  const t = { espera: (F.S.speed || 0) > 1 ? 'Detén el carro por completo para empezar.' : 'Con el carro detenido toca Listo. Sale cuando se prenda el verde.',
    arbol: 'Prepárate…', corriendo: '¡Dale!', fin: 'Listo. ¿Otra?', falso: '¡Salida en falso! Arrancaste antes del verde.' }[DR.estado] || '';
  $('dgTxt').textContent = t; $('dgGo').textContent = DR.estado === 'fin' || DR.estado === 'falso' ? 'Otra vez' : 'Listo';
  $('dgGo').disabled = DR.estado === 'arbol' || DR.estado === 'corriendo';
}
$('dgX').onclick = dragCerrar;
$('dgGo').onclick = () => {
  if ((F.S.speed || 0) > 1) { DR.estado = 'espera'; dragTexto(); return; }
  DR.estado = 'arbol'; DR.marcas = {}; DR.salida = 0; DR.dist = 0; DR.vmax = 0; DR.verde = 0; dragTexto(); dragPintar(); dragLuces(null);
  F.audio();
  [0, 1, 2].forEach(i => DR.timers.push(setTimeout(() => { if (DR.estado !== 'arbol') return; dragLuces(i); F.beep('luz'); }, 900 + i * 500)));
  DR.timers.push(setTimeout(() => { if (DR.estado !== 'arbol') return; DR.verde = performance.now(); DR.estado = 'corriendo'; dragLuces('v'); F.beep('ok'); dragTexto(); }, 900 + 3 * 500));
};
dock();
// arranque: el acelerómetro lo nota antes que el OBD
let accLin = 0;
window.addEventListener('devicemotion', ev => {
  const a = ev.acceleration;
  if (a && a.x != null) accLin = Math.hypot(a.x, a.y, a.z || 0);
  choqueMovimiento(ev);
});
F.on('frame', () => {
  F.dragActivo = DR.estado === 'arbol' || DR.estado === 'corriendo';
  if (DR.estado === 'espera') { if (cada('dragTxt', .5)) dragTexto(); return; }
  if (DR.estado !== 'arbol' && DR.estado !== 'corriendo') return;
  const now = performance.now(), v = F.S.speed || 0;
  const salio = (accLin > 2.2) || v >= 2;
  if (DR.estado === 'arbol' && salio && v >= 1) {
    DR.estado = 'falso'; DR.timers.forEach(clearTimeout); dragLuces('r'); F.beep('alarma'); dragTexto();
    F.speak('Salida en falso'); return;
  }
  if (DR.estado !== 'corriendo') return;
  if (!DR.salida && salio) {
    // el OBD llega tarde unos 300 ms; el acelerómetro casi al instante
    DR.salida = accLin > 2.2 ? now : now - 300;
    DR.marcas.reac = Math.max(0, (DR.salida - DR.verde) / 1000); DR.prevV = 0; DR.prevT = DR.salida; dragPintar();
  }
  if (!DR.salida) { if (now - DR.verde > 8000) { DR.estado = 'fin'; dragTexto(); } return; }
  if (v !== DR.prevV) {
    // cruza 60 o 100 entre la lectura anterior y esta
    for (const [k, lim] of [['m60', 60], ['m100', 100]]) if (DR.marcas[k] == null && v >= lim && DR.prevV < lim) {
      const tt = DR.prevT + (now - DR.prevT) * (lim - DR.prevV) / Math.max(.1, v - DR.prevV);
      DR.marcas[k] = (tt - DR.salida) / 1000; dragPintar();
    }
    DR.prevV = v; DR.prevT = now;
  }
  DR.dist += v / 3.6 * (F.dt || .016); DR.vmax = Math.max(DR.vmax, v);
  if (DR.marcas.m400 == null && DR.dist >= 400) { DR.marcas.m400 = (now - DR.salida) / 1000; dragPintar(); }
  const termino = DR.marcas.m400 != null || (DR.vmax > 20 && v < DR.vmax - 15) || now - DR.salida > 45000;
  if (termino) dragFin();
});
function dragFin() {
  DR.estado = 'fin'; dragTexto();
  const B = mejores(), mk = DR.marcas;
  for (const k of ['reac', 'm60', 'm100', 'm400']) if (mk[k] != null && (B[k] == null || mk[k] < B[k])) B[k] = mk[k];
  B.hist = [{ t: Date.now(), ...mk }].concat(B.hist || []).slice(0, 20);
  store('forte-arrancones', B); dragPintar();
  const partes = [];
  if (mk.reac != null) partes.push(`reacción ${mk.reac.toFixed(2)}`);
  if (mk.m100 != null) partes.push(`cero a cien en ${mk.m100.toFixed(1)} segundos`); else if (mk.m60 != null) partes.push(`cero a sesenta en ${mk.m60.toFixed(1)}`);
  if (mk.m400 != null) partes.push(`cuarto de milla en ${mk.m400.toFixed(1)}`);
  if (partes.length) F.speak(partes.join(', '));
}

/* ---- botón en la barra de Forte Tesla ---- */
function dock() {
  const d = $('dock'); if (!d) return;
  if (!d.querySelector('[data-b="drag"]')) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.b = 'drag';
    b.innerHTML = '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/></svg><span>Arrancón</span>';
    b.onclick = dragAbrir; d.appendChild(b);
  }
  d.querySelector('[data-b="drag"]').style.display = F.cfg.arrancones ? '' : 'none';
}

/* =====================================================================
   DETECTOR DE CHOQUE
   ===================================================================== */
const velHist = [];   // [t, km/h] de los últimos segundos
setInterval(() => {
  const v = F.conn.kind === 'ok' || F.sim ? (F.S.speed || 0) : (gpsReal() && gpsReal().speed) || 0;
  velHist.push([Date.now(), v]); while (velHist.length && Date.now() - velHist[0][0] > 6000) velHist.shift();
}, 250);
let golpe = null;
function choqueMovimiento(ev) {
  if (!F.cfg.choque || CH.activo) return;
  const a = ev.acceleration, ag = ev.accelerationIncludingGravity;
  let g = 0;
  if (a && a.x != null) g = Math.hypot(a.x, a.y, a.z || 0) / 9.81;
  else if (ag && ag.x != null) g = Math.max(0, Math.hypot(ag.x, ag.y, ag.z || 0) / 9.81 - 1);
  if (g < 3.5 || golpe) return;
  const antes = Math.max(0, ...velHist.filter(x => Date.now() - x[0] < 3500).map(x => x[1]));
  if (antes < 20) return;   // estacionado o muy lento: es el teléfono que se cayó, no un choque
  golpe = { t: Date.now(), antes, g };
  // si en 6 segundos casi se detuvo, es un choque
  const iv = setInterval(() => {
    const v = velHist.length ? velHist[velHist.length - 1][1] : 0;
    if (v < Math.max(8, golpe.antes * .4)) { clearInterval(iv); const G = golpe; golpe = null; choqueAlerta(false, G); }
    else if (Date.now() - golpe.t > 6000) { clearInterval(iv); golpe = null; }
  }, 250);
}
const CH = { activo: false, n: 0, iv: null, prueba: false };
const ch = document.createElement('div'); ch.id = 'choque'; ch.hidden = true;
ch.innerHTML = `<div class="cbox"><h2>¿Estás bien?</h2><p id="chTxt"></p><div id="chNum">30</div>
<button type="button" id="chOk">Estoy bien</button><button type="button" id="chYa">Pedir ayuda ahora</button></div>`;
document.body.appendChild(ch);
function choqueAlerta(prueba) {
  if (CH.activo) return;
  CH.activo = true; CH.prueba = !!prueba; CH.n = prueba ? 10 : 30;
  const c = F.cfg.contacto;
  $('chTxt').textContent = (prueba ? 'Prueba (no se manda nada). ' : 'Detecté un golpe fuerte. ') +
    (c ? `Si no respondes, mando tu ubicación a ${c.nombre || c.tel}.` : 'No hay contacto elegido en el menú de tres puntitos.');
  $('chNum').textContent = CH.n; ch.hidden = false;
  if (!prueba && F.guardarEvento) { try { F.guardarEvento(); } catch (e) {} }
  F.speak(prueba ? 'Prueba del detector de choque' : `Detecté un golpe fuerte. Si no respondes en 30 segundos, mando tu ubicación${c ? ' a ' + (c.nombre || 'tu contacto') : ''}`);
  CH.iv = setInterval(() => {
    CH.n--; $('chNum').textContent = CH.n; F.beep('alarma');
    if (CH.n <= 0) { choqueCerrar(); choqueMandar(); }
  }, 1000);
}
function choqueCerrar() { clearInterval(CH.iv); CH.activo = false; ch.hidden = true; }
$('chOk').onclick = () => { choqueCerrar(); F.speak('Qué bueno. Cancelado.'); };
$('chYa').onclick = () => { choqueCerrar(); choqueMandar(); };
F.choqueTexto = () => {
  const g = gpsReal();
  return 'Mensaje automático de Tablero Forte: detecté un posible choque de mi Kia Forte y no respondí. ' +
    (g ? `Mi ubicación: https://maps.google.com/?q=${g.lat.toFixed(6)},${g.lon.toFixed(6)}` : 'No tengo la ubicación del GPS.');
};
function telIntl(t) {
  let d = String(t || '').replace(/[^\d]/g, '');
  if (d.length === 10) d = '52' + d;
  return d;
}
function choqueMandar() {
  const c = F.cfg.contacto, txt = F.choqueTexto();
  if (CH.prueba) { ui.toast(c ? `Prueba lista: a ${c.nombre || c.tel} le llegaría tu ubicación` : 'Prueba lista. Elige un contacto.'); return; }
  if (!c) { ui.toast('No hay contacto para avisar'); return; }
  let sms = false;
  if (window.OBD && OBD.sms) { try { sms = OBD.sms(c.tel, txt); } catch (e) {} }
  if (window.OBD && OBD.whatsapp) OBD.whatsapp(telIntl(c.tel), txt);
  else window.open(`https://wa.me/${telIntl(c.tel)}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  F.alert('choque', sms ? `Mensaje enviado a ${c.nombre || c.tel}` : `Abriendo WhatsApp para ${c.nombre || c.tel}`, 'crit', sms ? 'Mandé tu ubicación por mensaje' : true);
}
let contactoPara = 'contacto';
window.forteDash.contact = (nombre, tel) => {
  if (!tel) { ui.toast('No se eligió contacto'); return; }
  F.cfg[contactoPara] = { nombre: nombre || '', tel }; F.save(); pop.pintar(); ui.toast(`Contacto: ${nombre || tel}`);
};
window.forteDash.smsPermiso = ok => { if (!ok) ui.toast('Sin permiso de SMS solo podré abrir WhatsApp'); };

/* =====================================================================
   RALENTÍ RARO: con el motor caliente y detenido, si las revoluciones bailan
   ===================================================================== */
const RAL = { m: [], malas: 0, desde: 0 };
setInterval(() => {
  const S = F.S;
  if (!F.cfg.ralenti || F.sim && !F.cfg.demo) { RAL.m = []; return; }
  if (S.rpm > 400 && !RAL.desde) RAL.desde = Date.now();
  if (S.rpm < 300) { RAL.desde = 0; RAL.m = []; return; }
  const enRalenti = S.speed < 1 && S.rpm > 400 && (S.throttle || 0) < 22 && (S.coolant == null || S.coolant >= 70) && Date.now() - RAL.desde > 120000;
  if (!enRalenti) { RAL.m = []; return; }
  RAL.m.push(S.rpm);
  if (RAL.m.length < 120) return;   // 30 s
  const L = RAL.m.splice(0), prom = L.reduce((a, b) => a + b, 0) / L.length;
  const de = Math.sqrt(L.reduce((a, b) => a + (b - prom) ** 2, 0) / L.length), rango = Math.max(...L) - Math.min(...L);
  let msg = null;
  if (de > 70 || rango > 320) msg = `El ralentí está inestable: sube y baja unas ${Math.round(rango / 2)} rpm. Revisa bujías, bobinas o el cuerpo de aceleración.`;
  else if (prom < 560) msg = `El ralentí está bajo: ${Math.round(prom)} rpm. Puede apagarse; revisa el cuerpo de aceleración o fugas de vacío.`;
  else if (prom > 1150) msg = `El ralentí está alto con el motor caliente: ${Math.round(prom)} rpm. Puede ser una fuga de vacío o el cuerpo de aceleración.`;
  RAL.malas = msg ? RAL.malas + 1 : 0;
  if (msg && RAL.malas >= 2 && cada('ralenti', 1800)) F.alert('ralenti', msg.split('.')[0], 'warn', msg);
}, 250);

/* =====================================================================
   PRUEBA DE BATERÍA AL ARRANCAR (la hace el servicio; aquí solo se muestra)
   ===================================================================== */
let ultPrueba = store('forte-ult-prueba') || 0;
setInterval(() => {
  if (!F.app) return;
  const L = F.batteryLog().filter(e => e.tipo === 'prueba'), e = L[L.length - 1];
  if (e && e.t > ultPrueba) {
    ultPrueba = e.t; store('forte-ult-prueba', e.t);
    if (Date.now() - e.t < 120000) F.emit('alert', { id: 'bat_test', text: `Batería: ${['bien', 'regular', 'fallando'][e.estado || 0]} · bajó a ${(+e.v).toFixed(1)} V`, kind: ['ok', 'warn', 'crit'][e.estado || 0] });
  }
}, 8000);

/* =====================================================================
   CLIMA: animación cuando de verdad llueve donde vas, y aviso de lo que viene adelante
   ===================================================================== */
const tipoClima = c => c == null ? null : (c === 96 || c === 99) ? 'granizo' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'nieve' : c >= 95 ? 'tormenta' : (c >= 61 && c <= 67) || (c >= 80 && c <= 82) ? 'lluvia' : c >= 51 && c <= 57 ? 'llovizna' : null;
let climaPrueba = null;
F.climaProbar = tipo => { climaPrueba = { tipo, hasta: performance.now() + 12000 }; };
// con el carro en movimiento, el clima de aquí se actualiza cada 10 minutos
setInterval(() => { if (F.weather && gpsReal() && Date.now() - F.weather.t > 10 * 60e3 && F.pedirClima) F.pedirClima(); }, 60e3);
const gotas = [];
let relampago = 0;
F.on('teslaFx', c => {
  let tipo = climaPrueba && performance.now() < climaPrueba.hasta ? climaPrueba.tipo : (F.cfg.climaFx ? tipoClima(F.weather && F.weather.code) : null);
  if (!tipo) { gotas.length = 0; return; }
  const N = { llovizna: 70, lluvia: 160, tormenta: 230, nieve: 130, granizo: 110 }[tipo], dt = F.dt || .016, v = F.S.speed || 0;
  while (gotas.length < N) gotas.push({ x: Math.random() * 1700 - 50, y: Math.random() * 620, r: Math.random(), f: Math.random() * 6.28 });
  if (gotas.length > N) gotas.length = N;
  const noche = F.tesla ? F.tesla.night() : 0;
  c.save();
  // cielo un poco más oscuro
  c.fillStyle = tipo === 'nieve' ? 'rgba(220,230,245,.06)' : 'rgba(20,30,45,.10)'; c.fillRect(0, 0, 1600, 620);
  if (tipo === 'nieve') {
    c.fillStyle = noche > .5 ? 'rgba(235,242,255,.9)' : 'rgba(255,255,255,.95)';
    c.shadowColor = 'rgba(80,100,130,.5)'; c.shadowBlur = 3;
    for (const g of gotas) {
      g.y += (40 + g.r * 60) * dt; g.f += dt * (1 + g.r); g.x += Math.sin(g.f) * 22 * dt - v * .08 * dt * (g.x - 800) / 800;
      if (g.y > 625) { g.y = -6; g.x = Math.random() * 1700 - 50; }
      c.beginPath(); c.arc(g.x, g.y, 1.6 + g.r * 3.2, 0, Math.PI * 2); c.fill();
    }
  } else if (tipo === 'granizo') {
    c.fillStyle = 'rgba(240,248,255,.95)'; c.shadowColor = 'rgba(40,60,90,.6)'; c.shadowBlur = 3;
    for (const g of gotas) {
      g.y += (520 + g.r * 320) * dt; g.x += 30 * dt;
      if (g.y > 560 + g.r * 60) { g.y = -10; g.x = Math.random() * 1700 - 50; }
      c.beginPath(); c.arc(g.x, g.y, 2 + g.r * 2.6, 0, Math.PI * 2); c.fill();
    }
  } else {
    const inclina = .18 + Math.min(.5, v / 250);
    c.strokeStyle = noche > .5 ? 'rgba(170,195,230,.55)' : 'rgba(90,115,150,.45)'; c.lineWidth = tipo === 'llovizna' ? 1.2 : 1.8; c.lineCap = 'round';
    c.beginPath();
    for (const g of gotas) {
      const vel = (tipo === 'llovizna' ? 520 : 900) + g.r * 400, L = (tipo === 'llovizna' ? 10 : 22) + g.r * 18;
      g.y += vel * dt; g.x -= vel * inclina * dt * .35;
      if (g.y > 625) { g.y = -20; g.x = Math.random() * 1750; }
      c.moveTo(g.x, g.y); c.lineTo(g.x + L * inclina * .35, g.y - L);
    }
    c.stroke();
    // salpicadas en el camino
    c.strokeStyle = 'rgba(160,185,215,.35)'; c.lineWidth = 1.2;
    for (let i = 0; i < (tipo === 'llovizna' ? 3 : 8); i++) {
      const d = 4 + Math.random() * 40, L = (Math.random() * 2 - 1) * 3, T = F.tesla;
      if (!T) break; const x = T.px(L, d), y = T.py(d), s = 600 / (d + 5.4) * .12;
      c.beginPath(); c.ellipse(x, y, s * 2.5, s * .6, 0, 0, Math.PI * 2); c.stroke();
    }
    if (tipo === 'tormenta') {
      if (relampago <= 0 && Math.random() < dt / 6) relampago = .35;
      if (relampago > 0) { relampago -= dt; c.fillStyle = `rgba(235,240,255,${clamp(relampago * 2.2, 0, .55) * (Math.random() < .7 ? 1 : .3)})`; c.fillRect(0, 0, 1600, 620); }
    }
  }
  c.restore();
});
// aviso de lluvia, nieve o granizo más adelante en el camino
const destino = (lat, lon, rumbo, km) => {
  const R = 6371, d = km / R, b = rumbo * Math.PI / 180, p1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 * 180 / Math.PI, l2 * 180 / Math.PI];
};
let adelanteBusy = false;
function climaAdelante() {
  const g = gpsReal();
  if (!F.cfg.climaAdelante || !g || adelanteBusy || g.bearing == null || (F.S.speed || g.speed || 0) < 30) return;
  adelanteBusy = true;
  const kms = [10, 25, 45], P = kms.map(k => destino(g.lat, g.lon, g.bearing, k));
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${P.map(p => p[0].toFixed(3)).join(',')}&longitude=${P.map(p => p[1].toFixed(3)).join(',')}&hourly=weather_code&forecast_hours=3&timezone=auto`;
  fetch(url).then(r => r.json()).then(j => {
    const A = Array.isArray(j) ? j : [j], aqui = tipoClima(F.weather && F.weather.code), vel = Math.max(30, F.S.speed || g.speed || 60);
    for (let i = 0; i < A.length; i++) {
      const h = A[i].hourly; if (!h) continue;
      const llega = Math.min(h.weather_code.length - 1, Math.floor(kms[i] / vel)), t = tipoClima(h.weather_code[llega]);
      if (!t || t === aqui || (t === 'llovizna' && aqui === 'lluvia')) continue;
      if (!cada('climaAdelante_' + t, 40 * 60)) return;
      const q = { llovizna: 'llovizna', lluvia: 'lluvia', tormenta: 'tormenta', nieve: 'nieve', granizo: 'granizo' }[t];
      F.alert('climaAdelante', `Más adelante (${kms[i]} km): ${q}`, t === 'granizo' || t === 'tormenta' ? 'crit' : 'warn', `Más adelante, como a ${kms[i]} kilómetros, viene ${q}`);
      return;
    }
  }).catch(() => {}).finally(() => { adelanteBusy = false; });
}
setInterval(climaAdelante, 10 * 60e3); setTimeout(climaAdelante, 90e3);

/* =====================================================================
   EL MENÚ DE TRES PUNTITOS
   ===================================================================== */
const bt = document.createElement('button');
bt.className = 'ibtn'; bt.id = 'btnMas'; bt.type = 'button'; bt.setAttribute('aria-label', 'Más opciones');
bt.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
$('btnMenu').before(bt);
const popEl = document.createElement('div'); popEl.id = 'masPop'; popEl.hidden = true;
document.body.appendChild(popEl);
const seg = (k, ops) => `<div class="seg" data-k="${k}">${ops.map(([v, l]) => `<button type="button" data-v="${v}" class="${F.cfg[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const sw = (k, l, sub) => `<label class="sw"><span>${l}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-k="${k}"${F.cfg[k] ? ' checked' : ''}><i></i></label>`;
const pop = {
  pintar() {
    if (popEl.hidden) return;
    const c = F.cfg, tol = c.tolerancia ?? 5, ct = c.contacto, sc = popEl.scrollTop;
    popEl.innerHTML = `<div class="ph"><b>Opciones</b><button type="button" class="px" aria-label="Cerrar">✕</button></div>
<h4>Cámara</h4>
<div class="row"><span>Salida de carril</span>${seg('carril', [['off', 'Apagado'], ['pitido', 'Pitido'], ['voz', 'Voz']])}</div>
${c.carril !== 'off' ? `<button type="button" class="mini" data-a="calibrar">Calibrar centro del carril</button><p class="hint">Avisa arriba de 45 km/h. Como no puedo leer la direccional, al cambiarte de carril también suena.</p>` : ''}
<div class="row"><span>Peatones y ciclistas</span>${seg('peatones', [['off', 'Apagado'], ['pitido', 'Pitido'], ['voz', 'Voz']])}</div>
${sw('semaforo', 'Semáforo (rojo: para · verde: avanza)', 'Es una ayuda: de noche o con el sol de frente puede fallar')}
<h4>Cámara Pruveeo (Wi-Fi)</h4>
${sw('pruveeo', 'Conectar la Pruveeo', 'Conecta el teléfono al Wi-Fi de la cámara (MUSTANG, clave 12345678)')}
${c.pruveeo ? `<div class="row"><span>Los avisos de la cámara usan</span>${seg('fuenteCam', [['tel', 'Teléfono'], ['pruveeo', 'Pruveeo']])}</div>
<div class="row"><span>Estado</span><b class="ctc pvEst">${esc(F.pruveeo.motivo())}</b></div>
<div class="step" style="justify-content:flex-start"><button type="button" data-a="pvWifi">Wi-Fi</button><button type="button" data-a="pvVer">Ver en vivo</button><button type="button" data-a="pvProbar">Probar conexión</button></div>
${F.pruveeo.diag() ? `<p class="hint" style="color:#cfd7e4">${esc(F.pruveeo.diag())}</p>` : ''}
<p class="hint">Si Android dice que esa red no tiene internet, elige "Mantener conexión". Mapas y clima siguen con tus datos móviles. La Pruveeo sigue grabando normal.</p>` : ''}
<h4>Límite de velocidad</h4>
<div class="row"><span>Tolerancia arriba del límite</span><div class="step"><button type="button" data-a="tol-">−</button><b>+${tol} km/h</b><button type="button" data-a="tol+">+</button></div></div>
<h4>Motor y batería</h4>
${sw('ralenti', 'Detector de ralentí raro', 'Con el motor caliente y el carro detenido')}
${sw('batSiempre', 'Decir la prueba de batería cada arranque', 'Si lo apagas, solo habla cuando algo va mal')}
<h4>Diversión</h4>
${sw('arrancones', 'Modo arrancones', 'Agrega el botón Arrancón abajo')}
${sw('motor', 'Sonido de motor')}
${c.motor ? `<div class="est">${ESTILOS.map(e => `<button type="button" data-est="${e.id}" class="${c.motorEstilo === e.id ? 'on' : ''}">${e.n}</button>`).join('')}</div>
<div class="row"><span>Volumen</span><input type="range" min="0.1" max="1" step="0.05" value="${c.motorVol}" data-a="vol"></div>
<p class="hint">Los sonidos se generan con tus revoluciones reales; no son grabaciones de esos carros.</p>` : ''}
<h4>Seguridad</h4>
${sw('choque', 'Detector de choque', 'Golpe fuerte + el carro se detiene: cuenta de 30 s')}
<div class="row"><span>Avisar a</span><b class="ctc">${ct ? esc(ct.nombre || ct.tel) + (ct.nombre ? ` <small>${esc(ct.tel)}</small>` : '') : 'Nadie todavía'}</b></div>
${window.OBD && OBD.pickContact ? '<button type="button" class="mini" data-a="contacto">Elegir contacto</button>'
  : '<div class="row"><input type="tel" placeholder="Teléfono" data-a="telManual" value="' + esc(ct ? ct.tel : '') + '"><button type="button" class="mini" data-a="telOk">Guardar</button></div>'}
<button type="button" class="mini" data-a="probarChoque">Probar (no manda nada)</button>
<p class="hint">Si no respondes, manda un SMS automático con tu ubicación y abre WhatsApp con el mensaje listo.</p>
<h4>Cansancio (ojos cerrados)</h4>
${sw('cansancio', 'Avisar si cierro los ojos', 'Alarma y voz si cierras los ojos 1.5 s arriba de 10 km/h')}
${c.cansancio ? `<div class="row"><span>Ver mi cara con</span>${seg('ojosFuente', [['pruveeo', 'Pruveeo adentro'], ['tel', 'Teléfono']])}</div>
<div class="row"><span>Estado</span><b class="ctc ojEst">${esc(F.ojos ? F.ojos.estado() : '')}</b></div>
<div class="row"><span>Avisar a</span><b class="ctc">${c.contactoCansancio ? esc(c.contactoCansancio.nombre || c.contactoCansancio.tel) : ct ? esc(ct.nombre || ct.tel) + ' <small>(el del choque)</small>' : 'Nadie todavía'}</b></div>
<div class="step" style="justify-content:flex-start">${window.OBD && OBD.pickContact ? '<button type="button" data-a="contactoCansancio">Elegir contacto</button>' : ''}<button type="button" data-a="probarOjos">Probar alarma</button></div>
<p class="hint">Le llega un SMS automático con la hora, la velocidad y tu ubicación. La foto por WhatsApp se abre lista cuando el carro se detiene (WhatsApp siempre pide tocar Enviar). ${c.ojosFuente === 'pruveeo' ? 'En la Pruveeo usa "Cambiar vista" hasta que se vea la cámara de adentro (o las dos juntas).' : 'Con la cámara frontal, los avisos de carros y carril deben usar la Pruveeo.'}</p>` : ''}
<h4>Clima</h4>
${sw('climaFx', 'Lluvia o nieve en la pantalla', 'Solo cuando de verdad está lloviendo donde vas')}
${sw('climaAdelante', 'Avisar si viene lluvia o granizo adelante')}
<div class="row"><span>Ver cómo se ve</span><div class="step"><button type="button" data-a="fx-lluvia">Lluvia</button><button type="button" data-a="fx-tormenta">Tormenta</button><button type="button" data-a="fx-nieve">Nieve</button><button type="button" data-a="fx-granizo">Granizo</button></div></div>`;
    popEl.querySelector('.px').onclick = pop.cerrar;
    popEl.querySelectorAll('.seg button').forEach(b => b.onclick = () => cambiar(b.parentNode.dataset.k, b.dataset.v));
    popEl.querySelectorAll('.sw input').forEach(i => i.onchange = () => cambiar(i.dataset.k, i.checked));
    popEl.querySelectorAll('[data-est]').forEach(b => b.onclick = () => { F.cfg.motorEstilo = b.dataset.est; F.save(); F.motorAplicar(); pop.pintar(); });
    popEl.querySelectorAll('[data-a]').forEach(b => {
      const a = b.dataset.a;
      if (a === 'vol') { b.oninput = () => { F.cfg.motorVol = +b.value; F.save(); }; return; }
      if (a === 'telManual') return;
      b.onclick = () => accion(a);
    });
    popEl.scrollTop = sc;
  },
  abrir() { popEl.hidden = false; pop.pintar(); },
  cerrar() { popEl.hidden = true; }
};
bt.onclick = () => popEl.hidden ? pop.abrir() : pop.cerrar();
document.addEventListener('pointerdown', e => { if (!popEl.hidden && !popEl.contains(e.target) && e.target !== bt && !bt.contains(e.target)) pop.cerrar(); });
function cambiar(k, v) {
  F.cfg[k] = v; F.save();
  if (['carril', 'peatones', 'semaforo'].includes(k)) F.visionAplicar && F.visionAplicar();
  if (k === 'motor') { F.audio(); F.motorAplicar(); }
  if (k === 'arrancones') dock();
  if (k === 'pruveeo') {
    if (v) { F.pruveeo.conectar(); ui.toast('Conectando con la Pruveeo…'); }
    else { F.pruveeo.parar(); if (F.cfg.fuenteCam === 'pruveeo') { F.cfg.fuenteCam = 'tel'; F.save(); F.visionAplicar && F.visionAplicar(); } }
    F.pruveeoDock && F.pruveeoDock();
  }
  if (k === 'fuenteCam') F.visionAplicar && F.visionAplicar();
  if (k === 'cansancio' || k === 'ojosFuente') { if (k === 'ojosFuente' && F.ojosAplicar) { F.cfg.cansancio = false; F.ojosAplicar(); F.cfg.cansancio = true; } F.ojosAplicar && F.ojosAplicar(); if (v && window.OBD && OBD.askSms) OBD.askSms(); }
  if (k === 'choque' && v) {
    if (window.OBD && OBD.askSms) OBD.askSms();
    if (!F.cfg.contacto) ui.toast('Ahora elige a quién avisar');
  }
  pop.pintar();
}
function accion(a) {
  const c = F.cfg;
  if (a === 'tol-' || a === 'tol+') { c.tolerancia = clamp((c.tolerancia ?? 5) + (a === 'tol+' ? 1 : -1), 0, 20); F.save(); F.emit('tolerancia'); pop.pintar(); return; }
  if (a === 'pvWifi') { if (window.OBD && OBD.wifiAjustes) OBD.wifiAjustes(); else ui.toast('Abre los ajustes de Wi-Fi del teléfono'); return; }
  if (a === 'pvVer') { pop.cerrar(); F.pruveeo.ver(); return; }
  if (a === 'pvProbar') { F.pruveeo.probar(); return; }
  if (a === 'calibrar') { ui.toast(F.carrilCalibrar && F.carrilCalibrar() ? 'Listo: este es el centro de tu carril' : 'Todavía no veo las líneas del carril'); return; }
  if (a === 'contacto') { contactoPara = 'contacto'; OBD.pickContact(); return; }
  if (a === 'contactoCansancio') { contactoPara = 'contactoCansancio'; OBD.pickContact(); return; }
  if (a === 'probarOjos') { pop.cerrar(); F.ojosProbar && F.ojosProbar(); return; }
  if (a === 'telOk') { const t = popEl.querySelector('[data-a="telManual"]').value.trim(); if (t.replace(/\D/g, '').length >= 8) { c.contacto = { nombre: '', tel: t }; F.save(); ui.toast('Contacto guardado'); } else ui.toast('Escribe un teléfono válido'); pop.pintar(); return; }
  if (a === 'probarChoque') { pop.cerrar(); choqueAlerta(true); return; }
  if (a.startsWith('fx-')) { pop.cerrar(); F.climaProbar(a.slice(3)); return; }
}
F.masMenu = pop;

/* ---- estilos ---- */
const css = document.createElement('style');
css.textContent = `
#btnMas{display:none}
body[data-skin="tesla"] #btnMas{display:grid}
#masPop{position:fixed;z-index:40;right:max(10px,env(safe-area-inset-right,0px));top:calc(env(safe-area-inset-top,0px) + 56px);
  width:min(400px,calc(100vw - 20px));max-height:calc(100vh - 130px);overflow:auto;background:rgba(12,17,27,.97);color:#e8edf5;
  border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.55);padding:12px 14px 16px;font-size:14px;-webkit-overflow-scrolling:touch}
#masPop .ph{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
#masPop .ph b{font-size:16px}
#masPop .px{border:0;background:rgba(255,255,255,.08);color:#fff;width:32px;height:32px;border-radius:10px;cursor:pointer}
#masPop h4{margin:14px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8ea0bb}
#masPop .row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0;min-height:36px}
#masPop .row>span{flex:1;min-width:0}
#masPop .row input[type=range]{flex:1;max-width:180px}
#masPop .row input[type=tel]{flex:1;min-width:0;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#0b1220;color:#fff;padding:0 10px;font-size:15px}
#masPop .seg{display:flex;background:rgba(255,255,255,.06);border-radius:10px;padding:3px;gap:2px;flex:none}
#masPop .seg button,#masPop .step button,#masPop .mini,#masPop .est button{border:0;background:transparent;color:#cfd7e4;border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;cursor:pointer}
#masPop .seg button.on{background:#2f6bff;color:#fff;font-weight:700}
#masPop .step{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end}
#masPop .step button{background:rgba(255,255,255,.08);min-width:34px}
#masPop .step b{min-width:74px;text-align:center}
#masPop .mini{background:rgba(255,255,255,.08);margin:2px 0 4px;display:inline-block}
#masPop .hint{margin:2px 0 6px;color:#8391a7;font-size:12px;line-height:1.35}
#masPop .ctc{font-weight:700;text-align:right}
#masPop .ctc small{display:block;font-weight:500;color:#8ea0bb}
#masPop .sw{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0;cursor:pointer}
#masPop .sw span{flex:1}
#masPop .sw small{display:block;color:#8391a7;font-size:12px;margin-top:2px}
#masPop .sw input{position:absolute;opacity:0;width:0;height:0}
#masPop .sw i{flex:none;width:46px;height:26px;border-radius:13px;background:rgba(255,255,255,.18);position:relative;transition:background .2s}
#masPop .sw i:after{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}
#masPop .sw input:checked+i{background:#20b26b}
#masPop .sw input:checked+i:after{transform:translateX(20px)}
#masPop .sw input:focus-visible+i{outline:2px solid #6aa0ff;outline-offset:2px}
#masPop .est{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}
#masPop .est button{background:rgba(255,255,255,.06);text-align:left;padding:9px 10px}
#masPop .est button.on{background:#2f6bff;color:#fff;font-weight:700}
#drag{position:fixed;inset:0;z-index:45;background:rgba(4,6,10,.88);display:flex;align-items:center;justify-content:center;padding:16px}
#drag[hidden],#choque[hidden]{display:none!important}
#drag .dbox{display:flex;gap:28px;align-items:center;max-width:760px;width:100%;color:#fff}
#drag .dtree{flex:none;display:flex;flex-direction:column;gap:min(2.4vh,12px);background:#0d1016;border:2px solid #2a2f38;border-radius:22px;padding:16px}
#drag .dtree i{width:min(10vh,64px);height:min(10vh,64px);border-radius:50%;background:#1d222b;display:block}
#drag .dtree i[data-l="r"]{width:min(6vh,40px);height:min(6vh,40px);align-self:center}
#drag .dtree i.on{background:#ffb400;box-shadow:0 0 22px #ffb400}
#drag .dtree i[data-l="v"].on{background:#19e070;box-shadow:0 0 30px #19e070}
#drag .dtree i[data-l="r"].on{background:#ff3030;box-shadow:0 0 22px #ff3030}
#drag .dinfo{flex:1;min-width:0}
#drag h2{margin:0 0 6px;font-size:26px}
#drag #dgTxt{font-size:18px;margin:0 0 10px;color:#d6dce6}
#drag table{width:100%;border-collapse:collapse;font-size:17px;margin-bottom:12px}
#drag td,#drag th{padding:5px 6px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08)}
#drag td:first-child,#drag th:first-child{text-align:left;color:#9aa6b8}
#drag .dbtns{display:flex;gap:10px}
#drag .dbtns button{flex:1;height:52px;border-radius:14px;border:0;font:inherit;font-size:18px;font-weight:700;background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
#drag .dbtns .pri{background:#20b26b}
#drag .dbtns button:disabled{opacity:.4}
#drag .dnote{color:#8391a7;font-size:12px;margin:10px 0 0}
#choque{position:fixed;inset:0;z-index:60;background:rgba(150,10,20,.94);display:flex;align-items:center;justify-content:center;padding:16px;color:#fff;text-align:center}
#choque .cbox{max-width:520px;width:100%}
#choque h2{font-size:34px;margin:0 0 8px}
#choque p{font-size:18px;margin:0 0 6px}
#chNum{font-size:min(28vh,140px);font-weight:800;line-height:1;margin:6px 0 14px;font-variant-numeric:tabular-nums}
#choque button{display:block;width:100%;height:64px;border-radius:16px;border:0;font:inherit;font-size:22px;font-weight:800;margin:10px 0;cursor:pointer}
#chOk{background:#fff;color:#a00d18}
#chYa{background:rgba(0,0,0,.35);color:#fff}
@media (max-height:420px){#drag .dbox{gap:16px}#drag h2{font-size:20px}#drag table{font-size:15px}#drag .dbtns button{height:44px}}`;
document.head.appendChild(css);

// al abrir con algo ya activado
setTimeout(() => { if (F.cfg.motor) F.motorAplicar(); }, 1500);
})();
// estado de los ojos en el menú, al momento
setInterval(() => { const e = document.querySelector('#masPop .ojEst'); if (e && F.ojos) e.textContent = F.ojos.estado(); }, 700);
