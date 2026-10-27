/* Tablero Forte · diseños dibujados en canvas.
   Todos dibujan sobre un lienzo virtual de 1600×620 que se escala a la pantalla. */
(function () {
'use strict';
const F = window.F;
const RAD = Math.PI / 180;
const n = (v, d = 0) => v == null ? '—' : v.toFixed(d);
const K = F.K = {};

/* ================= herramientas ================= */
K.font = (size, weight = 600, fam = 'Saira') => `${weight} ${size}px "${fam}", "Arial Narrow", system-ui, sans-serif`;
K.txt = function (c, s, x, y, size, col, align = 'center', weight = 600, fam = 'Saira', base = 'middle', stretch) {
  c.font = K.font(size, weight, fam); c.fillStyle = col; c.textAlign = align; c.textBaseline = base;
  if ('fontStretch' in c) c.fontStretch = stretch || 'normal';
  c.fillText(s, x, y);
  if ('fontStretch' in c) c.fontStretch = 'normal';
};
K.pt = (cx, cy, r, a) => [cx + r * Math.cos(a * RAD), cy + r * Math.sin(a * RAD)];
K.arc = function (c, cx, cy, r, a0, a1, col, w, cap = 'butt') {
  if (Math.abs(a1 - a0) < .05) return;
  c.beginPath(); c.arc(cx, cy, r, Math.min(a0, a1) * RAD, Math.max(a0, a1) * RAD);
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = cap; c.stroke();
};
K.rr = function (c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
};
K.glow = function (c, col, blur, fn) { c.save(); c.shadowColor = col; c.shadowBlur = blur; fn(); c.restore(); };
K.lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
K.rad = (c, x, y, r0, r1, stops) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };

// patrón (madera, carbono, piel…) generado una vez
const tiles = {};
K.pattern = function (c, key, size, maker) {
  if (!tiles[key]) { const t = document.createElement('canvas'); t.width = t.height = size; maker(t.getContext('2d'), size); tiles[key] = t; }
  c._pats = c._pats || {};
  if (!c._pats[key]) c._pats[key] = c.createPattern(tiles[key], 'repeat');
  return c._pats[key];
};

// arco de valor con marcas
K.arcG = function (c, o) {
  const dir = o.a1 > o.a0 ? 1 : -1, span = o.a1 - o.a0;
  const f = F.clamp((o.v || 0) / o.max, 0, 1);
  if (o.track) K.arc(c, o.cx, o.cy, o.r, o.a0, o.a1, o.track, o.w, o.cap || 'butt');
  if (o.red) { const fr = o.red.from / o.max; K.arc(c, o.cx, o.cy, o.red.r || o.r, o.a0 + span * fr, o.a1, o.red.col, o.red.w || o.w * .35); }
  if (f > .002) {
    const p0 = K.pt(o.cx, o.cy, o.r, o.a0), p1 = K.pt(o.cx, o.cy, o.r, o.a0 + span * f);
    const col = Array.isArray(o.col) ? K.lin(c, p0[0], p0[1], p1[0], p1[1], o.col) : o.col;
    const draw = () => K.arc(c, o.cx, o.cy, o.r, o.a0, o.a0 + span * f, col, o.w, o.cap || 'butt');
    if (o.glow) K.glow(c, o.glow, o.glowBlur || 18, draw); else draw();
  }
  const T = o.ticks;
  if (T) {
    for (let v = 0; v <= o.max + 1e-6; v += T.every) {
      const mj = Math.abs(v / T.major - Math.round(v / T.major)) < 1e-6;
      const a = o.a0 + span * v / o.max, r0 = T.r || (o.r - o.w / 2 - 6);
      const [x1, y1] = K.pt(o.cx, o.cy, r0, a), [x2, y2] = K.pt(o.cx, o.cy, r0 - (mj ? T.mlen || 22 : T.len || 12), a);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
      const red = o.red && v >= o.red.from;
      c.strokeStyle = red ? (T.rcol || o.red.col) : (mj ? T.mcol || T.col : T.col); c.lineWidth = mj ? T.mlw || 3 : T.lw || 1.5; c.lineCap = 'butt'; c.stroke();
      if (mj && T.labels) {
        const L = T.labels, [lx, ly] = K.pt(o.cx, o.cy, L.r, a);
        K.txt(c, L.fmt ? L.fmt(v) : String(v), lx, ly, L.size, red && L.rcol ? L.rcol : L.col, 'center', L.weight || 600, L.fam || 'Saira');
      }
    }
  }
  return f;
};

// reloj analógico con aguja
K.analog = function (c, o) {
  const { cx, cy, r } = o, a0 = o.a0 ?? 135, a1 = o.a1 ?? 405, span = a1 - a0;
  if (o.bezel) {
    c.beginPath(); c.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    c.fillStyle = K.lin(c, cx - r, cy - r, cx + r, cy + r, o.bezel); c.fill();
  }
  c.beginPath(); c.arc(cx, cy, r * (o.bezel ? 1.02 : 1), 0, Math.PI * 2);
  c.fillStyle = o.faceGrad ? K.rad(c, cx, cy - r * .2, r * .1, r * 1.05, o.faceGrad) : o.face; c.fill();
  if (o.red) K.arc(c, cx, cy, r * .88, a0 + span * o.red.from / o.max, a1, o.red.col, r * .07);
  for (let v = 0; v <= o.max + 1e-6; v += o.every) {
    const mj = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-6, a = a0 + span * v / o.max;
    const [x1, y1] = K.pt(cx, cy, r * .95, a), [x2, y2] = K.pt(cx, cy, r * (mj ? .8 : .88), a);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = o.tick; c.lineWidth = mj ? r * .025 : r * .01; c.stroke();
    if (mj && o.labels !== false) {
      const [lx, ly] = K.pt(cx, cy, r * (o.labelR || .64), a);
      K.txt(c, o.fmt ? o.fmt(v) : String(v), lx, ly, o.labelSize || r * .15, o.label, 'center', 600, o.fam || 'Oswald');
    }
  }
  if (o.unit) K.txt(c, o.unit, cx, cy + r * (o.unitY || .38), r * .1, o.unitCol || o.label, 'center', 600, o.fam || 'Oswald');
  if (o.inner) o.inner();
  const f = F.clamp((o.v || 0) / o.max, 0, 1), a = (a0 + span * f) * RAD;
  c.save(); c.translate(cx, cy); c.rotate(a);
  const draw = () => {
    c.beginPath(); c.moveTo(-r * .16, -r * .025); c.lineTo(r * .9, -r * .008); c.lineTo(r * .9, r * .008); c.lineTo(-r * .16, r * .025); c.closePath();
    c.fillStyle = o.needle; c.fill();
  };
  if (o.needleGlow) K.glow(c, o.needleGlow, 14, draw); else draw();
  c.restore();
  c.beginPath(); c.arc(cx, cy, r * .085, 0, Math.PI * 2);
  c.fillStyle = o.hub ? K.rad(c, cx - r * .02, cy - r * .02, 0, r * .09, o.hub) : '#222'; c.fill();
};

K.bar = function (c, x, y, w, h, f, col, track, rad = 0) {
  f = F.clamp(f || 0, 0, 1);
  if (track) { K.rr(c, x, y, w, h, rad); c.fillStyle = track; c.fill(); }
  if (f <= 0) return;
  if (w >= h) K.rr(c, x, y, w * f, h, rad); else K.rr(c, x, y + h * (1 - f), w, h * f, rad);
  c.fillStyle = col; c.fill();
};
K.leds = function (c, x, y, w, h, count, f, colFn, off, gap = 6, round = false) {
  const lw = (w - gap * (count - 1)) / count, lit = Math.round(F.clamp(f, 0, 1) * count);
  for (let i = 0; i < count; i++) {
    const on = i < lit; c.fillStyle = on ? colFn(i / (count - 1), i) : off;
    if (round) { c.beginPath(); c.arc(x + i * (lw + gap) + lw / 2, y + h / 2, Math.min(lw, h) / 2, 0, Math.PI * 2); c.fill(); }
    else { K.rr(c, x + i * (lw + gap), y, lw, h, 3); c.fill(); }
  }
};
const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
K.seg7 = function (c, str, x, y, h, on, off, align = 'right') {
  const W = h * .55, T = h * .11, adv = W + h * .22, dotW = h * .25;
  let total = 0; for (const ch of str) total += ch === '.' ? dotW : adv;
  let px = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  c.save(); c.lineCap = 'round'; c.lineWidth = T;
  for (const ch of str) {
    if (ch === '.') { c.fillStyle = on; c.beginPath(); c.arc(px + dotW / 2 - h * .05, y + h - T / 2, T * .6, 0, Math.PI * 2); c.fill(); px += dotW; continue; }
    const t = T / 2, x0 = px + t, x1 = px + W - t, y0 = y + t, y1 = y + h / 2, y2 = y + h - t, g = T * .8, sk = h * .06;
    const segs = { a: [x0 + g, y0, x1 - g, y0], b: [x1, y0 + g, x1, y1 - g], c: [x1, y1 + g, x1, y2 - g], d: [x0 + g, y2, x1 - g, y2], e: [x0, y1 + g, x0, y2 - g], f: [x0, y0 + g, x0, y1 - g], g: [x0 + g, y1, x1 - g, y1] };
    const lit = SEG[ch] || '';
    for (const s in segs) {
      const [ax, ay, bx, by] = segs[s];
      const k1 = (ay - y) / h, k2 = (by - y) / h;
      c.beginPath(); c.moveTo(ax + sk * (1 - k1), ay); c.lineTo(bx + sk * (1 - k2), by);
      const isOn = lit.includes(s);
      if (!isOn && !off) continue;
      c.strokeStyle = isOn ? on : off;
      if (isOn) { c.shadowColor = on; c.shadowBlur = h * .12; } else c.shadowBlur = 0;
      c.stroke();
    }
    px += adv;
  }
  c.restore();
};
K.spark = function (c, H, key, x, y, w, h, max, col, fill) {
  const arr = H[key], N = arr.length, count = Math.min(H.i, N);
  if (count < 2) return;
  c.beginPath();
  for (let k = 0; k < count; k++) {
    const idx = (H.i - count + k) % N, v = arr[(idx + N) % N];
    const px = x + w * (k + N - count) / (N - 1), py = y + h - h * F.clamp(v / max, 0, 1);
    k ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.strokeStyle = col; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
  if (fill) { c.lineTo(x + w, y + h); c.lineTo(x + w * (N - count) / (N - 1), y + h); c.closePath(); c.fillStyle = fill; c.fill(); }
};
K.car = function (c, x, y, s, stroke, fill, lw = 2.2) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(6, 58); c.lineTo(12, 47); c.quadraticCurveTo(24, 41, 58, 38); c.lineTo(90, 21); c.quadraticCurveTo(100, 16, 120, 16);
  c.lineTo(148, 16); c.quadraticCurveTo(163, 17, 176, 29); c.lineTo(192, 38); c.quadraticCurveTo(212, 41, 216, 50); c.lineTo(216, 60); c.lineTo(6, 60); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.strokeStyle = stroke; c.lineWidth = lw / s * 1.2; c.stroke();
  c.beginPath(); c.moveTo(70, 37); c.lineTo(94, 23); c.quadraticCurveTo(101, 19, 118, 19); c.lineTo(146, 19); c.quadraticCurveTo(156, 20, 167, 31); c.lineTo(170, 37); c.closePath(); c.stroke();
  for (const wx of [53, 173]) { c.beginPath(); c.arc(wx, 60, 14, 0, Math.PI * 2); c.fillStyle = fill ? '#111' : 'transparent'; if (fill) c.fill(); c.stroke(); }
  c.restore();
};
K.carRear = function (c, x, y, s, stroke, fill) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-70, 30); c.lineTo(-72, 0); c.quadraticCurveTo(-70, -14, -55, -16); c.lineTo(-40, -42); c.quadraticCurveTo(0, -50, 40, -42);
  c.lineTo(55, -16); c.quadraticCurveTo(70, -14, 72, 0); c.lineTo(70, 30); c.closePath();
  c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 3 / s; c.stroke();
  c.fillStyle = stroke; c.fillRect(-62, 34, 22, 14); c.fillRect(40, 34, 22, 14);
  c.fillStyle = '#ff3b45'; c.fillRect(-64, -8, 20, 8); c.fillRect(44, -8, 20, 8);
  c.restore();
};
K.tempCol = (v, cold, ok, hot) => v == null ? ok : v < 60 ? cold : v < 108 ? ok : hot;
K.stars = function (c, score, x, y, size, on, off) {
  const full = score / 20;
  for (let i = 0; i < 5; i++) {
    const cx = x + (i - 2) * size * 1.15, f = F.clamp(full - i, 0, 1);
    c.save(); c.translate(cx, y); c.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? size * .22 : size * .5, a = (k * 36 - 90) * RAD; k ? c.lineTo(r * Math.cos(a), r * Math.sin(a)) : c.moveTo(r * Math.cos(a), r * Math.sin(a)); }
    c.closePath(); c.fillStyle = off; c.fill();
    if (f > 0) { c.save(); c.clip(); c.fillStyle = on; c.fillRect(-size / 2, -size / 2, size * f, size); c.restore(); }
    c.restore();
  }
};
K.gmeter = function (c, cx, cy, r, gx, gy, col, ring, dot) {
  c.strokeStyle = ring; c.lineWidth = 2;
  for (const k of [1, .66, .33]) { c.beginPath(); c.arc(cx, cy, r * k, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy - r); c.lineTo(cx, cy + r); c.stroke();
  const px = cx + F.clamp(gx, -1, 1) * r, py = cy - F.clamp(gy, -1, 1) * r;
  K.glow(c, dot || col, 14, () => { c.beginPath(); c.arc(px, py, r * .12, 0, Math.PI * 2); c.fillStyle = dot || col; c.fill(); });
};

/* ================= diseños ================= */
const S = F.SKINS = [];
const add = d => S.push(Object.assign({ kind: 'canvas' }, d));

/* --- 2 · Deportivo Rojo --- */
add({ id: 'deportivo', name: 'Deportivo Rojo', bg: '#000',
  back(c, w, h) { c.fillStyle = K.rad(c, w / 2, h * .55, 0, Math.max(w, h) * .65, ['#3a0608', '#140203', '#000']); c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const shift = V.rpm > 6000 && Math.floor(F.t * 8) % 2;
    K.arcG(c, { cx: 800, cy: 330, r: 255, a0: 135, a1: 405, v: V.rpm, max: 8000, w: 30, track: '#2a1214', col: ['#b3141b', '#ff3b2f', '#ff9a3c'], glow: '#ff3020',
      red: { from: 6500, col: '#ff1a1a', r: 280, w: 6 },
      ticks: { every: 500, major: 1000, col: '#a77', mcol: '#fff', r: 232, labels: { r: 190, size: 34, col: '#fff', rcol: '#ff4040', fam: 'Oswald', fmt: v => v / 1000 } } });
    if (shift) { K.arc(c, 800, 330, 295, 135, 405, 'rgba(255,40,40,.8)', 8); }
    K.txt(c, Math.round(V.speed), 800, 318, 170, '#fff', 'center', 700, 'Oswald');
    K.txt(c, 'KM/H', 800, 420, 26, '#ff6b5a', 'center', 600, 'Oswald');
    K.txt(c, `${Math.round(V.rpm / 10) * 10} RPM`, 800, 466, 22, '#aaa', 'center', 500, 'Oswald');
    const tc = K.tempCol(V.coolant, '#5ab0ff', '#ff6b5a', '#ff2020');
    K.bar(c, 150, 150, 24, 330, V.coolant == null ? 0 : (V.coolant - 40) / 90, tc, '#2a1214', 12);
    K.txt(c, 'TEMP', 162, 510, 18, '#a88', 'center', 600, 'Oswald'); K.txt(c, `${n(V.coolant)}°`, 162, 120, 26, '#fff', 'center', 600, 'Oswald');
    K.bar(c, 1426, 150, 24, 330, V.fuel == null ? 0 : V.fuel / 100, V.fuel != null && V.fuel < 15 ? '#ff2020' : '#ff6b5a', '#2a1214', 12);
    K.txt(c, 'GAS', 1438, 510, 18, '#a88', 'center', 600, 'Oswald'); K.txt(c, `${n(V.fuel)}%`, 1438, 120, 26, '#fff', 'center', 600, 'Oswald');
    const L = [['KM/L AHORA', n(V.kml, 1)], ['PROMEDIO', n(V.avg, 1)], ['VIAJE KM', n(V.tripKm, 1)]];
    const R = [['BATERÍA V', n(V.volt, 1)], ['ACELERADOR', n(V.throttle) + '%'], ['AIRE °C', n(V.intake)]];
    L.forEach(([l, v], i) => { K.txt(c, l, 330, 200 + i * 110, 18, '#c66', 'center', 600, 'Oswald'); K.txt(c, v, 330, 240 + i * 110, 42, '#fff', 'center', 600, 'Oswald'); });
    R.forEach(([l, v], i) => { K.txt(c, l, 1270, 200 + i * 110, 18, '#c66', 'center', 600, 'Oswald'); K.txt(c, v, 1270, 240 + i * 110, 42, '#fff', 'center', 600, 'Oswald'); });
    K.txt(c, V.clock, 800, 570, 26, '#ddd', 'center', 500, 'Oswald');
  } });

/* --- familia analógica --- */
function analogSkin(id, name, P) {
  add({ id, name, back: P.back, draw(c, V) {
    const common = { face: P.face, faceGrad: P.faceGrad, bezel: P.bezel, tick: P.tick, label: P.label, needle: P.needle, hub: P.hub, needleGlow: P.glow, fam: P.fam };
    K.analog(c, Object.assign({}, common, { cx: 455, cy: 305, r: 235, v: V.speed, max: 220, every: 10, major: 20, unit: 'km/h',
      inner() {
        K.rr(c, 455 - 70, 305 + 120, 140, 44, 6); c.fillStyle = P.window; c.fill();
        K.txt(c, `${n(V.tripKm, 1)} km`, 455, 305 + 143, 26, P.windowText, 'center', 600, P.digitFam || 'Share Tech Mono');
      } }));
    K.analog(c, Object.assign({}, common, { cx: 1145, cy: 305, r: 235, v: V.rpm, max: 8000, every: 250, major: 1000, fmt: v => v / 1000, unit: 'x1000 rpm',
      red: { from: 6500, col: P.red },
      inner() {
        K.rr(c, 1145 - 70, 305 + 120, 140, 44, 6); c.fillStyle = P.window; c.fill();
        K.txt(c, V.kml == null ? 'Alto' : `${n(V.kml, 1)} km/L`, 1145, 305 + 143, 24, P.windowText, 'center', 600, P.digitFam || 'Share Tech Mono');
      } }));
    const small = Object.assign({}, common, { r: 92, a0: 200, a1: 340, every: 1, major: 1, labels: false });
    K.analog(c, Object.assign({}, small, { cx: 800, cy: 215, v: V.coolant == null ? 0 : V.coolant - 40, max: 90, every: 15, major: 45, red: { from: 72, col: P.red }, unit: 'TEMP', unitY: .45 }));
    K.txt(c, 'C', 800 - 70, 190, 20, P.label, 'center', 700, P.fam); K.txt(c, 'H', 800 + 70, 190, 20, P.red, 'center', 700, P.fam);
    K.analog(c, Object.assign({}, small, { cx: 800, cy: 440, v: V.fuel || 0, max: 100, every: 12.5, major: 50, red: { from: -1, col: 'transparent' }, unit: 'GAS', unitY: .45 }));
    K.txt(c, 'E', 800 - 70, 415, 20, P.red, 'center', 700, P.fam); K.txt(c, 'F', 800 + 70, 415, 20, P.label, 'center', 700, P.fam);
    K.txt(c, V.clock, 800, 70, 30, P.outer, 'center', 600, P.fam);
    K.txt(c, `${n(V.volt, 1)} V`, 800, 575, 24, P.outer, 'center', 600, P.fam);
  } });
}
analogSkin('retro', 'Retro Clásico', {
  back(c, w, h) {
    c.fillStyle = K.pattern(c, 'wood', 256, (t, s) => {
      t.fillStyle = '#5a3418'; t.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) { t.strokeStyle = `rgba(${30 + Math.random() * 40},${12 + Math.random() * 15},4,${.15 + Math.random() * .25})`; t.lineWidth = 1 + Math.random() * 3;
        const y = Math.random() * s; t.beginPath(); t.moveTo(0, y); t.bezierCurveTo(s * .3, y + Math.random() * 14 - 7, s * .6, y + Math.random() * 14 - 7, s, y); t.stroke(); }
    });
    c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, w, h);
  },
  faceGrad: ['#fbf4e2', '#e9dcbc'], bezel: ['#f4f4f4', '#8d8d8d', '#e2e2e2', '#5d5d5d'], tick: '#1b1b1b', label: '#1b1b1b', needle: '#c0281c',
  hub: ['#fff', '#777'], red: '#c0281c', window: '#1a1a1a', windowText: '#f0e6cc', outer: '#f0e0c0', fam: 'Oswald' });
