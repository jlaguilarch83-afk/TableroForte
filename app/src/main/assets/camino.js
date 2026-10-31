/* Tablero Forte · el camino de verdad en Forte Tesla.
   Con el GPS y el mapa (OpenStreetMap) sigue la calle por donde vas y la dibuja como es:
   curvas, subidas y bajadas, carriles reales (y los de sentido contrario), calles que salen,
   semáforos, pasos peatonales, altos, topes y la ruta a la gasolinera pintada en azul.
   También el cielo real (amanecer, atardecer, noche con estrellas, nubes). */
(function () {
'use strict';
const F = window.F, K = F.K, clamp = F.clamp;
const RAD = Math.PI / 180;
if (F.cfg.cieloReal === undefined) F.cfg.cieloReal = true;
if (F.cfg.caminoReal === undefined) F.cfg.caminoReal = true;
const TIPOS = 'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service';
const ANCHO = 3.3;   // metros por carril
const gpsReal = () => F.gps && !F.gps.sim ? F.gps : null;
const dist = (a, b, c, d) => { const R = 6371000, x = (c - a) * RAD, y = (d - b) * RAD, h = Math.sin(x / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const cool = {};
const cada = (id, s) => { const t = Date.now(); if (cool[id] && t - cool[id] < s * 1000) return false; cool[id] = t; return true; };

/* ================= la red de calles alrededor ================= */
const NET = { ways: [], nodos: new Map(), cosas: [], pos: null, busy: false };
function bajar(g) {
  if (NET.busy) return;
  NET.busy = true; NET.pos = [g.lat, g.lon];
  const a = `(around:550,${g.lat.toFixed(6)},${g.lon.toFixed(6)})`;
  const q = `[out:json][timeout:20];way${a}[highway~"^(${TIPOS})$"];out body geom;node${a}[highway~"^(traffic_signals|crossing|stop|give_way)$"];out;node${a}[traffic_calming];out;`;
  fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) })
    .then(r => r.json()).then(j => cargarRed(j.elements || [])).catch(() => {}).finally(() => { NET.busy = false; });
}
function cargarRed(E) {
  const ways = E.filter(e => e.type === 'way' && e.geometry && e.nodes && e.geometry.length === e.nodes.length && e.nodes.length > 1);
  const nodos = new Map();
  ways.forEach(w => w.nodes.forEach((id, i) => { if (!nodos.has(id)) nodos.set(id, []); nodos.get(id).push({ w, i }); }));
  const cosas = [];
  for (const e of E) {
    if (e.type !== 'node' || !e.tags) continue;
    const t = e.tags;
    let tipo = null;
    if (t.highway === 'traffic_signals') tipo = 'semaforo';
    else if (t.highway === 'stop') tipo = 'alto';
    else if (t.highway === 'give_way') tipo = 'ceda';
    else if (t.highway === 'crossing' && !/^(unmarked|no)$/.test(t.crossing || '')) tipo = 'cebra';
    else if (t.traffic_calming && t.traffic_calming !== 'no') tipo = 'tope';
    if (tipo) cosas.push({ tipo, lat: e.lat, lon: e.lon });
  }
  NET.ways = ways; NET.nodos = nodos; NET.cosas = cosas; NET.t = Date.now();
  elevPos = null;   // pedir pendiente de nuevo
}
F.caminoDatos = j => cargarRed(j.elements || []);   // para pruebas

/* ================= seguir la calle hacia adelante ================= */
function carriles(t) {
  t = t || {};
  const tipo = (t.highway || '').replace('_link', '');
  const uno = t.oneway === 'yes' || t.oneway === '1' || t.highway === 'motorway' || /_link$/.test(t.highway || '') || t.junction === 'roundabout';
  const DEF = { motorway: 3, trunk: 4, primary: 4, secondary: 2, tertiary: 2, unclassified: 2, residential: 2, living_street: 1, service: 1 };
  let N = parseInt(t.lanes) || (uno ? Math.max(1, Math.round((DEF[tipo] || 2) / (tipo === 'motorway' ? 1 : 2))) : DEF[tipo] || 2);
  let ida, regreso;
  if (uno) { ida = N; regreso = 0; }
  else { ida = parseInt(t['lanes:forward']) || Math.ceil(N / 2); regreso = parseInt(t['lanes:backward']) || Math.max(1, N - ida); }
  ida = clamp(ida, 1, 6); regreso = clamp(regreso, 0, 6);
  // en cuál vas: no se sabe con el GPS; se toma el de la derecha si son 1–2, si no uno de en medio
  const idx = ida <= 2 ? ida - 1 : Math.floor(ida / 2);
  return { ida, regreso, idx, uno };
}
function calcular(g, rumbo) {
  if (!NET.ways.length) return null;
  const kx = 111320 * Math.cos(g.lat * RAD), ky = 111320;
  const P = q => [(q.lon - g.lon) * kx, (q.lat - g.lat) * ky];
  // tramo de calle más cercano que va para donde vas
  let best = null;
  for (const w of NET.ways) {
    const G = w.geometry;
    for (let i = 1; i < G.length; i++) {
      const a = P(G[i - 1]), b = P(G[i]), dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      if (!l2) continue;
      const t = clamp(-(a[0] * dx + a[1] * dy) / l2, 0, 1), px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(px, py);
      if (d > 32) continue;
      const brg = Math.atan2(dx, dy);
      let dir = 1, pen = 0;
      if (rumbo != null) {
        const df = Math.abs(wrap(brg - rumbo * RAD)) / RAD;
        if (df < 60) dir = 1; else if (df > 120) dir = -1; else pen = 40;
        if (dir === -1 && (w.tags.oneway === 'yes' || w.tags.highway === 'motorway')) pen += 30;
      }
      const sc = d + pen;
      if (!best || sc < best.sc) best = { sc, w, i, dir, px, py };
    }
  }
  if (!best) return null;
  // caminar por la calle (y las que siguen derecho) hasta ~400 m
  const pts = [[best.px, best.py, 0]], laterales = [], nombre = best.w.tags.name || '';
  let w = best.w, k = best.dir > 0 ? best.i : best.i - 1, dir = best.dir, s = 0, prev = [best.px, best.py], pasos = 0;
  const visto = new Set();
  while (s < 420 && pasos++ < 600) {
    const q = P(w.geometry[k]), seg = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    if (seg < .01) { k += dir; if (k < 0 || k >= w.nodes.length) break; continue; }
    s += seg; pts.push([q[0], q[1], s]);
    const ux = (q[0] - prev[0]) / seg, uy = (q[1] - prev[1]) / seg;
    prev = q;
    const nid = w.nodes[k], aqui = NET.nodos.get(nid) || [];
    // ¿se acaba la calle aquí? seguir por la que va más derecho
    let sig = null;
    const kn = k + dir;
    if (kn < 0 || kn >= w.nodes.length) {
      let mejor = 1e9;
      for (const o of aqui) {
        if (o.w === w) continue;
        for (const dd of [1, -1]) {
          const j = o.i + dd; if (j < 0 || j >= o.w.nodes.length) continue;
          if (dd === -1 && o.w.tags.oneway === 'yes') continue;
          const r = P(o.w.geometry[j]), vx = r[0] - q[0], vy = r[1] - q[1], vl = Math.hypot(vx, vy) || 1;
          const ang = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) / RAD;
          const sc = ang - ((o.w.tags.name || '') === nombre && nombre ? 15 : 0);
          if (ang < 55 && sc < mejor) { mejor = sc; sig = { w: o.w, k: j, dir: dd }; }
        }
      }
    }
    // calles que salen de este punto
    if (s > 4 && !visto.has(nid)) {
      visto.add(nid);
      for (const o of aqui) {
        if (o.w === w || (sig && o.w === sig.w)) continue;
        for (const dd of [1, -1]) {
          const j = o.i + dd; if (j < 0 || j >= o.w.nodes.length) continue;
          const r = P(o.w.geometry[j]), vx = r[0] - q[0], vy = r[1] - q[1];
          const rel = -Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) / RAD;   // + = derecha
          if (Math.abs(rel) > 20 && Math.abs(rel) < 160) laterales.push({ s, ang: rel, lado: rel > 0 ? 'der' : 'izq', ancho: carriles(o.w.tags) });
        }
      }
    }
    if (kn < 0 || kn >= w.nodes.length) {
      if (!sig) break;
      w = sig.w; k = sig.k; dir = sig.dir;
    } else k = kn;
  }
  if (pts.length < 2) return null;
  // marco del carro: hacia donde va la calle aquí
  const b = Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const sb = Math.sin(b), cb = Math.cos(b);
  const loc = (x, y) => [x * sb + y * cb, x * cb - y * sb];   // [d adelante, L a la derecha]
  const camino = pts.map(([x, y, s]) => { const [d, L] = loc(x - pts[0][0], y - pts[0][1]); return { s, d, L }; });
  // cosas del mapa sobre el camino
  const cosas = [];
  for (const c of NET.cosas) {
    const p = P(c), r = proyectar(pts, p[0], p[1]);
    if (r && Math.abs(r.off) < 14 && r.s > 2 && r.s < 300) cosas.push({ tipo: c.tipo, s: r.s, off: r.off });
  }
  // ruta a la gasolinera
  let ruta = null;
  const C = F.nav && F.nav.coords && F.nav.coords();
  if (C && C.length > 1) ruta = C.map(([lo, la]) => { const p = P({ lat: la, lon: lo }); const [d, L] = loc(p[0] - pts[0][0], p[1] - pts[0][1]); return { d, L }; });
  return { t: performance.now(), gpsT: g.t, camino, laterales: unir(laterales), cosas: unir(cosas), ruta, car: carriles(best.w.tags), nombre, curva: curvas(pts), way: best.w, pts };
}
function proyectar(pts, x, y) {
  let r = null;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay, as] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; if (!l2) continue;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), px = ax + t * dx, py = ay + t * dy, d = Math.hypot(x - px, y - py);
    if (!r || d < Math.abs(r.off)) { const l = Math.sqrt(l2), sg = (dx * (y - ay) - dy * (x - ax)) > 0 ? -1 : 1; r = { s: as + t * l, off: sg * d }; }
  }
  return r;
}
const unir = L => L.sort((a, b) => a.s - b.s).filter((x, i, A) => !A.slice(0, i).some(y => Math.abs(y.s - x.s) < 8 && (y.lado || y.tipo) === (x.lado || x.tipo)));
// curvas cerradas adelante: radio y velocidad recomendada
function curvas(pts) {
  const R = [];   // rumbo cada 5 m
  let j = 1;
  for (let s = 0; s < 400; s += 5) {
    while (j < pts.length - 1 && pts[j][2] < s) j++;
    const a = pts[j - 1], b = pts[j]; if (!b) break;
    R.push({ s, h: Math.atan2(b[0] - a[0], b[1] - a[1]) });
  }
  let mejor = null;
  for (let i = 0; i + 8 < R.length; i++) {
    const dh = wrap(R[i + 8].h - R[i].h), k = Math.abs(dh) / 40;
    if (k > 1 / 230 && (!mejor || k > mejor.k)) mejor = { k, s: R[i].s, lado: dh > 0 ? 'der' : 'izq' };
  }
  if (!mejor || mejor.s < 15) return null;
  const radio = 1 / mejor.k, v = Math.floor(Math.sqrt(2.8 * radio) * 3.6 / 5) * 5;
  return v < 90 ? { s: mejor.s, lado: mejor.lado, radio, v: Math.max(15, v) } : null;
}

