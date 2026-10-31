/* Tablero Forte · fotos de placas: cuando la Pruveeo ve un carro justo enfrente y cerca,
   le toma foto, busca la placa, la lee, saca el color y el tipo, y lo guarda en una
   base de datos en el teléfono (menú ⋮ › Placas). Sale un recuadro chiquito con la foto. */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$, clamp = F.clamp;
if (F.cfg.placas === undefined) F.cfg.placas = false;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================= base de datos (IndexedDB, se queda en el teléfono) ================= */
const MAX = 1500;
let db = null, lista = [], listaOk = false;
function abrirDB() {
  if (db) return Promise.resolve(db);
  return new Promise(ok => {
    try {
      const r = indexedDB.open('forte-placas', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('placas', { keyPath: 'id' }); };
      r.onsuccess = () => { db = r.result; ok(db); };
      r.onerror = () => ok(null);
    } catch (e) { ok(null); }
  });
}
async function cargar() {
  const d = await abrirDB();
  if (d) {
    lista = await new Promise(ok => {
      try { const q = d.transaction('placas').objectStore('placas').getAll(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); }
      catch (e) { ok([]); }
    });
  }
  lista.sort((a, b) => b.t - a.t); listaOk = true;
  return lista;
}
async function poner(e) {
  const i = lista.findIndex(x => x.id === e.id);
  if (i >= 0) lista[i] = e; else lista.unshift(e);
  const d = await abrirDB(); if (!d) return;
  try {
    const st = d.transaction('placas', 'readwrite').objectStore('placas');
    st.put(e);
    while (lista.length > MAX) st.delete(lista.pop().id);
  } catch (err) {}
}
async function quitar(id) {
  lista = lista.filter(x => x.id !== id);
  const d = await abrirDB(); if (!d) return;
  try { d.transaction('placas', 'readwrite').objectStore('placas').delete(id); } catch (e) {}
}
cargar();
F.placasCuenta = () => lista.length;

/* ================= qué carro fotografiar ================= */
const tomadas = new Map();   // id de seguimiento -> hora
let ocupado = false;
F.on('objs', L => {
  if (!F.cfg.placas || ocupado || !F.pruveeo || !F.pruveeo.listo()) return;
  const src = F.pruveeo.lienzo, W = src.width;
  const ahora = Date.now();
  for (const [k, t] of tomadas) if (ahora - t > 5 * 60e3) tomadas.delete(k);
  // justo enfrente, cerca, de atrás (no cruzando), visto varios cuadros y suficientemente grande
  const o = L.filter(o => (o.cls === 'car' || o.cls === 'truck' || o.cls === 'bus' || o.cls === 'motorcycle') && !o.lado && (o.n || 0) >= 3 &&
      Math.abs(o.cx - .5) < .2 && o.dist < 16 && o.w * W >= 110 && o.bx != null && !tomadas.has(o.id))
    .sort((a, b) => a.dist - b.dist)[0];
  if (!o) return;
  tomadas.set(o.id, ahora);
  capturar(o, src);
});

async function capturar(o, src) {
  ocupado = true;
  try {
    const W = src.width, H = src.height;
    const x = clamp(o.bx * W - o.w * W * .05, 0, W - 2), y = clamp(o.by * H - o.h * H * .05, 0, H - 2);
    const w = Math.min(W - x, o.w * W * 1.1), h = Math.min(H - y, o.h * H * 1.1);
    // foto del carro
    const fc = document.createElement('canvas'), k = Math.min(1, 520 / w);
    fc.width = Math.round(w * k); fc.height = Math.round(h * k);
    fc.getContext('2d').drawImage(src, x, y, w, h, 0, 0, fc.width, fc.height);
    const noche = F.isNight ? F.isNight() : false;
    const color = colorCarro(src, x, y, w, h);
    const tipo = o.cls === 'motorcycle' ? 'Moto' : o.cls === 'bus' ? 'Autobús' : o.cls === 'truck' ? 'Pickup o camión' : (h / w > .95 ? 'Camioneta' : 'Auto');
    // placa
    let placa = '', placaFoto = '';
    const z = buscarPlaca(src, x, y, w, h, o.cls);
    if (z) {
      const pc = recortePlaca(src, z);
      placaFoto = pc.toDataURL('image/jpeg', .85);
      placa = await leerPlaca(pc);
    }
    // si la misma placa ya se guardó hace poco, solo se actualiza
    if (placa && lista.some(e => e.placa === placa && Date.now() - e.t < 20 * 60e3)) return;
    const g = F.gps && !F.gps.sim ? F.gps : null;
    const e = { id: Date.now() + '-' + o.id, t: Date.now(), placa, color: color + (noche ? ' (de noche)' : ''), tipo, modelo: '',
      foto: fc.toDataURL('image/jpeg', .78), placaFoto, lat: g ? +g.lat.toFixed(6) : null, lon: g ? +g.lon.toFixed(6) : null,
      vel: Math.round(F.S.speed || 0), dist: Math.round(o.dist) };
    await poner(e);
    mini(e);
  } catch (err) { console.error(err); }
  finally { ocupado = false; }
}