analogSkin('retroNoche', 'Retro Noche', {
  back(c, w, h) {
    c.fillStyle = K.pattern(c, 'leather', 64, (t, s) => { t.fillStyle = '#0c0c0d'; t.fillRect(0, 0, s, s);
      for (let i = 0; i < 260; i++) { t.fillStyle = `rgba(255,255,255,${Math.random() * .04})`; t.fillRect(Math.random() * s, Math.random() * s, 2, 2); } });
    c.fillRect(0, 0, w, h);
  },
  face: '#070707', bezel: ['#3a3a3a', '#0d0d0d', '#2a2a2a', '#050505'], tick: '#ff9a2e', label: '#ffb04d', needle: '#ff5a1f', glow: '#ff5a1f',
  hub: ['#444', '#111'], red: '#ff3a1f', window: '#140b03', windowText: '#ffb04d', outer: '#ff9a2e', fam: 'Oswald' });
analogSkin('british', 'Verde Británico', {
  back(c, w, h) {
    c.fillStyle = K.rad(c, w / 2, h / 2, 0, Math.max(w, h) * .7, ['#1f4a33', '#0f2a1d', '#06150e']); c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(233,201,121,.35)'; c.setLineDash([10, 8]); c.lineWidth = 2; c.strokeRect(14, 14, w - 28, h - 28); c.setLineDash([]);
  },
  faceGrad: ['#f6f0dc', '#e2d6b4'], bezel: ['#e9c979', '#7a5a1a', '#f3dc9c', '#6a4a12'], tick: '#163626', label: '#163626', needle: '#111',
  hub: ['#e9c979', '#6a4a12'], red: '#9a1c1c', window: '#163626', windowText: '#f3dc9c', outer: '#e9c979', fam: 'Oswald' });

