/* Tablero Forte · lo que ve la cámara: líneas del carril (aviso si te sales),
   peatones y ciclistas al frente, y semáforo en rojo o verde.
   También el sonido corto (pitido) que usan los avisos. */
(function () {
'use strict';
const F = window.F, ui = F.ui, K = F.K;
const clamp = F.clamp;

/* ================= audio: un solo contexto para pitidos y sonido de motor ================= */
let AC = null;
F.audio = function () {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
};
// el navegador pide un toque antes de sonar; con el primer toque queda listo
['pointerdown', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, () => F.audio(), { passive: true }));
/** Pitido: tipo 'carril' (dos tonos, del lado de la línea), 'peaton' (tres rápidos), 'luz' (uno) o 'alarma'. */
F.beep = function (tipo, lado) {
  const ac = F.audio(); if (!ac) return;
  const T = { carril: [[1250, .09], [0, .06], [1250, .09]], peaton: [[1750, .07], [0, .05], [1750, .07], [0, .05], [1750, .07]],
    luz: [[900, .12]], alarma: [[1500, .18], [0, .06], [1100, .18]], ok: [[660, .08], [0, .03], [990, .12]] }[tipo] || [[1000, .1]];
  let t = ac.currentTime + .02;
  const out = ac.createGain(); out.gain.value = .55;
  let dest = ac.destination;
  if (lado && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = lado === 'izq' ? -.8 : .8; p.connect(dest); dest = p; }
  out.connect(dest);
  for (const [f, d] of T) {
    if (f) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35, t + .008); g.gain.setValueAtTime(.35, t + d - .015); g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + .02);
    }
    t += d;
  }
};
const cool = {};
const cada = (id, s) => { const t = Date.now(); if (cool[id] && t - cool[id] < s * 1000) return false; cool[id] = t; return true; };
/** Aviso de un detector: pitido o voz según el ajuste ('pitido' | 'voz'). */
function avisar(modo, id, texto, voz, pit, lado) {
  F.emit('alert', { id, text: texto, kind: 'crit' });
  if (modo === 'voz') F.speak(voz); else F.beep(pit, lado);
}

/* ================= qué necesita la cámara ================= */
// de dónde sale la imagen: la cámara del teléfono o la dashcam Pruveeo por Wi-Fi
F.camFuente = function () {
  if (F.cfg.fuenteCam === 'pruveeo') {
    const p = F.pruveeo;
    if (p && p.listo()) return { el: p.lienzo, w: p.lienzo.width, h: p.lienzo.height, focal: .3 };   // lente muy abierto
    return { motivo: 'Pruveeo: ' + (p ? p.motivo() : 'sin conectar') };
  }
  const v = document.getElementById('camVid');
  if (!ui.cam.stream || !v) return { motivo: 'sin cámara' };
  if (v.paused) v.play().catch(() => {});
  if (!v.videoWidth) return { motivo: 'esperando imagen' };
  return { el: v, w: v.videoWidth, h: v.videoHeight, focal: .714 };
};
const camQuiere = () => (F.cfg.carril && F.cfg.carril !== 'off') || (F.cfg.peatones && F.cfg.peatones !== 'off') || F.cfg.semaforo || F.cfg.deteccion;
F.visionAplicar = async function () {
  if (camQuiere() && F.cfg.fuenteCam === 'pruveeo') { if (F.pruveeo && !F.pruveeo.activo()) F.pruveeo.conectar(); }
  else if (camQuiere() && !ui.cam.stream) { try { await ui.camStart(); } catch (e) {} }
  if (F.visionRevisar) await F.visionRevisar();
  if (F.cfg.carril && F.cfg.carril !== 'off') carrilIniciar(); else carrilParar();
  if (!F.cfg.semaforo) { F.luz = null; luzHist.length = 0; }
  if (!F.cfg.peatones || F.cfg.peatones === 'off') F.gente = [];
};

/* ================= líneas del carril ================= */
// Se busca en la parte de abajo de la imagen lo que es una raya clara y angosta (blanca o amarilla),
// se ajusta una recta de cada lado y con eso se sabe dónde va el auto dentro del carril.
const LW = 160, LH = 90, Y0 = Math.round(LH * .56), Y1 = Math.round(LH * .93);
const lc = document.createElement('canvas'); lc.width = LW; lc.height = LH;
const lx = lc.getContext('2d', { willReadFrequently: true });
F.lane = { ok: false, l: null, r: null, off: 0, t: 0, warn: null, warnT: 0 };
let carrilTimer = null, anchoPx = LW * .62, fuera = { izq: 0, der: 0 };
let lineaL = null, lineaR = null;   // {a, b, n}: x = a*y + b, n = cuadros seguidos vista
function carrilIniciar() { if (!carrilTimer) carrilTimer = setInterval(carrilCiclo, 110); }
function carrilParar() { clearInterval(carrilTimer); carrilTimer = null; F.lane = { ok: false, l: null, r: null, off: 0, t: 0, warn: null, warnT: 0 }; lineaL = lineaR = null; }