/* ================= dónde está la placa dentro del carro ================= */
// Las placas son un rectángulo claro de unos 2 a 1 con letras: muchas orillas verticales juntas.
function buscarPlaca(src, x, y, w, h, cls) {
  const rx = x + w * .1, ry = y + h * .32, rw = w * .8, rh = h * .66;
  const AW = 220, AH = Math.max(20, Math.round(AW * rh / rw));
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, rx, ry, rw, rh, 0, 0, AW, AH);
  const d = g.getImageData(0, 0, AW, AH).data, gr = new Float32Array(AW * AH);
  for (let i = 0; i < AW * AH; i++) gr[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
  // orillas verticales (trazos de las letras) y brillo, con tablas acumuladas para sumar rápido
  const E = new Float32Array((AW + 1) * (AH + 1)), B = new Float32Array((AW + 1) * (AH + 1));
  for (let yy = 0; yy < AH; yy++) {
    let fe = 0, fb = 0;
    for (let xx = 0; xx < AW; xx++) {
      const i = yy * AW + xx;
      const e = xx > 0 && xx < AW - 1 && Math.abs(gr[i + 1] - gr[i - 1]) > 45 ? 1 : 0;
      fe += e; fb += gr[i];
      E[(yy + 1) * (AW + 1) + xx + 1] = E[yy * (AW + 1) + xx + 1] + fe;
      B[(yy + 1) * (AW + 1) + xx + 1] = B[yy * (AW + 1) + xx + 1] + fb;
    }
  }
  const S = (T, x0, y0, x1, y1) => T[y1 * (AW + 1) + x1] - T[y0 * (AW + 1) + x1] - T[y1 * (AW + 1) + x0] + T[y0 * (AW + 1) + x0];
  // ancho esperado: placa de 30 cm sobre un carro de ~1.8 m (moto: placa chica, casi toda la moto)
  const frac = cls === 'motorcycle' ? .45 : cls === 'truck' || cls === 'bus' ? .14 : .18;
  const base = frac / .8 * AW;
  let mejor = null;
  for (const f of [.75, .9, 1.05, 1.25, 1.45, 1.7, 2]) {
    const pw = Math.round(base * f), ph = Math.max(6, Math.round(pw * .5));
    if (pw >= AW || ph >= AH) continue;
    for (let yy = 0; yy + ph <= AH; yy += 2) for (let xx = 0; xx + pw <= AW; xx += 2) {
      const area = pw * ph, den = S(E, xx, yy, xx + pw, yy + ph) / area;
      if (den < .1) continue;
      // las franjas de arriba y abajo deben tener menos letras que la placa
      const fh = Math.max(2, ph >> 2);
      const arr = yy - fh >= 0 ? S(E, xx, yy - fh, xx + pw, yy) / (pw * fh) : den;
      const abj = yy + ph + fh <= AH ? S(E, xx, yy + ph, xx + pw, yy + ph + fh) / (pw * fh) : den;
      const brillo = S(B, xx, yy, xx + pw, yy + ph) / area / 255;
      const sc = den - .6 * Math.max(arr, abj) + .15 * brillo - .05 * Math.abs((xx + pw / 2) / AW - .5);
      if (!mejor || sc > mejor.sc) mejor = { sc, xx, yy, pw, ph };
    }
  }
  if (!mejor || mejor.sc < .05) return null;
  // crecer a los lados mientras siga habiendo letras (por si la placa es más ancha que lo esperado)
  const den = S(E, mejor.xx, mejor.yy, mejor.xx + mejor.pw, mejor.yy + mejor.ph) / (mejor.pw * mejor.ph);
  const tira = (a, b) => S(E, a, mejor.yy, b, mejor.yy + mejor.ph) / ((b - a) * mejor.ph);
  const hay = (a, b) => a >= 0 && b <= AW && tira(a, b) > den * .22;
  while (mejor.xx > 6 && (hay(mejor.xx - 6, mejor.xx) || hay(mejor.xx - 12, mejor.xx - 6))) { mejor.xx -= 3; mejor.pw += 3; }
  while (mejor.xx + mejor.pw < AW - 6 && (hay(mejor.xx + mejor.pw, mejor.xx + mejor.pw + 6) || hay(mejor.xx + mejor.pw + 6, mejor.xx + mejor.pw + 12))) mejor.pw += 3;
  const kx = rw / AW, ky = rh / AH;
  return { x: rx + mejor.xx * kx, y: ry + mejor.yy * ky, w: mejor.pw * kx, h: mejor.ph * ky };
}
// recorte limpio para leer: más grande, en grises y con buen contraste
function recortePlaca(src, z) {
  const m = z.w * .06, x = Math.max(0, z.x - m), y = Math.max(0, z.y - m * .6), w = z.w + 2 * m, h = z.h + 1.2 * m;
  const H = 72, W = Math.round(H * w / h);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, x, y, w, h, 0, 0, W, H);
  const im = g.getImageData(0, 0, W, H), d = im.data, v = [];
  for (let i = 0; i < d.length; i += 4) v.push(d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11);
  const o = v.slice().sort((a, b) => a - b), lo = o[Math.floor(o.length * .05)], hi = o[Math.floor(o.length * .95)];
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const s = clamp((v[j] - lo) / Math.max(1, hi - lo) * 255, 0, 255); d[i] = d[i + 1] = d[i + 2] = s; }
  g.putImageData(im, 0, 0);
  return c;
}