/* --- familia minimalista --- */
function minimalSkin(id, name, P) {
  add({ id, name, back(c, w, h) { c.fillStyle = P.bg; c.fillRect(0, 0, w, h); }, draw(c, V) {
    K.txt(c, Math.round(V.speed), 800, 290, 330, P.fg, 'center', 300, 'Saira', 'middle', 'condensed');
    K.txt(c, 'km/h', 800, 450, 30, P.mute, 'center', 400);
    const f = F.clamp(V.rpm / 8000, 0, 1);
    c.fillStyle = P.track; c.fillRect(200, 540, 1200, 6);
    c.fillStyle = V.rpm > 6000 ? P.red : P.acc; c.fillRect(200, 540, 1200 * f, 6);
    for (let i = 0; i <= 8; i++) K.txt(c, String(i), 200 + 150 * i, 570, 16, i >= 7 ? P.red : P.mute, 'center', 500);
    K.txt(c, V.clock, 120, 70, 28, P.fg, 'left', 400);
    K.txt(c, V.ambient == null ? '' : `${n(V.ambient, 0)}°`, 1480, 70, 28, P.fg, 'right', 400);
    K.txt(c, V.kml == null ? '—' : n(V.kml, 1), 120, 470, 44, P.fg, 'left', 400); K.txt(c, 'km/L', 120, 505, 16, P.mute, 'left', 500);
    K.txt(c, `${n(V.fuel)}%`, 1480, 470, 44, V.fuel != null && V.fuel < 15 ? P.red : P.fg, 'right', 400); K.txt(c, 'gasolina', 1480, 505, 16, P.mute, 'right', 500);
    K.txt(c, `${n(V.coolant)}°`, 120, 300, 32, K.tempCol(V.coolant, P.mute, P.fg, P.red), 'left', 400); K.txt(c, 'motor', 120, 332, 16, P.mute, 'left', 500);
    K.txt(c, `${n(V.tripKm, 1)}`, 1480, 300, 32, P.fg, 'right', 400); K.txt(c, 'km viaje', 1480, 332, 16, P.mute, 'right', 500);
  } });
}
minimalSkin('minimal', 'Minimal Negro', { bg: '#000', fg: '#f4f4f4', mute: '#777', track: '#222', acc: '#f4f4f4', red: '#ff453a' });
minimalSkin('minimalBlanco', 'Minimal Blanco', { bg: '#f3f3f0', fg: '#141414', mute: '#8a8a86', track: '#ddd', acc: '#1f6bff', red: '#e5352b' });