function ransac(P, signo) {
  // P: [[x, y, peso]]; signo -1 = línea izquierda (sube hacia la derecha), +1 = derecha
  if (P.length < 6) return null;
  let best = null, bestS = 0;
  for (let k = 0; k < 60; k++) {
    const p = P[(Math.random() * P.length) | 0], q = P[(Math.random() * P.length) | 0];
    if (Math.abs(p[1] - q[1]) < 6) continue;
    const a = (p[0] - q[0]) / (p[1] - q[1]), b = p[0] - a * p[1];
    if (a * signo < .25 || Math.abs(a) > 4.5) continue;
    let s = 0, filas = new Set();
    for (const r of P) if (Math.abs(r[0] - (a * r[1] + b)) < 2.2) { s += r[2]; filas.add(r[1]); }
    if (filas.size < 7) continue;
    if (s > bestS) { bestS = s; best = { a, b }; }
  }
  if (!best) return null;
  // ajuste fino con mínimos cuadrados sobre los puntos buenos
  let sw = 0, sy = 0, sx = 0, syy = 0, sxy = 0, filas = new Set();
  for (const r of P) if (Math.abs(r[0] - (best.a * r[1] + best.b)) < 2.2) { const w = r[2]; sw += w; sy += w * r[1]; sx += w * r[0]; syy += w * r[1] * r[1]; sxy += w * r[0] * r[1]; filas.add(r[1]); }
  const den = sw * syy - sy * sy; if (Math.abs(den) < 1e-6) return best;
  const a = (sw * sxy - sy * sx) / den, b = (sx - a * sy) / sw;
  if (filas.size < (Y1 - Y0) * .3) return null;
  return a * signo >= .2 ? { a, b } : null;
}
function suavizar(prev, nuevo) {
  if (!nuevo) return prev && prev.n > -4 ? { a: prev.a, b: prev.b, n: Math.min(0, prev.n) - 1 } : null;
  if (!prev || prev.n < 0) return { a: nuevo.a, b: nuevo.b, n: 1 };
  // si brinca mucho de un cuadro a otro, casi no se le hace caso
  const salto = Math.abs((nuevo.a * Y1 + nuevo.b) - (prev.a * Y1 + prev.b)), k = salto > 18 ? .15 : .45;
  return { a: prev.a + (nuevo.a - prev.a) * k, b: prev.b + (nuevo.b - prev.b) * k, n: prev.n + 1 };
}
function carrilCiclo() {
  const src = F.camFuente();
  if (!src.el) { F.lane.ok = false; return; }
  lx.drawImage(src.el, 0, 0, LW, LH);
  const d = lx.getImageData(0, Y0 - 1, LW, Y1 - Y0 + 2).data;
  const I = (x, y) => { const i = ((y - Y0 + 1) * LW + x) * 4; return (d[i] + d[i + 1]) * .5; };   // rojo+verde: el amarillo cuenta como claro
  const izq = [], der = [], cx = LW / 2 + (F.cfg.carrilCentro || 0) * LW;
  for (let y = Y0; y <= Y1; y++) {
    const k = (y - Y0) / (Y1 - Y0), w = Math.round(2 + k * 5);   // las rayas se ven más anchas abajo
    // brillo típico del renglón (para que funcione con sol o de noche)
    let suma = 0; for (let x = 0; x < LW; x += 4) suma += I(x, y); const med = suma / (LW / 4);
    let mejor = null;
    for (let x = w; x < LW - w; x++) {
      const c = I(x, y), a = I(x - w, y), b = I(x + w, y);
      const s = 2 * c - a - b - Math.abs(a - b);
      if (s > 34 && c > med + 18) {
        if (mejor && x - mejor[0] <= w) { if (s > mejor[2]) mejor = [x, y, s]; continue; }
        if (mejor) (mejor[0] < cx ? izq : der).push(mejor);
        mejor = [x, y, s];
      }
    }
    if (mejor) (mejor[0] < cx ? izq : der).push(mejor);
  }
  lineaL = suavizar(lineaL, ransac(izq, -1));
  lineaR = suavizar(lineaR, ransac(der, 1));
  const vL = lineaL && lineaL.n >= 2, vR = lineaR && lineaR.n >= 2;
  const xL = vL ? lineaL.a * Y1 + lineaL.b : null, xR = vR ? lineaR.a * Y1 + lineaR.b : null;
  if (vL && vR) {
    const w = xR - xL;
    if (w > LW * .3 && w < LW * 1.4) anchoPx += (w - anchoPx) * .1; else { F.lane.ok = false; return; }
  }
  if (!vL && !vR) { F.lane.ok = false; return; }
  const centro = vL && vR ? (xL + xR) / 2 : vL ? xL + anchoPx / 2 : xR - anchoPx / 2;
  const off = clamp((cx - centro) / anchoPx * 3.5, -2.5, 2.5);   // metros; + = vas cargado a la derecha
  F.lane.off += (off - F.lane.off) * .5;
  F.lane.ok = true; F.lane.l = vL; F.lane.r = vR; F.lane.t = performance.now();
  // ¿te estás saliendo? (la llanta casi pisa la línea: más de 0.75 m del centro)
  const vel = F.S.speed || 0, modo = F.cfg.carril;
  for (const lado of ['izq', 'der']) {
    const pasa = lado === 'izq' ? F.lane.off < -.75 && vL : F.lane.off > .75 && vR;
    fuera[lado] = pasa ? fuera[lado] + 1 : 0;
    if (fuera[lado] === 4 && vel >= 45 && cada('carril', 4)) {
      F.lane.warn = lado; F.lane.warnT = performance.now();
      avisar(modo, 'carril', `Te sales del carril (${lado === 'izq' ? 'izquierda' : 'derecha'})`, 'Cuidado, te sales del carril', 'carril', lado);
    }
  }
}
// "Calibrar": con el auto centrado en su carril, lo que se ve ahora es el centro
F.carrilCalibrar = function () {
  if (!F.lane.ok) return false;
  F.cfg.carrilCentro = clamp((F.cfg.carrilCentro || 0) - F.lane.off / 3.5 * anchoPx / LW, -.3, .3);
  F.lane.off = 0; F.save(); return true;
};

