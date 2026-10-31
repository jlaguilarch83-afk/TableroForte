/* Tablero Forte · repetición del viaje: tu recorrido animado en el mapa,
   pintado por velocidad, con la hora y los km/h de cada tramo. */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$, clamp = F.clamp;
const col = v => v == null ? '#8a94a6' : v < 30 ? '#3b82f6' : v < 60 ? '#22c55e' : v < 90 ? '#eab308' : '#ef4444';
const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

ui.addPanel('repeticion', 'Repetir viaje', () => {
  const { body, btn, kv } = ui.h;
  const u = F.store('forte-ultimo-ruta'), ahora = F.trip.ruta;
  body.innerHTML = '<p class="note">Tu recorrido animado en el mapa, pintado por velocidad: azul despacio, verde normal, amarillo rápido y rojo muy rápido.</p>' +
    (u ? kv('Último viaje', `${new Date(u.t).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${u.km.toFixed(1)} km`) + btn('rUlt', 'Ver el último viaje', 'pri') : '<p class="note">Cuando termines un viaje (al apagar el carro) aquí podrás verlo.</p>') +
    (ahora.length > 3 ? btn('rAhora', 'Ver el viaje de ahora') : '');
  if ($('rUlt')) $('rUlt').onclick = () => { ui.close(); abrir(u.ruta); };
  if ($('rAhora')) $('rAhora').onclick = () => { ui.close(); abrir(F.trip.ruta.slice()); };
});
F.repetir = r => abrir(r || (F.store('forte-ultimo-ruta') || {}).ruta || F.trip.ruta);

const box = document.createElement('div'); box.id = 'repe'; box.hidden = true;
box.innerHTML = `<div class="rMapa" id="rMapa"><div class="rTiles" id="rTiles"></div><canvas id="rCv"></canvas><span class="rAttr">© OpenStreetMap</span></div>
<div class="rHud"><div><b id="rVel">0</b><small>km/h</small></div><div><b id="rT">0:00</b><small>tiempo</small></div><div><b id="rKm">0.0</b><small>km</small></div></div>
<div class="rLey"><i style="background:#3b82f6"></i>&lt;30<i style="background:#22c55e"></i>&lt;60<i style="background:#eab308"></i>&lt;90<i style="background:#ef4444"></i>90+</div>
<div class="rCtl"><button type="button" id="rPlay" aria-label="Pausa">❚❚</button><input type="range" id="rPos" min="0" max="1000" value="0" aria-label="Posición"><button type="button" id="rRate">x20</button><button type="button" id="rX">Cerrar</button></div>`;
document.body.appendChild(box);