/* --- Eléctrico Claro --- */
add({ id: 'electrico', name: 'Eléctrico Claro',
  back(c, w, h) { c.fillStyle = K.lin(c, 0, 0, 0, h, ['#eef1f5', '#d9dee6']); c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const ink = '#18202b', mute = '#7b8594', blue = '#2f6bff';
    K.txt(c, V.clock, 800, 50, 24, ink, 'center', 600);
    K.txt(c, Math.round(V.speed), 300, 230, 190, ink, 'center', 500, 'Saira', 'middle', 'semi-condensed');
    K.txt(c, 'km/h', 300, 330, 24, mute, 'center', 500);
    // medidor de potencia: carga a la derecha, frenado a la izquierda
    const pw = F.clamp(V.load / 100, 0, 1), rg = F.clamp(-V.gLong / .5, 0, 1);
    K.rr(c, 100, 390, 400, 14, 7); c.fillStyle = '#c9d0da'; c.fill();
    if (pw > 0) { K.rr(c, 300, 390, 200 * pw, 14, 7); c.fillStyle = blue; c.fill(); }
    if (rg > 0) { K.rr(c, 300 - 200 * rg, 390, 200 * rg, 14, 7); c.fillStyle = '#20b26b'; c.fill(); }
    c.fillStyle = ink; c.fillRect(298, 382, 4, 30);
    K.txt(c, 'FRENO', 100, 430, 14, mute, 'left', 600); K.txt(c, 'POTENCIA', 500, 430, 14, mute, 'right', 600);
    // camino y auto
    c.save(); c.beginPath(); c.moveTo(640, 520); c.lineTo(960, 520); c.lineTo(840, 250); c.lineTo(760, 250); c.closePath(); c.fillStyle = '#c3cad4'; c.fill();
    const off = (F.trip.km * 1000 / 6) % 1;
    c.strokeStyle = '#fff'; c.lineWidth = 4;
    for (let i = 0; i < 6; i++) { const k = (i + off) / 6, y0 = 250 + 270 * k * k, y1 = 250 + 270 * Math.min(1, (k + .07) ** 2); c.beginPath(); c.moveTo(800, y0); c.lineTo(800, y1); c.stroke(); }
    c.restore();
    c.save(); c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 30; c.shadowOffsetY = 10; K.car(c, 680, 370, 1.1, '#5d6878', '#f8f9fb'); c.restore();
    // tarjetas
    const cards = [['Viaje', `${n(V.tripKm, 1)} km`], ['Consumo', V.kml == null ? 'Detenido' : `${n(V.kml, 1)} km/L`], ['Batería', `${n(V.volt, 1)} V`], ['Motor', `${n(V.coolant)} °C`]];
    cards.forEach(([l, v], i) => {
      const x = 1080 + (i % 2) * 220, y = 120 + Math.floor(i / 2) * 150;
      c.save(); c.shadowColor = 'rgba(30,40,60,.12)'; c.shadowBlur = 20; K.rr(c, x, y, 200, 125, 18); c.fillStyle = '#fff'; c.fill(); c.restore();
      K.txt(c, l, x + 20, y + 35, 18, mute, 'left', 600); K.txt(c, v, x + 20, y + 82, 32, ink, 'left', 600);
    });
    // "batería" = gasolina
    K.rr(c, 1080, 450, 420, 40, 20); c.fillStyle = '#c9d0da'; c.fill();
    if (V.fuel != null) { K.rr(c, 1080, 450, 420 * V.fuel / 100, 40, 20); c.fillStyle = V.fuel < 15 ? '#e5352b' : '#20b26b'; c.fill(); }
    K.txt(c, `${n(V.fuel)} %`, 1100, 470, 20, '#fff', 'left', 700);
    K.txt(c, `Autonomía ${n(V.range)} km`, 1500, 525, 22, ink, 'right', 600);
  } });

/* --- Carreras LED --- */
add({ id: 'carreras', name: 'Carreras LED',
  back(c, w, h) { c.fillStyle = '#060708'; c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const f = F.clamp((V.rpm - 2000) / (6300 - 2000), 0, 1), flash = V.rpm > 6300 && Math.floor(F.t * 10) % 2;
    K.leds(c, 260, 40, 1080, 46, 16, flash ? 1 : f, (k, i) => flash ? '#3a7bff' : i < 6 ? '#21e05a' : i < 11 ? '#ffd21f' : '#ff2a2a', '#16181b', 10, true);
    K.txt(c, Math.round(V.speed), 800, 300, 230, '#fff', 'center', 700, 'Orbitron');
    K.txt(c, 'KM/H', 800, 430, 26, '#888', 'center', 700, 'Orbitron');
    K.txt(c, Math.round(V.rpm / 10) * 10, 250, 260, 70, V.rpm > 6000 ? '#ff2a2a' : '#ffd21f', 'center', 700, 'Orbitron');
    K.txt(c, 'RPM', 250, 320, 22, '#888', 'center', 700, 'Orbitron');
    const P = V.perf;
    K.txt(c, '0-100', 1350, 200, 22, '#888', 'center', 700, 'Orbitron');
    K.txt(c, P.c100 ? P.c100.toFixed(2) + 's' : '--.--', 1350, 245, 46, '#21e05a', 'center', 700, 'Orbitron');
    K.txt(c, '¼ MILLA', 1350, 310, 22, '#888', 'center', 700, 'Orbitron');
    K.txt(c, P.qm ? P.qm.toFixed(2) + 's' : '--.--', 1350, 355, 46, '#21e05a', 'center', 700, 'Orbitron');
    K.txt(c, 'ACEL', 300, 470, 18, '#888', 'left', 700, 'Orbitron'); K.bar(c, 300, 490, 450, 26, V.throttle / 100, '#21e05a', '#16181b', 4);
    K.txt(c, 'FRENO', 850, 470, 18, '#888', 'left', 700, 'Orbitron'); K.bar(c, 850, 490, 450, 26, -V.gLong / .6, '#ff2a2a', '#16181b', 4);
    K.txt(c, `AGUA ${n(V.coolant)}°`, 300, 570, 22, K.tempCol(V.coolant, '#5ab0ff', '#ddd', '#ff2a2a'), 'left', 700, 'Orbitron');
    K.txt(c, `GAS ${n(V.fuel)}%`, 1300, 570, 22, '#ddd', 'right', 700, 'Orbitron');
    K.txt(c, `G ${n(V.gLong, 2)}`, 800, 570, 22, '#ddd', 'center', 700, 'Orbitron');
  } });

/* --- Telemetría --- */
add({ id: 'telemetria', name: 'Telemetría',
  back(c, w, h) { c.fillStyle = '#0c1016'; c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const x = 70, y = 90, w = 1060, h = 440;
    K.txt(c, 'TELEMETRÍA · ÚLTIMOS 60 s', x, 50, 22, '#8b98ab', 'left', 700);
    c.strokeStyle = '#1d2632'; c.lineWidth = 1;
    for (let i = 0; i <= 6; i++) { c.beginPath(); c.moveTo(x + w * i / 6, y); c.lineTo(x + w * i / 6, y + h); c.stroke(); }
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(x, y + h * i / 4); c.lineTo(x + w, y + h * i / 4); c.stroke(); }
    for (let i = 0; i <= 6; i++) K.txt(c, `-${60 - i * 10}s`, x + w * i / 6, y + h + 22, 14, '#56627a', 'center', 500);
    K.spark(c, V.hist, 'thr', x, y, w, h, 100, '#3ddc84', 'rgba(61,220,132,.08)');
    K.spark(c, V.hist, 'rpm', x, y, w, h, 8000, '#ff9f43');
    K.spark(c, V.hist, 'speed', x, y, w, h, 200, '#39c6ff');
    const rows = [['VELOCIDAD', Math.round(V.speed), 'km/h', '#39c6ff'], ['RPM', Math.round(V.rpm / 10) * 10, '', '#ff9f43'], ['ACELERADOR', Math.round(V.throttle), '%', '#3ddc84']];
    rows.forEach(([l, v, u, col], i) => {
      const yy = 110 + i * 105; c.fillStyle = col; c.fillRect(1180, yy - 6, 6, 70);
      K.txt(c, l, 1205, yy + 6, 18, '#8b98ab', 'left', 700); K.txt(c, `${v} ${u}`, 1205, yy + 45, 46, '#e8eef7', 'left', 700);
    });
    K.gmeter(c, 1330, 470, 70, V.gLat, V.gLong, '#39c6ff', '#253041', '#ff4d6d');
    K.txt(c, `${n(V.gLong, 2)} G`, 1450, 470, 22, '#e8eef7', 'left', 700);
  } });