/* ================= peatones, ciclistas y semáforo (del detector) ================= */
F.gente = []; F.luz = null;
const luzHist = [];
let rojoVisto = 0, luzAnunciada = null;
F.on('det', r => {
  if (!r) { F.gente = []; F.luz = null; return; }
  const { det, lctx, vw, vh, focal } = r, vel = F.S.speed || 0;
  // ---- peatones y ciclistas ----
  if (F.cfg.peatones && F.cfg.peatones !== 'off') {
    const bicis = det.filter(d => d.class === 'bicycle' && d.score > .4);
    F.gente = det.filter(d => (d.class === 'person' || d.class === 'bicycle') && d.score > .45).map(d => {
      const [x, y, w, h] = d.bbox, cxx = (x + w / 2) / vw;
      // persona arriba de una bici = ciclista
      const enBici = d.class === 'person' && bicis.some(b => Math.abs((b.bbox[0] + b.bbox[2] / 2) / vw - cxx) < .06);
      const alto = d.class === 'bicycle' ? 1.05 : 1.7;
      const dd = alto * focal / Math.max(8, h);
      return { tipo: d.class === 'bicycle' || enBici ? 'ciclista' : 'peaton', cx: cxx, dist: dd, lat: (cxx - .5) * vw / focal * dd, bajo: (y + h) / vh };
    }).filter((g, i, A) => !(g.tipo === 'ciclista' && A.some((o, j) => j < i && o.tipo === 'ciclista' && Math.abs(o.cx - g.cx) < .06)));
    const zona = Math.max(14, vel / 3.6 * 3);   // 3 segundos adelante
    const peligro = F.gente.filter(g => Math.abs(g.cx - .5) < .17 && g.dist < zona).sort((a, b) => a.dist - b.dist)[0];
    F.gente.forEach(g => { g.peligro = g === peligro; });
    if (peligro && vel > 4 && cada('peaton', 5)) {
      const q = peligro.tipo === 'ciclista' ? 'ciclista' : 'peatón';
      avisar(F.cfg.peatones, 'peaton', `${q === 'ciclista' ? 'Ciclista' : 'Peatón'} adelante · ${Math.round(peligro.dist)} m`, `Cuidado, ${q} adelante`, 'peaton');
    }
  } else F.gente = [];

  // ---- semáforo ----
  if (F.cfg.semaforo) {
    const L = det.filter(d => d.class === 'traffic light' && d.score > .35).map(d => {
      const [x, y, w, h] = d.bbox; return { x, y, w, h, cx: (x + w / 2) / vw, cy: (y + h / 2) / vh };
    }).filter(l => l.cy < .58 && l.cx > .18 && l.cx < .82 && l.w * l.h > 30)   // arriba y al frente; las calaveras van abajo
      .sort((a, b) => (b.w * b.h) * (1 - Math.abs(b.cx - .5)) - (a.w * a.h) * (1 - Math.abs(a.cx - .5)));
    let estado = null;
    if (L[0]) estado = colorLuz(lctx, L[0]);
    luzHist.push(estado); if (luzHist.length > 5) luzHist.shift();
    // estable: el mismo color en 3 de los últimos 4 cuadros
    const ult = luzHist.slice(-4), cuenta = c => ult.filter(x => x === c).length;
    const estable = ['rojo', 'amarillo', 'verde'].find(c => cuenta(c) >= 3) || null;
    if (estable) F.luz = { estado: estable, t: performance.now() };
    else if (F.luz && performance.now() - F.luz.t > 2500) F.luz = null;
    if (estable === 'rojo') {
      rojoVisto = Date.now();
      if (vel > 12 && luzAnunciada !== 'rojo' && cada('luzRoja', 12)) { luzAnunciada = 'rojo'; F.alert('semaforo', 'Semáforo en rojo', 'crit', 'Semáforo en rojo, para'); }
      if (vel <= 12) luzAnunciada = 'rojo';
    } else if (estable === 'verde') {
      if (luzAnunciada === 'rojo' && vel < 6 && Date.now() - rojoVisto < 90000 && cada('luzVerde', 8)) F.alert('semaforo', 'Verde, avanza', 'ok', 'Verde, avanza');
      luzAnunciada = 'verde';
    } else if (estable === 'amarillo') {
      if (vel > 25 && luzAnunciada !== 'amarillo' && cada('luzAmarilla', 10)) { F.alert('semaforo', 'Semáforo en amarillo', 'warn', 'Amarillo, precaución'); }
      luzAnunciada = 'amarillo';
    }
  } else F.luz = null;
});
/** Qué luz está prendida dentro del recuadro del semáforo (y en qué parte: rojo arriba, verde abajo). */
function colorLuz(ctx, b) {
  const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y)), w = Math.max(2, Math.floor(b.w)), h = Math.max(2, Math.floor(b.h));
  let d; try { d = ctx.getImageData(x, y, w, h).data; } catch (e) { return null; }
  const cnt = { rojo: 0, amarillo: 0, verde: 0 }, pos = { rojo: 0, amarillo: 0, verde: 0 };
  const vertical = h > w * 1.25, horizontal = w > h * 1.25;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4, R = d[k] / 255, G = d[k + 1] / 255, B = d[k + 2] / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), V = mx, S = mx ? (mx - mn) / mx : 0;
    if (V < .5 || S < .4) continue;
    let H = mx === mn ? 0 : mx === R ? 60 * ((G - B) / (mx - mn)) : mx === G ? 60 * (2 + (B - R) / (mx - mn)) : 60 * (4 + (R - G) / (mx - mn));
    if (H < 0) H += 360;
    const c = H < 18 || H > 335 ? 'rojo' : H < 55 ? 'amarillo' : H > 85 && H < 200 ? 'verde' : null;
    if (!c) continue;
    cnt[c]++; pos[c] += vertical ? j / h : horizontal ? i / w : .5;
  }
  const total = cnt.rojo + cnt.amarillo + cnt.verde;
  if (total < Math.max(3, w * h * .025)) return null;
  const c = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (cnt[c] < total * .55) return null;
  const p = pos[c] / cnt[c];
  // la luz tiene que estar en su lugar: rojo arriba (o a la izquierda), verde abajo (o a la derecha)
  if ((vertical || horizontal) && ((c === 'rojo' && p > .55) || (c === 'verde' && p < .45))) return null;
  return c;
}