/* ================= leer la placa (OCR) ================= */
let worker = null, cargandoOcr = null, ocrFalla = 0;
function cargarScript(src) { return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('no cargó')); document.head.appendChild(s); }); }
function ocr() {
  if (worker) return Promise.resolve(worker);
  if (cargandoOcr) return cargandoOcr;
  if (Date.now() - ocrFalla < 60e3) return Promise.resolve(null);
  cargandoOcr = (async () => {
    if (!window.Tesseract) await cargarScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    const w = await Tesseract.createWorker('eng');
    await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789', tessedit_pageseg_mode: '7' });
    worker = w; return w;
  })().catch(() => { ocrFalla = Date.now(); return null; }).finally(() => { cargandoOcr = null; });
  return cargandoOcr;
}
async function leerPlaca(canvas) {
  const w = await ocr(); if (!w) return '';
  try { const r = await w.recognize(canvas); return F.placaLimpia(r.data.text); } catch (e) { return ''; }
}
// formato de placa mexicana: ABC-123-D, ABC-12-34, ABC-1234…
F.placaLimpia = function (t) {
  let s = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 5 || s.length > 8) return '';
  const letras = (s.match(/[A-Z]/g) || []).length, nums = (s.match(/\d/g) || []).length;
  if (letras < 1 || nums < 2) return '';
  let m;
  if ((m = s.match(/^([A-Z]{3})(\d{3})([A-Z])$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^([A-Z]{3})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^([A-Z]{2,3})(\d{3,4})$/))) return `${m[1]}-${m[2]}`;
  return s;
};