/* --- Neón Synthwave --- */
add({ id: 'neon', name: 'Neón Synthwave',
  back(c, w, h) { c.fillStyle = K.lin(c, 0, 0, 0, h, ['#12002b', '#3b0a52', '#5c0f5a']); c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const hz = 360;
    // sol
    c.save(); c.beginPath(); c.arc(800, hz, 200, Math.PI, 0); c.closePath(); c.clip();
    c.fillStyle = K.lin(c, 0, hz - 200, 0, hz, ['#ffe36e', '#ff7ab6', '#c22a9a']); c.fillRect(600, hz - 200, 400, 200);
    c.fillStyle = '#3b0a52'; for (let i = 0; i < 7; i++) c.fillRect(600, hz - 90 + i * 14, 400, 3 + i * 1.2);
    c.restore();
    // piso
    c.fillStyle = '#14001f'; c.fillRect(0, hz, 1600, 620 - hz);
    c.strokeStyle = '#ff2fd6'; c.lineWidth = 2; c.shadowColor = '#ff2fd6'; c.shadowBlur = 10;
    for (let i = -14; i <= 14; i++) { c.beginPath(); c.moveTo(800 + i * 18, hz); c.lineTo(800 + i * 150, 640); c.stroke(); }
    const off = (F.trip.km * 1000 / 8) % 1;
    for (let i = 0; i < 9; i++) { const k = (i + off) / 9, y = hz + (640 - hz) * k * k; c.beginPath(); c.moveTo(0, y); c.lineTo(1600, y); c.stroke(); }
    c.shadowBlur = 0;
    // indicadores
    K.arcG(c, { cx: 330, cy: 320, r: 220, a0: 120, a1: 330, v: V.speed, max: 220, w: 16, track: 'rgba(0,255,255,.12)', col: ['#00e5ff', '#9d7bff'], glow: '#00e5ff',
      ticks: { every: 20, major: 40, col: '#5ff', r: 200, labels: { r: 165, size: 22, col: '#bff', fam: 'Orbitron' } } });
    K.arcG(c, { cx: 1270, cy: 320, r: 220, a0: 60, a1: -150, v: V.rpm, max: 8000, w: 16, track: 'rgba(255,47,214,.12)', col: ['#ff2fd6', '#ffe36e'], glow: '#ff2fd6',
      red: { from: 6500, col: '#ff3b3b', r: 238, w: 5 },
      ticks: { every: 1000, major: 1000, col: '#f8f', r: 200, labels: { r: 165, size: 22, col: '#fcf', fam: 'Orbitron', fmt: v => v / 1000 } } });
    c.save(); c.font = K.font(150, 900, 'Orbitron'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = K.lin(c, 0, 160, 0, 300, ['#ffffff', '#9ef6ff', '#ff7ad9']); c.shadowColor = '#00e5ff'; c.shadowBlur = 20;
    c.fillText(Math.round(V.speed), 800, 220); c.restore();
    K.txt(c, 'KM/H', 800, 315, 22, '#bff', 'center', 700, 'Orbitron');
    K.txt(c, `${Math.round(V.rpm / 10) * 10} RPM`, 1270, 330, 30, '#fcf', 'center', 700, 'Orbitron');
    K.txt(c, `${n(V.kml, 1)} KM/L`, 330, 330, 30, '#bff', 'center', 700, 'Orbitron');
    K.txt(c, V.clock, 800, 50, 26, '#fff', 'center', 700, 'Orbitron');
    K.txt(c, `MOTOR ${n(V.coolant)}°  ·  GAS ${n(V.fuel)}%  ·  ${n(V.tripKm, 1)} KM`, 800, 585, 22, '#ffe36e', 'center', 700, 'Orbitron');
  } });

/* --- Neón Cian --- */
add({ id: 'cyber', name: 'Neón Cian',
  back(c, w, h) { c.fillStyle = K.rad(c, w / 2, h / 2, 0, Math.max(w, h) * .7, ['#02141c', '#01070b']); c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const cy = '#29f3ff', dim = 'rgba(41,243,255,.18)';
    c.strokeStyle = cy; c.lineWidth = 2;
    const frame = (x, y, w, h, k) => { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x, y + h); c.lineTo(x, y + k); c.closePath(); c.stroke(); };
    K.glow(c, cy, 8, () => { frame(40, 40, 360, 540, 30); frame(1200, 40, 360, 540, 30); });
    // arco segmentado de rpm
    const segs = 44, lit = Math.round(F.clamp(V.rpm / 8000, 0, 1) * segs);
    for (let i = 0; i < segs; i++) {
      const a = 150 + i * (240 / segs), on = i < lit, red = i >= segs * 6500 / 8000;
      const col = on ? (red ? '#ff3b6b' : cy) : dim;
      const draw = () => K.arc(c, 800, 340, 250, a, a + 240 / segs - 1.4, col, 34);
      if (on) K.glow(c, col, 12, draw); else draw();
    }
    K.txt(c, Math.round(V.speed), 800, 330, 170, '#eaffff', 'center', 400, 'Share Tech Mono');
    K.txt(c, 'KM/H', 800, 430, 26, cy, 'center', 400, 'Share Tech Mono');
    K.txt(c, `${String(Math.round(V.rpm)).padStart(4, '0')} RPM`, 800, 490, 28, cy, 'center', 400, 'Share Tech Mono');
    const rows = [['MOTOR', `${n(V.coolant)} °C`], ['BATERIA', `${n(V.volt, 1)} V`], ['AIRE', `${n(V.intake)} °C`], ['CARGA', `${n(V.load)} %`], ['ACEL', `${n(V.throttle)} %`], ['GAS', `${n(V.fuel)} %`]];
    rows.forEach(([l, v], i) => { K.txt(c, `> ${l}`, 70, 100 + i * 78, 24, cy, 'left', 400, 'Share Tech Mono'); K.txt(c, v, 370, 100 + i * 78, 30, '#eaffff', 'right', 400, 'Share Tech Mono'); });
    K.txt(c, 'FUERZA G', 1380, 90, 24, cy, 'center', 400, 'Share Tech Mono');
    K.gmeter(c, 1380, 250, 120, V.gLat, V.gLong, cy, dim, '#ff3b6b');
    K.txt(c, `LONG ${n(V.gLong, 2)}  LAT ${n(V.gLat, 2)}`, 1380, 410, 22, '#eaffff', 'center', 400, 'Share Tech Mono');
    K.txt(c, `VIAJE ${n(V.tripKm, 1)} KM`, 1380, 470, 24, cy, 'center', 400, 'Share Tech Mono');
    K.txt(c, `KM/L ${n(V.kml, 1)}`, 1380, 520, 24, cy, 'center', 400, 'Share Tech Mono');
    K.txt(c, `[ ${V.clock} ]`, 800, 50, 24, cy, 'center', 400, 'Share Tech Mono');
  } });