/* ================= dibujo en Forte Tesla ================= */
// figuras al estilo Tesla: persona blanca y lisa (cabeza, cuerpo, piernas); s = estatura en px
function figura(c, x, y, s, tipo, col) {
  const noche = F.tesla ? F.tesla.night() > .5 : false;
  const [cuerpo, sombra] = col === 'peligro' ? ['#ff5a5a', '#c73636'] : noche ? ['#f4f6f9', '#c3cad4'] : ['#ffffff', '#cfd5de'];
  const g = c.createLinearGradient(0, y - s, 0, y); g.addColorStop(0, cuerpo); g.addColorStop(1, sombra);
  c.save(); c.fillStyle = g; c.strokeStyle = g; c.lineCap = 'round'; c.lineJoin = 'round';
  if (tipo === 'ciclista') {
    const r = s * .2, ya = y - r;
    c.lineWidth = Math.max(1.5, s * .045); c.strokeStyle = noche ? '#9aa3ae' : '#7c8592';
    c.beginPath(); c.arc(x - s * .3, ya, r, 0, Math.PI * 2); c.arc(x + s * .3, ya, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(x - s * .3, ya); c.lineTo(x - s * .05, y - s * .5); c.lineTo(x + s * .3, ya); c.stroke();
    c.lineWidth = Math.max(3, s * .11); c.strokeStyle = g;
    c.beginPath(); c.moveTo(x - s * .02, y - s * .52); c.lineTo(x + s * .1, y - s * .82); c.stroke();       // torso
    c.beginPath(); c.moveTo(x + s * .08, y - s * .76); c.lineTo(x + s * .27, y - s * .6); c.stroke();        // brazo
    c.beginPath(); c.moveTo(x - s * .02, y - s * .52); c.lineTo(x + s * .05, y - s * .3); c.stroke();        // pierna
    c.beginPath(); c.arc(x + s * .13, y - s * .95, s * .09, 0, Math.PI * 2); c.fill();
  } else {
    const t = s * .17;   // grosor
    c.lineWidth = t * .8;
    c.beginPath(); c.moveTo(x - t * .45, y - s * .47); c.lineTo(x - t * .6, y - t * .4); c.moveTo(x + t * .45, y - s * .47); c.lineTo(x + t * .6, y - t * .4); c.stroke();   // piernas
    K.rr(c, x - t * .9, y - s * .82, t * 1.8, s * .4, t * .7); c.fill();                                        // torso
    c.lineWidth = t * .55;
    c.beginPath(); c.moveTo(x - t * .95, y - s * .76); c.lineTo(x - t * 1.15, y - s * .5); c.moveTo(x + t * .95, y - s * .76); c.lineTo(x + t * 1.15, y - s * .5); c.stroke();   // brazos
    c.beginPath(); c.arc(x, y - s * .91, t * .62, 0, Math.PI * 2); c.fill();                                  // cabeza
  }
  c.restore();
}
F.on('teslaCamino', c => {
  const T = F.tesla; if (!T) return;
  // peatones y ciclistas en el camino
  for (const g of (F.gente || []).slice().sort((a, b) => b.dist - a.dist)) {
    if (g.dist > 60) continue;
    const d = Math.max(g.dist, 6), s = 600 / (d + 5.4), lat = clamp(g.lat != null ? g.lat : (g.cx - .5) * 1.4 * d, -5.5, 5.5);
    const x = T.px(lat, d), y = T.py(d), col = g.peligro ? 'peligro' : 'normal';
    c.save(); c.globalAlpha = clamp(1.5 - d / 50, .4, 1);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(x, y, s * .4, s * .07, 0, 0, Math.PI * 2); c.fill();
    figura(c, x, y, clamp(s * 1.75, 22, 170), g.tipo, col);
    if (d < 35) K.txt(c, `${Math.round(g.dist)} m`, x, y + 14, 13, g.peligro ? '#e5352b' : T.P.mute, 'center', 700);
    c.restore();
  }
  // semáforo que ve la cámara
  if (F.cfg.semaforo) {
    const z = F.luz && performance.now() - F.luz.t < 3000 ? F.luz.estado : null, X = 600, Y = 210;
    c.save(); c.globalAlpha = z ? 1 : .35;
    K.rr(c, X - 20, Y - 52, 40, 104, 12); c.fillStyle = '#11151c'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.18)'; c.stroke();
    [['rojo', '#ff3030'], ['amarillo', '#ffb400'], ['verde', '#19e070']].forEach(([k, col], i) => {
      c.beginPath(); c.arc(X, Y - 31 + i * 31, 11, 0, Math.PI * 2);
      c.fillStyle = z === k ? col : 'rgba(255,255,255,.08)'; if (z === k) { c.shadowColor = col; c.shadowBlur = 16; } c.fill(); c.shadowBlur = 0;
    });
    c.restore();
  }
});
setTimeout(() => { if (F.app && camQuiere()) F.visionAplicar(); }, 3500);
})();