/* ================= color del carro ================= */
function colorCarro(src, x, y, w, h) {
  const c = document.createElement('canvas'), N = 48; c.width = N; c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true });
  // franja de la carrocería: abajo de los vidrios y arriba de las llantas
  g.drawImage(src, x + w * .12, y + h * .42, w * .76, h * .3, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data, votos = {};
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i] / 255, G = d[i + 1] / 255, Bl = d[i + 2] / 255, mx = Math.max(R, G, Bl), mn = Math.min(R, G, Bl), V = mx, S = mx ? (mx - mn) / mx : 0;
    let H = mx === mn ? 0 : mx === R ? 60 * ((G - Bl) / (mx - mn)) : mx === G ? 60 * (2 + (Bl - R) / (mx - mn)) : 60 * (4 + (R - G) / (mx - mn)); if (H < 0) H += 360;
    let n;
    if (V < .2) n = 'Negro';
    else if (S < .16) n = V > .8 ? 'Blanco' : V > .55 ? 'Plata' : 'Gris';
    else if (H < 14 || H > 340) n = V < .4 ? 'Vino' : 'Rojo';
    else if (H < 40) n = V < .5 ? 'Café' : S < .38 ? 'Beige' : 'Naranja';
    else if (H < 68) n = S < .35 ? 'Beige' : V < .5 ? 'Café' : 'Amarillo';
    else if (H < 165) n = 'Verde';
    else if (H < 255) n = 'Azul';
    else n = 'Morado';
    votos[n] = (votos[n] || 0) + 1;
  }
  return Object.keys(votos).sort((a, b) => votos[b] - votos[a])[0] || '—';
}

/* ================= recuadro chiquito en pantalla ================= */
const mi = document.createElement('button'); mi.type = 'button'; mi.id = 'placaMini'; mi.hidden = true;
document.body.appendChild(mi);
let miT = null;
function mini(e) {
  mi.innerHTML = `<img alt="" src="${e.foto}"><span><b>${esc(e.placa || 'Placa sin leer')}</b><small>${esc(e.tipo)} · ${esc(e.color)}</small></span>`;
  mi.hidden = false; mi.classList.remove('fuera'); void mi.offsetWidth; mi.classList.add('entra');
  clearTimeout(miT); miT = setTimeout(() => { mi.hidden = true; }, 9000);
}
mi.onclick = () => { mi.hidden = true; F.placasVer(); };

/* ================= el apartado de placas ================= */
const pv = document.createElement('div'); pv.id = 'placasDB'; pv.hidden = true;
pv.innerHTML = `<div class="ph"><b id="pdTit">Placas</b><input type="search" id="pdBus" placeholder="Buscar placa, color, modelo…" aria-label="Buscar"><button type="button" id="pdX">Cerrar</button></div><div id="pdLista"></div>`;
document.body.appendChild(pv);
let mostrar = 60;
F.placasVer = async function () {
  pv.hidden = false; mostrar = 60;
  if (!listaOk) await cargar();
  pintar();
};
$('pdX').onclick = () => { pv.hidden = true; };
$('pdBus').oninput = () => { mostrar = 60; pintar(); };
const fecha = t => new Date(t).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' });
function pintar() {
  const q = $('pdBus').value.trim().toUpperCase().replace(/[^A-Z0-9 ÁÉÍÓÚÑ]/g, '');
  const L = lista.filter(e => !q || [e.placa, e.color, e.tipo, e.modelo].join(' ').toUpperCase().replace(/-/g, '').includes(q.replace(/ /g, '')) || [e.placa, e.color, e.tipo, e.modelo].join(' ').toUpperCase().includes(q));
  $('pdTit').textContent = `Placas (${lista.length})`;
  $('pdLista').innerHTML = !L.length ? `<p class="pdVacio">${lista.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay fotos. Prende "Foto al carro de enfrente" en el menú ⋮ y conecta la Pruveeo.'}</p>` :
    L.slice(0, mostrar).map(e => `<article data-id="${esc(e.id)}">
      <img class="pdFoto" alt="Carro" src="${e.foto}">
      <div class="pdDat">
        ${e.placaFoto ? `<img class="pdPlaca" alt="Placa" src="${e.placaFoto}">` : ''}
        <label>Placa<input data-k="placa" value="${esc(e.placa)}" placeholder="Sin leer: escríbela"></label>
        <label>Modelo<input data-k="modelo" value="${esc(e.modelo)}" placeholder="Marca y modelo"></label>
        <label>Color<input data-k="color" value="${esc(e.color)}"></label>
        <p>${esc(e.tipo)} · ${fecha(e.t)} · ${e.vel} km/h${e.lat != null ? ` · <a href="#" data-mapa="1">Ver lugar</a>` : ''}</p>
        <div class="pdBtns"><button type="button" data-a="comp">Compartir</button><button type="button" data-a="borrar">Borrar</button></div>
      </div></article>`).join('') + (L.length > mostrar ? `<button type="button" id="pdMas">Ver más (${L.length - mostrar})</button>` : '');
  $('pdLista').querySelectorAll('article').forEach(a => {
    const e = lista.find(x => x.id === a.dataset.id); if (!e) return;
    a.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => { e[i.dataset.k] = i.dataset.k === 'placa' ? i.value.toUpperCase().trim() : i.value.trim(); poner(e); });
    a.querySelector('[data-a="borrar"]').onclick = () => { quitar(e.id); pintar(); };
    a.querySelector('[data-a="comp"]').onclick = () => {
      const t = `Placa: ${e.placa || '(sin leer)'}\nModelo: ${e.modelo || '—'}\nColor: ${e.color}\nTipo: ${e.tipo}\nFecha: ${fecha(e.t)}\nVelocidad: ${e.vel} km/h` + (e.lat != null ? `\nLugar: https://maps.google.com/?q=${e.lat},${e.lon}` : '');
      if (window.OBD && OBD.share) OBD.share(t); else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => ui.toast('Copiado'));
    };
    const mp = a.querySelector('[data-mapa]');
    if (mp) mp.onclick = ev => { ev.preventDefault(); const u = `https://maps.google.com/?q=${e.lat},${e.lon}`; if (window.OBD && OBD.openUrl) OBD.openUrl(u); else window.open(u, '_blank', 'noopener'); };
  });
  const m = $('pdMas'); if (m) m.onclick = () => { mostrar += 60; pintar(); };
}