/* --- Rosso --- */
add({ id: 'rosso', name: 'Rosso',
  back(c, w, h) {
    c.fillStyle = K.rad(c, w / 2, h * .4, 0, Math.max(w, h) * .75, ['#7a0909', '#3a0303', '#120000']); c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 3; for (let x = -h; x < w; x += 18) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.stroke(); }
  },
  draw(c, V) {
    const ring = ['#d9d9d9', '#555', '#bdbdbd', '#333'];
    K.analog(c, { cx: 800, cy: 310, r: 270, v: V.rpm, max: 9000, every: 250, major: 1000, fmt: v => v / 1000, face: '#0b0b0b', bezel: ring, tick: '#fff', label: '#fff', needle: '#ff2a1a',
      needleGlow: '#ff2a1a', hub: ['#666', '#111'], red: { from: 6500, col: '#e01010' }, unit: 'RPM x1000', unitY: .2,
      inner() { K.txt(c, Math.round(V.speed), 800, 310 + 135, 92, '#fff', 'center', 700, 'Oswald'); K.txt(c, 'km/h', 800, 310 + 195, 22, '#bbb', 'center', 600, 'Oswald'); } });
    const small = { r: 150, a0: 150, a1: 390, face: '#0b0b0b', bezel: ring, tick: '#fff', label: '#fff', needle: '#ff2a1a', hub: ['#666', '#111'], fam: 'Oswald' };
    K.analog(c, Object.assign({}, small, { cx: 290, cy: 330, v: V.coolant == null ? 0 : V.coolant - 40, max: 90, every: 10, major: 30, fmt: v => v + 40, red: { from: 70, col: '#e01010' }, unit: '°C MOTOR' }));
    K.analog(c, Object.assign({}, small, { cx: 1310, cy: 330, v: V.fuel || 0, max: 100, every: 12.5, major: 25, fmt: v => ['E', '¼', '½', '¾', 'F'][v / 25], unit: 'GASOLINA' }));
    K.txt(c, V.clock, 290, 560, 28, '#fff', 'center', 600, 'Oswald');
    K.txt(c, `${n(V.kml, 1)} km/L`, 1310, 560, 28, '#fff', 'center', 600, 'Oswald');
  } });

/* --- Fibra de Carbono --- */
add({ id: 'carbono', name: 'Fibra de Carbono',
  back(c, w, h) {
    c.fillStyle = K.pattern(c, 'carbon', 24, (t, s) => {
      t.fillStyle = '#121314'; t.fillRect(0, 0, s, s);
      const g1 = t.createLinearGradient(0, 0, s / 2, s / 2); g1.addColorStop(0, '#2a2c2f'); g1.addColorStop(1, '#151617');
      t.fillStyle = g1; t.fillRect(0, 0, s / 2, s / 2); t.fillRect(s / 2, s / 2, s / 2, s / 2);
      const g2 = t.createLinearGradient(s / 2, 0, s, s / 2); g2.addColorStop(0, '#1b1c1e'); g2.addColorStop(1, '#2e3033');
      t.fillStyle = g2; t.fillRect(s / 2, 0, s / 2, s / 2); t.fillRect(0, s / 2, s / 2, s / 2);
    });
    c.fillRect(0, 0, w, h); c.fillStyle = K.rad(c, w / 2, h / 2, 0, Math.max(w, h) * .7, ['rgba(0,0,0,0)', 'rgba(0,0,0,.7)']); c.fillRect(0, 0, w, h);
  },
  draw(c, V) {
    const metal = (cx, cy, r) => { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.strokeStyle = K.lin(c, cx - r, cy - r, cx + r, cy + r, ['#f2f2f2', '#6d6d6d', '#d0d0d0', '#4a4a4a']); c.lineWidth = 10; c.stroke(); };
    for (const [cx, v, max, lbl, red] of [[440, V.speed, 220, 'km/h'], [1160, V.rpm, 8000, 'rpm', true]]) {
      metal(cx, 310, 250);
      c.beginPath(); c.arc(cx, 310, 244, 0, Math.PI * 2); c.fillStyle = 'rgba(8,8,9,.85)'; c.fill();
      K.arcG(c, { cx, cy: 310, r: 205, a0: 135, a1: 405, v, max, w: 22, track: '#26282b', col: red && v > 6000 ? '#ff2a2a' : ['#bfc5cc', '#ffffff'],
        red: red ? { from: 6500, col: '#ff2a2a', r: 228, w: 6 } : null,
        ticks: { every: red ? 500 : 10, major: red ? 1000 : 20, col: '#666', mcol: '#ddd', r: 186, labels: { r: 150, size: 24, col: '#ddd', fmt: x => red ? x / 1000 : Math.round(x) } } });
      K.txt(c, Math.round(red ? v / 10 : v) * (red ? 10 : 1), cx, 300, red ? 64 : 96, '#fff', 'center', 700);
      K.txt(c, lbl, cx, 370, 22, '#ff2a2a', 'center', 700);
    }
    const rows = [[V.clock, ''], [`${n(V.coolant)}°`, 'MOTOR'], [`${n(V.fuel)}%`, 'GASOLINA'], [n(V.kml, 1), 'KM/L'], [`${n(V.volt, 1)}`, 'VOLTS']];
    rows.forEach(([v, l], i) => {
      K.txt(c, v, 800, 110 + i * 100, 38, '#fff', 'center', 600); if (l) K.txt(c, l, 800, 142 + i * 100, 14, '#ff2a2a', 'center', 700);
      if (i) { c.fillStyle = '#333'; c.fillRect(740, 62 + i * 100, 120, 1); }
    });
  } });

/* --- Cabina de Avión --- */
add({ id: 'cabina', name: 'Cabina de Avión',
  back(c, w, h) { c.fillStyle = K.lin(c, 0, 0, 0, h, ['#2a2e33', '#1a1d20']); c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const cells = [[230, 170], [800, 170], [1370, 170], [230, 450], [800, 450], [1370, 450]], R = 118;
    const box = (x, y) => {
      K.rr(c, x - 140, y - 135, 280, 270, 26); c.fillStyle = '#0d0e10'; c.fill(); c.strokeStyle = '#3c4148'; c.lineWidth = 3; c.stroke();
      for (const [sx, sy] of [[-120, -115], [120, -115], [-120, 115], [120, 115]]) { c.beginPath(); c.arc(x + sx, y + sy, 6, 0, Math.PI * 2); c.fillStyle = '#5b626b'; c.fill(); }
    };
    cells.forEach(([x, y]) => box(x, y));
    const inst = { r: R, face: '#111', tick: '#eee', label: '#eee', needle: '#fff', hub: ['#888', '#222'], fam: 'Saira' };
    K.analog(c, Object.assign({}, inst, { cx: 230, cy: 170, v: V.speed, max: 220, every: 10, major: 40, unit: 'VEL km/h', a0: 90, a1: 420 }));
    // horizonte artificial
    c.save(); c.beginPath(); c.arc(800, 170, R, 0, Math.PI * 2); c.clip();
    c.translate(800, 170); c.rotate(-V.roll * RAD); const py = F.clamp(V.pitch, -30, 30) * 3;
    c.fillStyle = '#2f7fd8'; c.fillRect(-200, -260 + py, 400, 260); c.fillStyle = '#8a5a2b'; c.fillRect(-200, py, 400, 260);
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-200, py); c.lineTo(200, py); c.stroke();
    for (const d of [-20, -10, 10, 20]) { c.beginPath(); c.moveTo(-25, py - d * 3); c.lineTo(25, py - d * 3); c.stroke(); }
    c.restore();
    c.strokeStyle = '#ffcf33'; c.lineWidth = 5; c.beginPath(); c.moveTo(740, 170); c.lineTo(780, 170); c.lineTo(790, 182); c.moveTo(860, 170); c.lineTo(820, 170); c.lineTo(810, 182); c.stroke();
    K.txt(c, `INCL ${n(V.pitch)}° · LAT ${n(V.roll)}°`, 800, 295, 15, '#aab', 'center', 600);
    K.analog(c, Object.assign({}, inst, { cx: 1370, cy: 170, v: V.rpm, max: 8000, every: 500, major: 1000, fmt: v => v / 1000, unit: 'RPM x1000', red: { from: 6500, col: '#e33' } }));
    // coordinador de giro (fuerza G lateral)
    c.beginPath(); c.arc(230, 450, R, 0, Math.PI * 2); c.fillStyle = '#111'; c.fill();
    K.rr(c, 130, 470, 200, 40, 20); c.fillStyle = '#22252a'; c.fill(); c.strokeStyle = '#555'; c.stroke();
    c.beginPath(); c.arc(230 + F.clamp(V.gLat, -1, 1) * 80, 490, 17, 0, Math.PI * 2); c.fillStyle = '#eee'; c.fill();
    c.strokeStyle = '#eee'; c.lineWidth = 2; c.beginPath(); c.moveTo(208, 470); c.lineTo(208, 510); c.moveTo(252, 470); c.lineTo(252, 510); c.stroke();
    K.txt(c, `G ${n(V.gLong, 2)}`, 230, 410, 36, '#fff', 'center', 600); K.txt(c, 'FUERZA G', 230, 370, 16, '#aab', 'center', 600);
    // brújula
    c.save(); c.translate(800, 450); c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = '#111'; c.fill();
    c.rotate(-(V.heading || 0) * RAD);
    for (let d = 0; d < 360; d += 10) { const big = d % 30 === 0; c.save(); c.rotate(d * RAD); c.strokeStyle = '#eee'; c.lineWidth = big ? 3 : 1.5; c.beginPath(); c.moveTo(0, -R + 6); c.lineTo(0, -R + (big ? 24 : 15)); c.stroke();
      if (d % 90 === 0) K.txt(c, ['N', 'E', 'S', 'O'][d / 90], 0, -R + 44, 24, d ? '#eee' : '#ff5a4a', 'center', 700); c.restore(); }
    c.restore();
    c.fillStyle = '#ffcf33'; c.beginPath(); c.moveTo(800, 360); c.lineTo(788, 384); c.lineTo(812, 384); c.closePath(); c.fill();
    K.txt(c, V.heading == null ? '---°' : `${String(Math.round(V.heading)).padStart(3, '0')}°`, 800, 450, 30, '#fff', 'center', 600);
    // motor
    const bars = [['TEMP', V.coolant == null ? 0 : (V.coolant - 40) / 90, n(V.coolant)], ['GAS', (V.fuel || 0) / 100, n(V.fuel)], ['VOLT', V.volt == null ? 0 : (V.volt - 11) / 4, n(V.volt, 1)]];
    bars.forEach(([l, f, v], i) => {
      const x = 1290 + i * 80;
      K.bar(c, x - 12, 360, 24, 150, f, i === 0 && f > .75 ? '#e33' : '#3ddc84', '#22252a', 4);
      K.txt(c, l, x, 535, 15, '#aab', 'center', 600); K.txt(c, v, x, 340, 18, '#fff', 'center', 600);
    });
  } });