const R = { pts: [], t: 0, total: 1, rate: 20, play: true, raf: 0, last: 0, z: 14, ox: 0, oy: 0, S: 1, km: [] };
const lx = lon => (lon + 180) / 360, ly = lat => { const s = Math.sin(lat * Math.PI / 180); return .5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const RAD = Math.PI / 180;
const dist = (a, b, c, d) => { const x = (c - a) * RAD, y = (d - b) * RAD, h = Math.sin(x / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin(y / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };

function abrir(ruta) {
  if (!ruta || ruta.length < 2) { ui.toast('Todavía no hay recorrido para repetir'); return; }
  // [lat, lon, km/h, segundos]; las rutas viejas no traen tiempo: cada punto ~5 s
  R.pts = ruta.map((p, i) => ({ la: p[0], lo: p[1], v: p.length > 2 ? p[2] : null, t: p.length > 3 ? p[3] : i * 5 }));
  const t0 = R.pts[0].t; R.pts.forEach(p => { p.t -= t0; });
  R.km = [0]; for (let i = 1; i < R.pts.length; i++) R.km.push(R.km[i - 1] + dist(R.pts[i - 1].la, R.pts[i - 1].lo, R.pts[i].la, R.pts[i].lo) / 1000);
  R.total = Math.max(1, R.pts[R.pts.length - 1].t);
  R.rate = R.total > 1800 ? 60 : R.total > 600 ? 30 : 20; $('rRate').textContent = 'x' + R.rate;
  R.t = 0; R.play = true; box.hidden = false;
  requestAnimationFrame(() => { mapa(); R.last = performance.now(); cancelAnimationFrame(R.raf); R.raf = requestAnimationFrame(paso); });
}
function mapa() {
  const el = $('rMapa'), W = el.clientWidth, H = el.clientHeight, cv = $('rCv');
  const d = Math.min(2, devicePixelRatio || 1); cv.width = W * d; cv.height = H * d; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of R.pts) { const x = lx(p.lo), y = ly(p.la); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let z = 18; while (z > 3 && ((x1 - x0) * 256 * 2 ** z > W * .82 || (y1 - y0) * 256 * 2 ** z > H * .72)) z--;
  R.z = z; R.S = 256 * 2 ** z; R.ox = (x0 + x1) / 2 * R.S - W / 2; R.oy = (y0 + y1) / 2 * R.S - H / 2 + H * .06;
  let t = '';
  for (let tx = Math.floor(R.ox / 256); tx <= Math.floor((R.ox + W) / 256); tx++)
    for (let ty = Math.floor(R.oy / 256); ty <= Math.floor((R.oy + H) / 256); ty++) {
      const m = 2 ** z; if (ty < 0 || ty >= m) continue;
      t += `<img alt="" onerror="this.remove()" src="https://tile.openstreetmap.org/${z}/${((tx % m) + m) % m}/${ty}.png" style="left:${tx * 256 - R.ox}px;top:${ty * 256 - R.oy}px">`;
    }
  $('rTiles').innerHTML = t;
}
const XY = p => [lx(p.lo) * R.S - R.ox, ly(p.la) * R.S - R.oy];
function dibujar(i, f) {
  const cv = $('rCv'), c = cv.getContext('2d'), d = cv.width / cv.clientWidth;
  c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
  c.lineCap = 'round'; c.lineJoin = 'round';
  // recorrido completo tenue y lo ya recorrido con color
  c.lineWidth = 6; c.strokeStyle = 'rgba(20,30,50,.25)'; c.beginPath();
  R.pts.forEach((p, k) => { const [x, y] = XY(p); k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
  c.lineWidth = 5;
  for (let k = 1; k <= i; k++) { const [ax, ay] = XY(R.pts[k - 1]), [bx, by] = XY(R.pts[k]); c.strokeStyle = col(R.pts[k].v); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
  const a = R.pts[i], b = R.pts[Math.min(i + 1, R.pts.length - 1)], [ax, ay] = XY(a), [bx, by] = XY(b);
  const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
  if (f > 0) { c.strokeStyle = col(b.v); c.beginPath(); c.moveTo(ax, ay); c.lineTo(x, y); c.stroke(); }
  // tu carro: flecha con el rumbo del tramo
  const ang = Math.atan2(by - ay, bx - ax);
  c.save(); c.translate(x, y); c.rotate(ang + Math.PI / 2);
  c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 6;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2f6bff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 7); c.lineTo(0, 3); c.lineTo(-7, 7); c.closePath(); c.fill();
  c.restore();
}
function paso(now) {
  if (box.hidden) return;
  const dt = Math.min(.1, (now - R.last) / 1000); R.last = now;
  if (R.play) { R.t += dt * R.rate; if (R.t >= R.total) { R.t = R.total; R.play = false; $('rPlay').textContent = '▶'; } }
  let i = 0; while (i < R.pts.length - 2 && R.pts[i + 1].t <= R.t) i++;
  const a = R.pts[i], b = R.pts[i + 1] || a, f = b.t > a.t ? clamp((R.t - a.t) / (b.t - a.t), 0, 1) : 0;
  dibujar(i, f);
  const v = a.v == null ? null : a.v + ((b.v ?? a.v) - a.v) * f;
  $('rVel').textContent = v == null ? '—' : Math.round(v); $('rVel').style.color = col(v);
  $('rT').textContent = fmt(R.t); $('rKm').textContent = (R.km[i] + ((R.km[i + 1] ?? R.km[i]) - R.km[i]) * f).toFixed(1);
  $('rPos').value = String(Math.round(R.t / R.total * 1000));
  R.raf = requestAnimationFrame(paso);
}
$('rX').onclick = () => { box.hidden = true; cancelAnimationFrame(R.raf); };
$('rPlay').onclick = () => { if (R.t >= R.total) R.t = 0; R.play = !R.play; $('rPlay').textContent = R.play ? '❚❚' : '▶'; };
$('rRate').onclick = () => { const L = [5, 10, 20, 30, 60, 120]; R.rate = L[(L.indexOf(R.rate) + 1) % L.length]; $('rRate').textContent = 'x' + R.rate; };
$('rPos').oninput = () => { R.t = +$('rPos').value / 1000 * R.total; };
window.addEventListener('resize', () => { if (!box.hidden) mapa(); });

const css = document.createElement('style');
css.textContent = `
#repe{position:fixed;inset:0;z-index:47;background:#0b0f17;color:#fff}
#repe[hidden]{display:none!important}
.rMapa{position:absolute;inset:0;overflow:hidden;background:#dfe3e8}
.rTiles img{position:absolute;width:256px;height:256px;user-select:none}
#rCv{position:absolute;left:0;top:0}
.rAttr{position:absolute;right:6px;bottom:64px;font-size:10px;color:#333;background:rgba(255,255,255,.7);padding:1px 4px;border-radius:3px}
.rHud{position:absolute;left:max(12px,env(safe-area-inset-left,0px));top:12px;display:flex;gap:8px}
.rHud div{background:rgba(12,17,27,.88);border-radius:14px;padding:6px 12px;display:flex;flex-direction:column;align-items:center;min-width:64px}
.rHud b{font-size:24px;line-height:1.1;font-variant-numeric:tabular-nums}
.rHud small{font-size:10px;color:#9fb0c8;letter-spacing:.08em;text-transform:uppercase}
.rLey{position:absolute;right:max(12px,env(safe-area-inset-right,0px));top:12px;background:rgba(12,17,27,.88);border-radius:12px;padding:6px 10px;font-size:11px;display:flex;align-items:center;gap:4px}
.rLey i{width:12px;height:6px;border-radius:3px;display:inline-block;margin-left:6px}
.rCtl{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;align-items:center;padding:10px max(14px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(14px,env(safe-area-inset-left,0px));background:rgba(12,17,27,.92)}
.rCtl input{flex:1;min-width:0}
.rCtl button{height:42px;min-width:52px;padding:0 14px;border-radius:12px;border:0;background:rgba(255,255,255,.12);color:#fff;font:inherit;font-weight:700;cursor:pointer}`;
document.head.appendChild(css);
})();