const css = document.createElement('style');
css.textContent = `
#placaMini{position:fixed;z-index:16;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(66px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:8px;
  width:min(230px,44vw);padding:6px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(12,17,27,.92);color:#fff;text-align:left;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)}
#placaMini[hidden]{display:none!important}
#placaMini.entra{animation:pmIn .35s ease-out}
@keyframes pmIn{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
#placaMini img{width:76px;height:56px;object-fit:cover;border-radius:9px;flex:none;background:#000}
#placaMini span{min-width:0;display:flex;flex-direction:column}
#placaMini b{font-size:16px;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#placaMini small{font-size:12px;color:#9fb0c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body:not([data-skin="tesla"]) #placaMini{bottom:calc(12px + env(safe-area-inset-bottom,0px))}
#placasDB{position:fixed;inset:0;z-index:46;background:#0b0f17;color:#e8edf5;display:flex;flex-direction:column}
#placasDB[hidden]{display:none!important}
#placasDB .ph{display:flex;gap:10px;align-items:center;padding:10px max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid rgba(255,255,255,.08)}
#placasDB .ph b{font-size:18px;white-space:nowrap}
#pdBus{flex:1;min-width:0;height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#111827;color:#fff;padding:0 12px;font:inherit;font-size:15px}
#pdX,#pdMas,#placasDB .pdBtns button{height:38px;padding:0 14px;border-radius:10px;border:0;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-weight:700;cursor:pointer}
#pdLista{flex:1;overflow:auto;padding:12px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px));display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:12px;align-content:start;-webkit-overflow-scrolling:touch}
#pdLista article{display:flex;gap:10px;background:#141b27;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px}
#pdLista .pdFoto{width:42%;max-width:180px;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:#000;flex:none}
#pdLista .pdDat{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
#pdLista .pdPlaca{height:30px;align-self:flex-start;border-radius:4px;background:#fff}
#pdLista label{display:flex;align-items:center;gap:6px;font-size:12px;color:#8ea0bb}
#pdLista label input{flex:1;min-width:0;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#0b1220;color:#fff;padding:0 8px;font:inherit;font-size:14px}
#pdLista input[data-k="placa"]{font-weight:800;letter-spacing:.05em}
#pdLista p{margin:0;font-size:12px;color:#8ea0bb}
#pdLista a{color:#7fb0ff}
#pdLista .pdBtns{display:flex;gap:6px}
#pdLista .pdBtns button{height:32px;padding:0 10px;font-size:13px}
#pdMas{grid-column:1/-1;justify-self:center}
.pdVacio{grid-column:1/-1;color:#8ea0bb;text-align:center;margin-top:30px}`;
document.head.appendChild(css);
})();