/* --- LCD 80s --- */
add({ id: 'lcd', name: 'LCD 80s',
  back(c, w, h) { c.fillStyle = '#050805'; c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const on = '#7dff8a', off = 'rgba(125,255,138,.07)';
    K.rr(c, 30, 30, 1540, 560, 24); c.fillStyle = '#081108'; c.fill(); c.strokeStyle = '#1f3a21'; c.lineWidth = 4; c.stroke();
    K.seg7(c, String(Math.round(V.speed)).padStart(3, ' '), 1000, 110, 250, on, off, 'right');
    K.txt(c, 'KM/H', 1030, 340, 30, on, 'left', 400, 'Share Tech Mono');
    const segs = 40, f = F.clamp(V.rpm / 8000, 0, 1), lit = Math.round(f * segs);
    for (let i = 0; i < segs; i++) {
      const x = 90 + i * 35, h = 30 + i * 1.6, col = i >= 33 ? '#ff4a3a' : i >= 26 ? '#ffd23a' : on;
      c.fillStyle = i < lit ? col : off; if (i < lit) { c.shadowColor = col; c.shadowBlur = 8; }
      c.fillRect(x, 470 - h, 26, h); c.shadowBlur = 0;
    }
    K.txt(c, 'RPM x1000', 90, 500, 20, on, 'left', 400, 'Share Tech Mono');
    for (let i = 0; i <= 8; i++) K.txt(c, String(i), 90 + i * 175, 525, 18, on, 'center', 400, 'Share Tech Mono');
    const mini = [['MOTOR', V.coolant == null ? '---' : String(Math.round(V.coolant))], ['GAS %', V.fuel == null ? '---' : String(Math.round(V.fuel))], ['VOLT', V.volt == null ? '--.-' : V.volt.toFixed(1)], ['KM/L', V.kml == null ? '--.-' : V.kml.toFixed(1)]];
    mini.forEach(([l, v], i) => {
      const x = 1160 + (i % 2) * 200, y = 90 + Math.floor(i / 2) * 150;
      K.txt(c, l, x, y, 20, on, 'left', 400, 'Share Tech Mono'); K.seg7(c, v, x + 170, y + 25, 70, on, off, 'right');
    });
    K.txt(c, V.clock, 90, 80, 30, on, 'left', 400, 'Share Tech Mono');
    K.txt(c, `TRIP ${n(V.tripKm, 1)} KM`, 90, 130, 24, on, 'left', 400, 'Share Tech Mono');
    c.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 30; y < 590; y += 4) c.fillRect(30, y, 1540, 1.5);
  } });

/* --- Terminal --- */
add({ id: 'terminal', name: 'Terminal',
  back(c, w, h) { c.fillStyle = '#020502'; c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const g = '#39ff6a', fs = 30, lh = 48;
    const bar = (f, len = 22) => { const k = Math.round(F.clamp(f, 0, 1) * len); return '[' + '#'.repeat(k) + '·'.repeat(len - k) + ']'; };
    const pad = (s, l) => (s + '').padStart(l, ' ');
    const lines = [
      `FORTE-OS 1.0   ${V.clock}   OBD: ${V.sim ? 'SIMULACIÓN' : 'CONECTADO'}`,
      '',
      `> VELOCIDAD ... ${pad(Math.round(V.speed), 4)} km/h  ${bar(V.speed / 200)}`,
      `> RPM ......... ${pad(Math.round(V.rpm), 4)}       ${bar(V.rpm / 8000)}`,
      `> ACELERADOR .. ${pad(Math.round(V.throttle), 4)} %     ${bar(V.throttle / 100)}`,
      `> MOTOR ....... ${pad(n(V.coolant), 4)} °C    ${bar(V.coolant == null ? 0 : (V.coolant - 40) / 90)}`,
      `> GASOLINA .... ${pad(n(V.fuel), 4)} %     ${bar((V.fuel || 0) / 100)}`,
      `> BATERÍA ..... ${pad(n(V.volt, 1), 4)} V     KM/L ${n(V.kml, 1)}   PROM ${n(V.avg, 1)}`,
      `> VIAJE ....... ${pad(n(V.tripKm, 1), 6)} km   CALIF ${V.score}/100`,
    ];
    c.save(); c.shadowColor = g; c.shadowBlur = 8;
    lines.forEach((l, i) => K.txt(c, l, 70, 70 + i * lh, fs, g, 'left', 400, 'Share Tech Mono'));
    if (Math.floor(F.t * 2) % 2) { c.fillStyle = g; c.fillRect(70, 70 + lines.length * lh - 16, 18, 32); }
    c.restore();
    c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < 620; y += 4) c.fillRect(0, y, 1600, 1.5);
  } });

/* --- Eco --- */
add({ id: 'eco', name: 'Eco',
  back(c, w, h) { c.fillStyle = K.lin(c, 0, 0, w, h, ['#0d2a21', '#14402f', '#0b231b']); c.fillRect(0, 0, w, h); },
  draw(c, V) {
    const kml = V.kml == null ? 0 : V.kml;
    const col = kml >= 18 ? '#5bea8c' : kml >= 11 ? '#f6d55c' : '#ff7a5c';
    K.arcG(c, { cx: 800, cy: 360, r: 250, a0: 180, a1: 360, v: kml, max: 30, w: 34, track: 'rgba(255,255,255,.08)', col: ['#ff7a5c', '#f6d55c', '#5bea8c'], cap: 'round',
      ticks: { every: 5, major: 10, col: 'rgba(255,255,255,.3)', mcol: '#cfe', r: 220, labels: { r: 190, size: 22, col: '#cfe' } } });
    K.txt(c, V.kml == null ? 'Detenido' : kml.toFixed(1), 800, 300, V.kml == null ? 70 : 130, col, 'center', 700);
    K.txt(c, 'km/L ahora', 800, 390, 24, '#cfe', 'center', 500);
    // hoja
    c.save(); c.translate(800, 120); c.rotate(-.5); c.beginPath(); c.moveTo(0, 30); c.quadraticCurveTo(-34, 0, 0, -36); c.quadraticCurveTo(34, 0, 0, 30); c.fillStyle = col; c.fill();
    c.strokeStyle = '#0d2a21'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 30); c.lineTo(0, -26); c.stroke(); c.restore();
    K.txt(c, Math.round(V.speed), 230, 280, 110, '#fff', 'center', 600); K.txt(c, 'km/h', 230, 350, 22, '#cfe', 'center', 500);
    K.txt(c, 'CALIFICACIÓN', 1370, 200, 20, '#cfe', 'center', 600); K.txt(c, String(V.score), 1370, 270, 90, '#fff', 'center', 700);
    K.stars(c, V.score, 1370, 350, 40, '#5bea8c', 'rgba(255,255,255,.15)');
    const tip = V.throttle > 60 ? 'Acelera más suave' : V.rpm > 3200 ? 'Baja las revoluciones' : V.gLong < -.3 ? 'Anticipa el frenado' : V.speed > 110 ? 'A menos velocidad gastas menos' : 'Buen manejo';
    K.txt(c, tip, 800, 470, 30, '#fff', 'center', 600);
    K.txt(c, `Promedio ${n(V.avg, 1)} km/L   ·   ${n(V.litros, 2)} L   ·   $${n(V.gasto, 2)}   ·   ${n(V.tripKm, 1)} km`, 800, 560, 22, '#cfe', 'center', 500);
  } });

