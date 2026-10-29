/* Tablero Forte · diseño "Forte Tesla": tu Forte visto desde atrás sobre un camino que avanza.
   Modo noche (faros), modo Sport (arriba de 75 km/h), luces de freno, marcha aproximada,
   autonomía, rendimiento, clima, fuerza G y avisos arriba del auto. */
(function () {
'use strict';
const F = window.F, K = F.K;
const n = (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toFixed(d);
const clamp = F.clamp;

// foto del auto (recortada del video del dron)
const car = new Image();
let carOk = false;
car.onload = () => { carOk = true; };
car.src = 'car_rear.webp';
// posiciones de las luces dentro de la foto (0..1)
const LUZ = { izq: [0.10, 0.375], der: [0.905, 0.375], centro: [0.5, 0.045], barra: [[0.30, 0.353], [0.5, 0.35], [0.70, 0.353]] };

// colores: día, noche y sport
const PAL = {
  dia:   { bg0: '#eef1f5', bg1: '#d6dce5', road: '#c3cad4', edge: '#ffffff', lane: '#ffffff', ink: '#18202b', mute: '#6f7a8a', card: '#ffffff', cardLine: 'rgba(0,0,0,0)', acc: '#2f6bff' },
  noche: { bg0: '#0b0f17', bg1: '#141b27', road: '#1d2431', edge: '#3a4458', lane: '#56627a', ink: '#eef2f8', mute: '#8391a7', card: '#161d2a', cardLine: '#263044', acc: '#4d8dff' },
  sport: { bg0: '#14040a', bg1: '#2a0610', road: '#22101a', edge: '#ff2a3b', lane: '#ff5a66', ink: '#ffffff', mute: '#ff9aa3', card: '#200a12', cardLine: '#5a1420', acc: '#ff2a3b' }
};
const hex = h => h[0] === '#' ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  : h.slice(h.indexOf('(') + 1, h.indexOf(')')).split(',').slice(0, 3).map(Number);
function mix(a, b, t) {
  if (a.startsWith('rgba') || b.startsWith('rgba')) return t < .5 ? a : b;
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',')})`;
}
let nightMix = 0, sportMix = 0, sport = false, dist = 0, brake = 0, startT = -10, alerta = null;
const P = {};
function paleta() {
  for (const k in PAL.dia) P[k] = mix(mix(PAL.dia[k], PAL.noche[k], nightMix), PAL.sport[k], sportMix);
}

// animación de arranque al conectar el OBD
F.on('conn', c => { if (c.kind === 'ok') startT = F.t || 0; });
F.on('alert', a => { alerta = { text: a.text, kind: a.kind, t: F.t || 0 }; });

// marcha aproximada (rpm por km/h de un Forte 2.0); en IVT es una estimación
const MARCHAS = [137, 74.6, 50, 37.8, 32.6, 28.2];
function marcha(V) {
  if (V.speed < 3 || !V.rpm) return null;
  const r = V.rpm / V.speed;
  let best = 0, err = 1e9;
  MARCHAS.forEach((m, i) => { const e = Math.abs(Math.log(r / m)); if (e < err) { err = e; best = i; } });
  return best + 1;
}

// proyección del camino: d = metros hacia adelante, L = metros a los lados
const HZ = 150;
const py = d => HZ + 2600 / (d + 5.4);
const px = (L, d) => 800 + L * 600 / (d + 5.4);
const ORILLA = 3.0;

function camino(c, V) {
  // asfalto
  c.beginPath();
  c.moveTo(px(-ORILLA - .2, 0), py(0)); c.lineTo(px(-ORILLA - .2, 140), py(140)); c.lineTo(px(ORILLA + .2, 140), py(140)); c.lineTo(px(ORILLA + .2, 0), py(0)); c.closePath();
  const g = c.createLinearGradient(0, HZ, 0, 620);
  g.addColorStop(0, mix(P.bg0, P.bg1, HZ / 620)); g.addColorStop(.3, P.road); g.addColorStop(1, P.road);
  c.fillStyle = g; c.fill();
  // faros de noche
  if (nightMix > .02) {
    c.save(); c.globalAlpha = nightMix * .85; c.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(px(s * .7, 5), py(5)); c.lineTo(px(s * 3.2, 45), py(45)); c.lineTo(px(s * .2, 45), py(45)); c.lineTo(px(s * .25, 5), py(5)); c.closePath();
      const hg = c.createLinearGradient(0, py(5), 0, py(45));
      hg.addColorStop(0, 'rgba(255,240,200,.55)'); hg.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = hg; c.fill();
    }
    c.restore();
  }
  // orillas
  c.strokeStyle = P.edge; c.lineWidth = 3;
  for (const s of [-1, 1]) {
    const eg = c.createLinearGradient(0, HZ, 0, 620); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(.35, P.edge);
    c.strokeStyle = eg; c.beginPath(); c.moveTo(px(s * ORILLA, 0), py(0)); c.lineTo(px(s * ORILLA, 140), py(140)); c.stroke();
  }
  // líneas de carril que avanzan
  const fase = dist % 9;
  c.fillStyle = P.lane;
  for (const s of [-1, 1]) {
    for (let d0 = -fase; d0 < 140; d0 += 9) {
      const a = Math.max(0, d0), b = d0 + 3; if (b <= 0) continue;
      const w0 = .07 * 600 / (a + 5.4), w1 = .07 * 600 / (b + 5.4);
      c.beginPath();
      c.moveTo(px(s * 1.8, a) - w0, py(a)); c.lineTo(px(s * 1.8, b) - w1, py(b)); c.lineTo(px(s * 1.8, b) + w1, py(b)); c.lineTo(px(s * 1.8, a) + w0, py(a)); c.closePath();
      c.globalAlpha = clamp(1 - b / 140, 0, 1); c.fill();
    }
  }
  c.globalAlpha = 1;
}

function auto(c, V) {
  const W = 370, H = carOk ? W * car.naturalHeight / car.naturalWidth : W * .79;
  const p = clamp((F.t - startT) / 1.6, 0, 1), ease = 1 - (1 - p) ** 3;
  const x = 800 - W / 2, y = 615 - H + (1 - ease) * 140;
  // sombra
  c.save(); c.globalAlpha = .35 * ease + .1;
  const sg = c.createRadialGradient(800, 600, 10, 800, 600, 190);
  sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg; c.beginPath(); c.ellipse(800, 606, 200, 26, 0, 0, Math.PI * 2); c.fill(); c.restore();
  if (carOk) { c.save(); c.globalAlpha = .25 + .75 * ease; c.drawImage(car, x, y, W, H); c.restore(); }
  else K.carRear(c, 800, 520, 1.6, P.mute, P.card);
  // luces: freno, noche y destello de bienvenida
  const flash = p < 1 && Math.floor(p * 6) % 2 === 0 ? 1 : 0;
  const k = Math.max(brake, nightMix * .35, flash * .9);
  if (k > .02 && carOk) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const glow = (u, v, r, a) => {
      const gx = x + u * W, gy = y + v * H, g = c.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, `rgba(255,40,40,${a})`); g.addColorStop(.4, `rgba(255,20,30,${a * .45})`); g.addColorStop(1, 'rgba(255,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(gx, gy, r, 0, Math.PI * 2); c.fill();
    };
    glow(LUZ.izq[0], LUZ.izq[1], 34 + 30 * k, k);
    glow(LUZ.der[0], LUZ.der[1], 34 + 30 * k, k);
    if (brake > .05) glow(LUZ.centro[0], LUZ.centro[1], 14 + 10 * brake, brake * .8);
    LUZ.barra.forEach(([u, v]) => glow(u, v, 18 + 14 * k, k * .6));
    c.restore();
  }
}

function tarjeta(c, x, y, w, h, label, valor, color, extra) {
  c.save();
  if (nightMix < .5 && sportMix < .5) { c.shadowColor = 'rgba(30,40,60,.14)'; c.shadowBlur = 22; c.shadowOffsetY = 4; }
  K.rr(c, x, y, w, h, 18); c.fillStyle = P.card; c.fill(); c.restore();
  if (nightMix > .5 || sportMix > .5) { K.rr(c, x, y, w, h, 18); c.strokeStyle = P.cardLine; c.lineWidth = 2; c.stroke(); }
  K.txt(c, label, x + 20, y + 30, 17, P.mute, 'left', 600);
  if (extra) extra(); else K.txt(c, valor, x + 20, y + 78, 34, color || P.ink, 'left', 700);
}

const def = {
  id: 'tesla', name: 'Forte Tesla',
  back(c, w, h) {
    // estados que cambian suave
    const dt = F.dt || .016, V = F.V;
    const night = F.isNight ? F.isNight() : false;
    nightMix += ((night ? 1 : 0) - nightMix) * Math.min(1, dt * 1.5);
    const on = F.cfg.sportOn || 75, off = on - 10;
    if (!sport && V.speed > on) { sport = true; F.speak && F.cfg.voz && F.app && F.speak('Modo sport'); }
    if (sport && V.speed < off) sport = false;
    sportMix += ((sport ? 1 : 0) - sportMix) * Math.min(1, dt * 2.5);
    dist += (V.speed || 0) / 3.6 * dt;
    const target = clamp((-(V.gLong || 0) - .04) / .2, 0, 1);
    brake += (target - brake) * Math.min(1, dt * 8);
    paleta();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, P.bg0); g.addColorStop(1, P.bg1);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  },
  draw(c, V) {
    camino(c, V);
    auto(c, V);

    // aviso arriba del auto
    if (alerta && F.t - alerta.t < 6) {
      const a = clamp(Math.min(F.t - alerta.t, 6 - (F.t - alerta.t)) * 3, 0, 1);
      c.save(); c.globalAlpha = a; c.font = K.font(24, 700);
      const tw = Math.min(560, c.measureText(alerta.text).width + 60);
      K.rr(c, 800 - tw / 2, 168, tw, 52, 26);
      c.fillStyle = alerta.kind === 'crit' ? '#e5352b' : alerta.kind === 'ok' ? '#1f9d55' : '#e89a10'; c.fill();
      K.txt(c, alerta.text.length > 38 ? alerta.text.slice(0, 37) + '…' : alerta.text, 800, 195, 24, '#fff', 'center', 700);
      c.restore();
    }

    // ---- izquierda: marcha, velocidad, potencia, autonomía ----
    const g = marcha(V), parked = V.speed < 1;
    ['P', 'R', 'N', 'D'].forEach((m, i) => {
      const on = (m === 'P' && parked) || (m === 'D' && !parked);
      K.txt(c, m, 120 + i * 44, 92, 30, on ? P.ink : P.mute, 'center', on ? 800 : 500);
    });
    if (g) K.txt(c, `${g}ª aprox.`, 310, 92, 18, P.mute, 'left', 600);
    // velocidad (en sport, con arco de rpm)
    if (sportMix > .02) {
      c.save(); c.globalAlpha = sportMix;
      K.arcG(c, { cx: 300, cy: 250, r: 128, a0: 150, a1: 390, v: V.rpm, max: 8000, w: 12, track: 'rgba(255,255,255,.08)', col: ['#ff7a1a', '#ff2a3b'], glow: '#ff2a3b', cap: 'round',
        red: { from: 6500, col: '#ff2a3b', r: 146, w: 4 } });
      c.restore();
    }
    K.txt(c, Math.round(V.speed), 300, 245, 150, P.ink, 'center', 500, 'Saira', 'middle', 'semi-condensed');
    K.txt(c, 'km/h', 300, 335, 24, P.mute, 'center', 600);
    if (V.limite > 0) {
      const over = V.speed > V.limite;
      c.beginPath(); c.arc(480, 160, 40, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
      c.lineWidth = 8; c.strokeStyle = '#e5352b'; c.stroke();
      K.txt(c, String(V.limite), 480, 162, 30, over ? '#e5352b' : '#111', 'center', 800);
    }
    // potencia / freno
    const pw = clamp(V.load / 100, 0, 1), rg = clamp(brake, 0, 1);
    K.rr(c, 100, 390, 400, 12, 6); c.fillStyle = mix(P.bg1, P.ink, .12); c.fill();
    if (pw > 0) { K.rr(c, 300, 390, 200 * pw, 12, 6); c.fillStyle = P.acc; c.fill(); }
    if (rg > 0) { K.rr(c, 300 - 200 * rg, 390, 200 * rg, 12, 6); c.fillStyle = '#20b26b'; c.fill(); }
    c.fillStyle = P.ink; c.fillRect(298, 382, 4, 28);
    K.txt(c, 'FRENO', 100, 428, 14, P.mute, 'left', 700); K.txt(c, 'POTENCIA', 500, 428, 14, P.mute, 'right', 700);
    // autonomía
    K.txt(c, `Autonomía ${n(V.range)} km`, 100, 488, 24, P.ink, 'left', 700);
    K.rr(c, 100, 510, 400, 34, 17); c.fillStyle = mix(P.bg1, P.ink, .1); c.fill();
    if (V.fuel != null) { K.rr(c, 100, 510, Math.max(34, 400 * V.fuel / 100), 34, 17); c.fillStyle = V.fuel < 15 ? '#e5352b' : '#20b26b'; c.fill(); }
    K.txt(c, `${n(V.fuel)} %`, 118, 528, 18, '#fff', 'left', 700);

    // ---- arriba al centro: hora y clima ----
    K.txt(c, V.clock, 800, 70, 26, P.ink, 'center', 600);
    const w = V.weather;
    if (w) K.txt(c, `${w.text} · ${n(w.temp)}° · ${nightMix > .5 ? 'amanece ' + w.sunrise : 'atardece ' + w.sunset}`, 800, 104, 17, P.mute, 'center', 600);

    // ---- derecha: tarjetas ----
    const X0 = 1090, CW = 215, CH = 118, GX = 16, GY = 14, Y0 = 60;
    const cards = [
      ['Rendimiento', V.kml == null ? (V.speed < 3 ? 'Detenido' : '—') : `${n(V.kml, 1)} km/L`],
      ['Motor', `${n(V.coolant)} °C`, V.coolant != null && V.coolant >= 108 ? '#e5352b' : null],
      ['Batería', `${n(V.volt, 1)} V`, V.volt != null && V.volt < 12.2 ? '#e89a10' : null],
      ['Exterior', V.ambient == null ? '—' : `${n(V.ambient)} °C`],
      ['Viaje', `${n(V.tripKm, 1)} km`],
      ['Fuerza G', '', null, (x, y) => () => {
        K.gmeter(c, x + CW - 52, y + CH / 2 + 6, 38, V.gLat || 0, V.gLong || 0, P.acc, mix(P.card, P.ink, .2), '#ff5b3a');
        K.txt(c, `${n(Math.hypot(V.gLong || 0, V.gLat || 0), 2)}`, x + 20, y + 78, 34, P.ink, 'left', 700);
      }]
    ];
    cards.forEach(([l, v, col, ex], i) => {
      const x = X0 + (i % 2) * (CW + GX), y = Y0 + Math.floor(i / 2) * (CH + GY);
      tarjeta(c, x, y, CW, CH, l, v, col, ex ? ex(x, y) : null);
    });
    K.txt(c, `Promedio ${n(V.avg, 1)} km/L · $${n(V.gasto, 2)}`, X0 + CW + GX / 2, Y0 + 3 * (CH + GY) + 22, 18, P.mute, 'center', 600);

    // ---- modo sport ----
    if (sportMix > .02) {
      c.save(); c.globalAlpha = sportMix;
      const f = clamp((V.rpm - 1500) / (6300 - 1500), 0, 1), flash = V.rpm > 6300 && Math.floor(F.t * 10) % 2;
      K.leds(c, 560, 18, 480, 22, 15, flash ? 1 : f, (k, i) => flash ? '#3a7bff' : i < 6 ? '#21e05a' : i < 11 ? '#ffd21f' : '#ff2a2a', 'rgba(255,255,255,.08)', 8, true);
      K.txt(c, 'SPORT', 300, 140, 22, '#ff2a3b', 'center', 800, 'Saira', 'middle', 'expanded');
      const vg = c.createRadialGradient(800, 310, 300, 800, 310, 900);
      vg.addColorStop(0, 'rgba(255,0,30,0)'); vg.addColorStop(1, 'rgba(255,0,30,.18)');
      c.fillStyle = vg; c.fillRect(0, 0, 1600, 620);
      c.restore();
    }
  }
};

// va después del diseño azul en la lista
F.SKINS.splice(1, 0, Object.assign({ kind: 'canvas' }, def));
})();