/* ================= subidas y bajadas (elevación) ================= */
let elevPos = null, elev = null, elevBusy = false;
function pedirElevacion(g, V) {
  if (elevBusy || !V || V.camino.length < 2) return;
  if (elevPos && dist(elevPos[0], elevPos[1], g.lat, g.lon) < 120) return;
  elevBusy = true; elevPos = [g.lat, g.lon];
  const kx = 111320 * Math.cos(g.lat * RAD), ky = 111320, S = [0, 60, 120, 180, 240];
  const pts = S.map(s => { const p = V.pts.find(q => q[2] >= s) || V.pts[V.pts.length - 1]; return [g.lat + p[1] / ky, g.lon + p[0] / kx, Math.min(s, p[2])]; });
  fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[0].toFixed(5)).join(',')}&longitude=${pts.map(p => p[1].toFixed(5)).join(',')}`)
    .then(r => r.json()).then(j => { if (j.elevation) elev = { pos: [g.lat, g.lon], s: pts.map(p => p[2]), e: j.elevation }; })
    .catch(() => {}).finally(() => { elevBusy = false; });
}
F.caminoElevacion = (s, e) => { elev = { s, e }; };   // para pruebas
function altura(s) {
  if (!elev || elev.e.length < 2) return 0;
  const S = elev.s, E = elev.e;
  let i = 1; while (i < S.length - 1 && S[i] < s) i++;
  const t = clamp((s - S[i - 1]) / Math.max(1, S[i] - S[i - 1]), 0, 1.5);
  return clamp(E[i - 1] + (E[i] - E[i - 1]) * t - E[0], -25, 25);
}

/* ================= actualización ================= */
F.via = null;
let rumboUlt = null;
setInterval(() => {
  const g = gpsReal();
  if (!g || F.cfg.caminoReal === false) { F.via = null; return; }
  if (!NET.pos || dist(NET.pos[0], NET.pos[1], g.lat, g.lon) > 250) bajar(g);
  if (g.bearing != null && (g.speed || 0) > 5) rumboUlt = g.bearing;
  const V = calcular(g, rumboUlt);
  F.via = V;
  if (V) {
    pedirElevacion(g, V);
    // aviso de curva cerrada
    const vel = F.S.speed || 0, cu = V.curva;
    if (cu && cu.s < 160 && vel > cu.v + 12 && cada('curva', 25))
      F.alert('curva', `Curva ${cu.lado === 'der' ? 'a la derecha' : 'a la izquierda'} · ${cu.v} km/h`, 'warn', `Curva cerrada a la ${cu.lado === 'der' ? 'derecha' : 'izquierda'}, baja a ${cu.v}`);
  }
}, 400);

/* ================= dibujo ================= */
// distancia recorrida desde la última posición del GPS (para que el camino avance suave)
const avance = () => { const V = F.via; if (!V) return 0; return clamp((F.S.speed || 0) / 3.6 * (performance.now() - (V.gpsT || V.t)) / 1000, 0, 40); };
// punto del camino a la distancia s (centro de la calle) y su dirección
function enCamino(V, s) {
  const C = V.camino;
  let i = 1; while (i < C.length - 1 && C[i].s < s) i++;
  const a = C[i - 1], b = C[i], l = Math.max(.01, b.s - a.s), t = (s - a.s) / l;
  const nd = (b.d - a.d) / l, nL = (b.L - a.L) / l;   // dirección (d, L)
  return { d: a.d + (b.d - a.d) * t, L: a.L + (b.L - a.L) * t, td: nd, tL: nL };
}
// lateral de un punto en la calle: u = metros desde la línea del mapa (+ derecha)
function punto(V, s, u) { const p = enCamino(V, s); return { d: p.d + (-p.tL) * u, L: p.L + p.td * u }; }
F.caminoAltura = s => altura(s);
F.caminoActivo = () => !!(F.via && F.cfg.caminoReal !== false);

F.dibujarCamino = function (c, ctx) {
  const V = F.via; if (!V) return false;
  const { px, py, P, nightMix, dist: recorrido } = ctx;
  const av = avance(), car = V.car, W = ANCHO;
  // dónde va tu carro dentro de la calle (desde la línea del mapa)
  let uCar = car.uno ? -car.ida * W / 2 + (car.idx + .5) * W : (car.idx + .5) * W;
  if (F.lane && F.lane.ok && performance.now() - F.lane.t < 1500) uCar += clamp(F.lane.off, -1.2, 1.2) * .5;
  const uIzq = car.uno ? -car.ida * W / 2 : -car.regreso * W, uDer = car.uno ? car.ida * W / 2 : car.ida * W;
  const S = [];
  for (let s = 0; s <= 260; s += s < 20 ? 2 : s < 60 ? 5 : 10) S.push(s);
  // el camino arranca donde estás: se desplaza para que el punto 0 quede en tu carro
  const base = enCamino(V, av), b0 = { d: base.d, L: base.L };
  const T = (s, u) => {
    const q = punto(V, s + av, u - uCar);
    // al marco del carro: restar dónde estás ahora y girar con la calle aquí
    const dd = q.d - b0.d, LL = q.L - b0.L, cs = base.td, sn = base.tL;
    const d = dd * cs + LL * sn, L = -dd * sn + LL * cs;
    return d > .3 ? { x: px(L, d), y: py(d), d, L } : null;
  };
  // asfalto
  const borde = (u, dir) => { const o = []; for (const s of (dir > 0 ? S : S.slice().reverse())) { const p = T(s, u); if (p) o.push(p); } return o; };
  const izq = borde(uIzq - .3, 1), der = borde(uDer + .3, -1);
  if (izq.length < 2) return false;
  c.beginPath(); izq.concat(der).forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
  const g = c.createLinearGradient(0, 150, 0, 620); g.addColorStop(0, P.road); g.addColorStop(1, P.road);
  c.fillStyle = g; c.fill();
  // calles que salen
  for (const l of V.laterales) {
    const s = l.s - av; if (s < -6 || s > 200) continue;
    const ua = l.lado === 'der' ? uDer : uIzq, sg = l.lado === 'der' ? 1 : -1, an = Math.max(1, (l.ancho.ida + l.ancho.regreso)) * W;
    const a = Math.abs(l.ang) * RAD, ex = Math.sin(a) * 26 * sg, es = Math.cos(a) * 26;
    const q1 = T(s - an / 2, ua), q2 = T(s + an / 2, ua), q3 = T(s + an / 2 + es, ua + ex), q4 = T(s - an / 2 + es, ua + ex);
    if (!q1 || !q2 || !q3 || !q4) continue;
    c.beginPath(); c.moveTo(q1.x, q1.y); c.lineTo(q4.x, q4.y); c.lineTo(q3.x, q3.y); c.lineTo(q2.x, q2.y); c.closePath();
    c.fillStyle = P.road; c.fill();
    c.strokeStyle = P.edge; c.globalAlpha = .55; c.lineWidth = 2;
    c.beginPath(); c.moveTo(q1.x, q1.y); c.lineTo(q4.x, q4.y); c.moveTo(q2.x, q2.y); c.lineTo(q3.x, q3.y); c.stroke(); c.globalAlpha = 1;
  }
  // líneas: orillas, centro amarillo y carriles
  const linea = (u, col, ancho, punteada, alfa) => {
    c.save(); c.strokeStyle = col; c.globalAlpha = alfa || 1;
    const fase = recorrido % 9;
    if (!punteada) {
      c.beginPath(); let ini = false;
      for (const s of S) { const p = T(s, u); if (!p) continue; c.lineWidth = Math.max(1, ancho * 600 / (p.d + 5.4)); ini ? c.lineTo(p.x, p.y) : (c.moveTo(p.x, p.y), ini = true); }
      c.lineWidth = Math.max(1.5, ancho * 60); c.stroke();
    } else {
      c.fillStyle = col;
      for (let d0 = -fase; d0 < 200; d0 += 9) {
        const a = Math.max(0, d0), b2 = d0 + 3; if (b2 <= 0) continue;
        const p1 = T(a, u - ancho), p2 = T(b2, u - ancho), p3 = T(b2, u + ancho), p4 = T(a, u + ancho);
        if (!p1 || !p2 || !p3 || !p4) continue;
        c.globalAlpha = (alfa || 1) * clamp(1 - b2 / 200, 0, 1);
        c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p3.x, p3.y); c.lineTo(p4.x, p4.y); c.closePath(); c.fill();
      }
    }
    c.restore();
  };
  linea(uIzq, P.edge, .06, false, .9); linea(uDer, P.edge, .06, false, .9);
  if (!car.uno) { linea(-.12, '#e8b400', .05, false, .95); linea(.12, '#e8b400', .05, false, .95); }
  for (let i = 1; i < car.ida; i++) linea((car.uno ? -car.ida * W / 2 : 0) + i * W, P.lane, .07, true);
  for (let i = 1; i < car.regreso; i++) linea(-i * W, P.lane, .07, true, .6);
  // ruta a la gasolinera, en azul (pasa por tu carril)
  if (V.ruta) {
    c.save(); c.strokeStyle = 'rgba(47,123,255,.55)'; c.lineCap = 'round'; c.lineJoin = 'round';
    const cs = base.td, sn = base.tL;
    let prev = null;
    for (const r of V.ruta) {
      const dd = r.d - b0.d, LL = r.L - b0.L, d = dd * cs + LL * sn, L = -dd * sn + LL * cs;
      if (d < .5 || d > 220) { prev = null; continue; }
      const p = { x: px(L, d), y: py(d), d };
      if (prev) { c.lineWidth = Math.max(2, 2.4 * 600 / (d + 5.4)); c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(p.x, p.y); c.stroke(); }
      prev = p;
    }
    c.restore();
  }
  // cosas del mapa sobre la calle
  for (const o of V.cosas.slice().sort((a, b) => b.s - a.s)) {
    const s = o.s - av; if (s < 1 || s > 180) continue;
    const pi = T(s, uIzq), pd = T(s, uDer); if (!pi || !pd) continue;
    const esc = 600 / (pi.d + 5.4);
    c.save(); c.globalAlpha = clamp(1.6 - s / 140, .3, 1);
    if (o.tipo === 'cebra') {
      for (let u = uIzq + .4; u < uDer - .4; u += 1.1) {
        const a = T(s - 1.5, u), b = T(s + 1.5, u), a2 = T(s - 1.5, u + .55), b2 = T(s + 1.5, u + .55);
        if (!a || !b || !a2 || !b2) continue;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(b2.x, b2.y); c.lineTo(a2.x, a2.y); c.closePath();
        c.fillStyle = P.edge; c.fill();
      }
    } else if (o.tipo === 'tope') {
      for (let u = (car.uno ? uIzq : 0); u < uDer; u += .8) {
        const a = T(s - .4, u), b = T(s + .4, u), a2 = T(s - .4, u + .8), b2 = T(s + .4, u + .8);
        if (!a || !b || !a2 || !b2) continue;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(b2.x, b2.y); c.lineTo(a2.x, a2.y); c.closePath();
        c.fillStyle = Math.round((u - uIzq) / .8) % 2 ? '#ffc61a' : '#1a1a1a'; c.fill();
      }
    } else {
      // raya de alto a lo ancho de tus carriles
      const a1 = T(s - .3, car.uno ? uIzq : 0), a2 = T(s - .3, uDer), b1 = T(s + .3, car.uno ? uIzq : 0), b2 = T(s + .3, uDer);
      if (a1 && a2 && b1 && b2) { c.beginPath(); c.moveTo(a1.x, a1.y); c.lineTo(a2.x, a2.y); c.lineTo(b2.x, b2.y); c.lineTo(b1.x, b1.y); c.closePath(); c.fillStyle = P.edge; c.fill(); }
      const poste = T(s, uDer + .9); if (!poste) { c.restore(); continue; }
      const r = clamp(esc * .45, 7, 40), x = poste.x, y = poste.y;
      c.strokeStyle = '#555'; c.lineWidth = Math.max(2, r * .15); c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - r * 3.2); c.stroke();
      if (o.tipo === 'semaforo') {
        const z = F.luz && performance.now() - F.luz.t < 3000 && s < 70 ? F.luz.estado : null;
        K.rr(c, x - r * .55, y - r * 4.9, r * 1.1, r * 2.6, r * .25); c.fillStyle = '#11151c'; c.fill();
        [['rojo', '#ff3030'], ['amarillo', '#ffb400'], ['verde', '#19e070']].forEach(([k, col], i) => {
          c.beginPath(); c.arc(x, y - r * 4.45 + i * r * .85, r * .32, 0, Math.PI * 2);
          c.fillStyle = z === k ? col : 'rgba(255,255,255,.12)'; c.fill();
        });
      } else if (o.tipo === 'alto') {
        c.beginPath();
        for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; c.lineTo(x + Math.cos(a) * r, y - r * 3.6 + Math.sin(a) * r); }
        c.closePath(); c.fillStyle = '#d4202a'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, r * .1); c.stroke();
        if (r > 12) K.txt(c, 'ALTO', x, y - r * 3.6, r * .55, '#fff', 'center', 800);
      } else if (o.tipo === 'ceda') {
        c.beginPath(); c.moveTo(x - r, y - r * 4.3); c.lineTo(x + r, y - r * 4.3); c.lineTo(x, y - r * 2.6); c.closePath();
        c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#d4202a'; c.lineWidth = Math.max(2, r * .22); c.stroke();
      }
    }
    c.restore();
  }
  // letrero de curva cerrada
  const cu = V.curva;
  if (cu) {
    const s = cu.s - av;
    const p = s > 3 && s < 220 ? T(s, uDer + 1.2) : null;
    if (p) {
      const r = clamp(600 / (p.d + 5.4) * .7, 12, 44), x = p.x, y = p.y - r * 2.4;
      c.save(); c.strokeStyle = '#555'; c.lineWidth = Math.max(2, r * .12); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(x, y + r); c.stroke();
      c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath();
      c.fillStyle = '#ffc61a'; c.fill(); c.lineWidth = Math.max(1.5, r * .08); c.strokeStyle = '#1a1a1a'; c.stroke();
      const sg = cu.lado === 'der' ? 1 : -1;
      c.lineWidth = Math.max(2, r * .14); c.beginPath(); c.moveTo(x - sg * r * .15, y + r * .5); c.lineTo(x - sg * r * .15, y - r * .05);
      c.quadraticCurveTo(x - sg * r * .15, y - r * .35, x + sg * r * .3, y - r * .35); c.stroke();
      c.beginPath(); c.moveTo(x + sg * r * .3, y - r * .55); c.lineTo(x + sg * r * .5, y - r * .35); c.lineTo(x + sg * r * .3, y - r * .15); c.closePath(); c.fillStyle = '#1a1a1a'; c.fill();
      K.txt(c, `${cu.v} km/h`, x, y + r * 1.6, clamp(r * .55, 12, 20), '#e89a10', 'center', 800);
      c.restore();
    }
  }
  // pendiente
  const sube = (altura(160) - altura(0)) / 160 * 100;
  ctx.etiqueta = [V.nombre, Math.abs(sube) >= 3 ? `${sube > 0 ? 'Subida' : 'Bajada'} ${Math.round(Math.abs(sube))} %` : ''].filter(Boolean).join(' · ');
  return true;
};

/* ================= cielo real ================= */
const ESTRELLAS = Array.from({ length: 90 }, () => [Math.random() * 1600, Math.random() * 140, Math.random() * 1.4 + .4, Math.random() * 6.28]);
const NUBES = Array.from({ length: 7 }, (_, i) => [i * 260 + Math.random() * 120, 30 + Math.random() * 70, 70 + Math.random() * 90]);
const hm = s => { const [h, m] = String(s || '').split(':').map(Number); return isFinite(h) ? h * 60 + (m || 0) : null; };
F.dibujarCielo = function (c, w, h, mixes) {
  if (F.cfg.cieloReal === false) return;
  const u = Math.min(w / 1600, h / 620), ox = (w - 1600 * u) / 2, oy = (h - 620 * u) / 2, HZ = 150;
  const wt = F.weather, d = new Date(), ahora = d.getHours() * 60 + d.getMinutes();
  const sr = wt && hm(wt.sunrise) || 7 * 60 + 10, ss = wt && hm(wt.sunset) || 18 * 60 + 40;
  // 0 noche · 1 día; dorado cerca del amanecer y atardecer
  const lado = Math.min(Math.abs(ahora - sr), Math.abs(ahora - ss));
  const dia = (ahora > sr && ahora < ss ? clamp(lado / 50, 0, 1) : 0) * (1 - mixes.night);
  const dorado = clamp(1 - lado / 55, 0, 1);
  const noche = mixes.night;
  c.save(); c.setTransform(u, 0, 0, u, ox, oy);
  const g = c.createLinearGradient(0, -oy / u, 0, HZ + 10);
  const mixc = (a, b, t) => { const A = a.match(/\w\w/g).map(x => parseInt(x, 16)), B = b.match(/\w\w/g).map(x => parseInt(x, 16)); return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',')})`; };
  let arriba = mixc('#0a1022', '#6fa6dd', dia), abajo = mixc('#1a2540', '#dce8f4', dia);
  if (dorado > 0) { arriba = mixc(arriba.replace(/rgb\((\d+),(\d+),(\d+)\)/, (m, a, b2, cc) => '#' + [a, b2, cc].map(x => (+x).toString(16).padStart(2, '0')).join('')), '#3a4d86', dorado * .7); abajo = `rgba(246,170,110,${.55 + dorado * .4})`; }
  const cover = wt ? (wt.code >= 51 ? .7 : wt.code === 3 ? .45 : wt.code >= 1 && wt.code <= 2 ? .2 : wt.code >= 45 ? .5 : 0) : 0;
  g.addColorStop(0, arriba); g.addColorStop(1, abajo);
  c.globalAlpha = .85 * (1 - mixes.sport * .7);
  c.fillStyle = g; c.fillRect(-ox / u, -oy / u, w / u, HZ + 12 + oy / u);
  // estrellas
  if (dia < .3 && cover < .6) {
    for (const [x, y, r, f] of ESTRELLAS) {
      c.globalAlpha = (1 - dia / .3) * (1 - cover) * (.45 + .45 * Math.sin(F.t * 1.3 + f)) * .9;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  }
  // nubes
  if (cover > 0) {
    for (const [x0, y, r] of NUBES) {
      const x = ((x0 + F.t * 4) % 1900) - 150;
      c.globalAlpha = cover * (dia > .5 ? .75 : .35);
      c.fillStyle = wt && wt.code >= 51 ? (dia > .5 ? '#9aa4b2' : '#3a4354') : (dia > .5 ? '#ffffff' : '#4a5570');
      c.beginPath(); c.ellipse(x, y, r, r * .32, 0, 0, Math.PI * 2); c.ellipse(x + r * .5, y - r * .12, r * .55, r * .28, 0, 0, Math.PI * 2); c.ellipse(x - r * .45, y + r * .03, r * .5, r * .22, 0, 0, Math.PI * 2); c.fill();
    }
  }
  // sol bajo en el atardecer
  if (dorado > .2 && cover < .7) {
    const sx = ahora < 12 * 60 ? 380 : 1220, sg = c.createRadialGradient(sx, HZ - 6, 4, sx, HZ - 6, 120);
    sg.addColorStop(0, `rgba(255,214,140,${dorado})`); sg.addColorStop(1, 'rgba(255,170,90,0)');
    c.globalAlpha = 1; c.fillStyle = sg; c.fillRect(sx - 130, HZ - 130, 260, 140);
  }
  c.restore();
};
})();