/* --- Todoterreno --- */
add({ id: 'todoterreno', name: 'Todoterreno',
  back(c, w, h) {
    c.fillStyle = '#1d1f17'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(190,170,110,.08)'; c.lineWidth = 2;
    for (let i = 1; i < 14; i++) { c.beginPath(); c.ellipse(w * .3, h * .7, i * 60, i * 36, .3, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(w * .85, h * .2, i * 40, i * 28, -.4, 0, Math.PI * 2); c.stroke(); }
  },
  draw(c, V) {
    const sand = '#e2cf98', dark = '#11130d';
    const incl = (cx, ang, side) => {
      c.beginPath(); c.arc(cx, 330, 190, 0, Math.PI * 2); c.fillStyle = dark; c.fill(); c.strokeStyle = sand; c.lineWidth = 4; c.stroke();
      for (let d = -40; d <= 40; d += 10) { const a = (d - 90) * RAD; c.beginPath(); c.moveTo(cx + 190 * Math.cos(a), 330 + 190 * Math.sin(a)); c.lineTo(cx + 168 * Math.cos(a), 330 + 168 * Math.sin(a)); c.strokeStyle = Math.abs(d) >= 30 ? '#ff6a3d' : sand; c.lineWidth = 3; c.stroke(); }
      c.save(); c.translate(cx, 330); c.rotate(F.clamp(ang, -45, 45) * RAD);
      c.strokeStyle = 'rgba(226,207,152,.4)'; c.beginPath(); c.moveTo(-170, 60); c.lineTo(170, 60); c.stroke();
      if (side) K.car(c, -110, -10, 1.0, sand, '#2b2e22'); else K.carRear(c, 0, 10, 1.3, sand, '#2b2e22');
      c.restore();
      K.txt(c, `${n(Math.abs(ang))}°`, cx, 560, 46, Math.abs(ang) >= 30 ? '#ff6a3d' : '#fff', 'center', 700);
      K.txt(c, side ? 'INCLINACIÓN' : 'LATERAL', cx, 108, 20, sand, 'center', 700);
    };
    incl(290, V.pitch, true); incl(1310, V.roll, false);
    // rumbo
    c.save(); K.rr(c, 560, 40, 480, 70, 10); c.fillStyle = dark; c.fill(); c.clip();
    const hd = V.heading || 0;
    for (let d = -60; d <= 60; d += 5) {
      const deg = ((Math.round(hd / 5) * 5 + d) % 360 + 360) % 360, x = 800 + (deg - hd + (deg - hd > 180 ? -360 : deg - hd < -180 ? 360 : 0)) * 4;
      c.fillStyle = sand; c.fillRect(x - 1, 40, 2, deg % 15 ? 12 : 22);
      if (deg % 45 === 0) K.txt(c, { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }[deg], x, 88, 22, deg ? '#fff' : '#ff6a3d', 'center', 700);
    }
    c.restore(); c.fillStyle = '#ff6a3d'; c.beginPath(); c.moveTo(800, 112); c.lineTo(788, 128); c.lineTo(812, 128); c.closePath(); c.fill();
    K.txt(c, Math.round(V.speed), 800, 260, 130, '#fff', 'center', 700); K.txt(c, 'km/h', 800, 335, 22, sand, 'center', 600);
    K.txt(c, `ALTITUD ${V.alt == null ? '—' : Math.round(V.alt)} m`, 800, 395, 24, sand, 'center', 700);
    K.bar(c, 600, 440, 400, 16, V.rpm / 8000, V.rpm > 6000 ? '#ff6a3d' : sand, dark, 8);
    K.txt(c, `${Math.round(V.rpm / 10) * 10} RPM`, 800, 480, 20, sand, 'center', 600);
    K.txt(c, `MOTOR ${n(V.coolant)}°   GAS ${n(V.fuel)}%`, 800, 540, 24, '#fff', 'center', 600);
  } });

/* --- Azul Racing --- */
add({ id: 'azulRacing', name: 'Azul Racing',
  back(c, w, h) {
    c.fillStyle = '#eef2f8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#123a8c'; c.fillRect(w * .44, 0, w * .04, h); c.fillStyle = '#3c7bff'; c.fillRect(w * .52, 0, w * .04, h);
  },
  draw(c, V) {
    const navy = '#0d2457', blue = '#2563eb';
    const ring = (cx, cy, r) => { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = '#fff'; c.shadowColor = 'rgba(13,36,87,.25)'; c.shadowBlur = 24; c.fill(); c.shadowBlur = 0; c.strokeStyle = navy; c.lineWidth = 6; c.stroke(); };
    ring(800, 310, 265); ring(330, 340, 200); ring(1270, 340, 200);
    K.arcG(c, { cx: 800, cy: 310, r: 225, a0: 135, a1: 405, v: V.speed, max: 220, w: 26, track: '#dde5f2', col: [blue, navy], cap: 'round',
      ticks: { every: 10, major: 20, col: '#9aa9c4', mcol: navy, r: 200, labels: { r: 165, size: 24, col: navy } } });
    K.txt(c, Math.round(V.speed), 800, 300, 120, navy, 'center', 700); K.txt(c, 'km/h', 800, 375, 24, blue, 'center', 600);
    K.arcG(c, { cx: 330, cy: 340, r: 165, a0: 135, a1: 405, v: V.rpm, max: 8000, w: 20, track: '#dde5f2', col: V.rpm > 6000 ? '#e11d48' : blue, red: { from: 6500, col: '#e11d48', r: 184, w: 5 },
      ticks: { every: 500, major: 1000, col: '#9aa9c4', mcol: navy, r: 146, labels: { r: 116, size: 20, col: navy, fmt: v => v / 1000 } } });
    K.txt(c, Math.round(V.rpm / 10) * 10, 330, 350, 40, navy, 'center', 700); K.txt(c, 'RPM', 330, 390, 18, blue, 'center', 600);
    K.arcG(c, { cx: 1270, cy: 340, r: 165, a0: 200, a1: 340, v: V.coolant == null ? 0 : V.coolant - 40, max: 90, w: 20, track: '#dde5f2', col: K.tempCol(V.coolant, '#60a5fa', blue, '#e11d48'), cap: 'round' });
    K.arcG(c, { cx: 1270, cy: 340, r: 165, a0: 160, a1: 20, v: V.fuel || 0, max: 100, w: 20, track: '#dde5f2', col: V.fuel != null && V.fuel < 15 ? '#e11d48' : navy, cap: 'round' });
    K.txt(c, `${n(V.coolant)}°C`, 1270, 300, 34, navy, 'center', 700); K.txt(c, 'MOTOR', 1270, 255, 16, blue, 'center', 700);
    K.txt(c, `${n(V.fuel)}%`, 1270, 385, 34, navy, 'center', 700); K.txt(c, 'GAS', 1270, 430, 16, blue, 'center', 700);
    K.txt(c, V.clock, 120, 60, 28, navy, 'left', 700);
    K.txt(c, `${n(V.kml, 1)} km/L   ·   ${n(V.tripKm, 1)} km`, 800, 600, 24, navy, 'center', 600);
  } });

/* ================= motor de dibujo ================= */
F.renderCanvas = function (c, def, w, h, V) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  def.back(c, w, h);
  const u = Math.min(w / 1600, h / 620);
  c.setTransform(u, 0, 0, u, (w - 1600 * u) / 2, (h - 620 * u) / 2);
  c.lineCap = 'butt'; c.setLineDash([]); c.shadowBlur = 0;
  def.draw(c, V);
};
})();
