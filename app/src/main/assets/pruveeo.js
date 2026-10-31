/* Tablero Forte · dashcam Pruveeo por Wi-Fi (chip Novatek, app TimaCam).
   La app de Android se conecta a la cámara y guarda el último cuadro; aquí se pide
   unas 8 veces por segundo para verlo en vivo y para que los avisos de la cámara
   (carros, carril, peatones, semáforo) usen la Pruveeo en lugar del teléfono. */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$;
if (F.cfg.pruveeo === undefined) F.cfg.pruveeo = false;

const P = { on: false, cargando: false, t: 0, est: null, diag: null, vista: 0 };
const lienzo = document.createElement('canvas'), lc = lienzo.getContext('2d');
function pedir() {
  if (!P.on || P.cargando) return;
  P.cargando = true;
  const im = new Image();
  im.onload = () => {
    P.cargando = false;
    if (!im.naturalWidth) return;
    if (lienzo.width !== im.naturalWidth || lienzo.height !== im.naturalHeight) { lienzo.width = im.naturalWidth; lienzo.height = im.naturalHeight; }
    lc.drawImage(im, 0, 0);
    P.t = performance.now();
    pintarVisor();
  };
  im.onerror = () => { P.cargando = false; };
  im.src = 'pruveeo/cuadro.jpg?t=' + Date.now();
}
setInterval(pedir, 120);
setInterval(() => {
  if (!P.on || !(window.OBD && OBD.camEstado)) return;
  try { P.est = JSON.parse(OBD.camEstado()); } catch (e) {}
  const e = $('pvEst'); if (e) e.textContent = F.pruveeo.motivo();
  const m = document.querySelector('#masPop .pvEst'); if (m) m.textContent = F.pruveeo.motivo();
}, 1000);

F.pruveeo = {
  lienzo,
  activo: () => P.on,
  listo: () => P.on && lienzo.width > 0 && performance.now() - P.t < 3000,
  motivo() {
    if (!P.on) return 'apagada';
    if (performance.now() - P.t < 3000) return 'en vivo';
    if (!window.OBD) return 'solo funciona en la app del teléfono';
    return P.est ? P.est.estado : 'conectando…';
  },
  diag: () => P.diag,
  conectar() { P.on = true; if (window.OBD && OBD.camConectar) OBD.camConectar(); },
  parar() { P.on = false; P.t = 0; if (window.OBD && OBD.camParar) OBD.camParar(); },
  cmd(c, par) { if (window.OBD && OBD.camCmd) OBD.camCmd(c, par == null ? '' : String(par)); },
  probar() {
    if (!(window.OBD && OBD.camProbar)) { ui.toast('La prueba solo funciona en la app del teléfono'); return; }
    P.diag = 'Probando…'; OBD.camProbar(); if (F.masMenu) F.masMenu.pintar();
  },
  ver: () => abrirVisor()
};
window.forteDash.camProbado = r => {
  const si = b => b ? 'sí' : 'no';
  P.diag = !r.wifi ? 'El teléfono no está conectado al Wi-Fi de la cámara.'
    : `Versión: ${r.version} · Estado: ${r.estado} · Página: ${si(r.http80)} · RTSP: ${si(r.rtsp554)} · MJPEG: ${si(r.mjpeg8192)} · 3333: ${si(r.p3333)} · Video: ${r.video}`;
  if (F.masMenu) F.masMenu.pintar();
};
window.forteDash.camRespuesta = (c, txt) => { if (c === 3028) ui.toast('Vista cambiada'); };

/* ---- foto de lo que ve la dashcam (el video lo sigue grabando ella) ---- */
F.pruveeoFoto = function (evento) {
  if (!F.pruveeo.listo()) { ui.toast('Conecta la Pruveeo para tomar fotos'); return; }
  const b64 = lienzo.toDataURL('image/jpeg', .9).split(',')[1], nombre = `${evento ? 'Evento' : 'Pruveeo'}_${Date.now()}.jpg`;
  let ok = false;
  if (window.OBD && OBD.guardarFoto) { try { ok = !!OBD.guardarFoto(b64, nombre); } catch (e) {} }
  else { const a = document.createElement('a'); a.href = 'data:image/jpeg;base64,' + b64; a.download = nombre; a.click(); ok = true; }
  F.alert('foto', ok ? (evento ? 'Foto del momento guardada' : 'Foto guardada en la galería') : 'No se pudo guardar la foto', ok ? 'ok' : 'warn');
  const f = $('flash'); if (f) { f.hidden = false; setTimeout(() => { f.hidden = true; }, 180); }
};

/* ---- visor en pantalla completa ---- */
const vis = document.createElement('div'); vis.id = 'pvVer'; vis.hidden = true;
vis.innerHTML = `<canvas id="pvCv" width="1280" height="720"></canvas>
<div class="pvBar"><span id="pvEst">apagada</span>
<button type="button" id="pvVista">Cambiar vista</button><button type="button" id="pvX">Cerrar</button></div>`;
document.body.appendChild(vis);
function abrirVisor() {
  if (!P.on) F.pruveeo.conectar();
  vis.hidden = false; $('pvEst').textContent = F.pruveeo.motivo(); pintarVisor();
}
function pintarVisor() {
  if (vis.hidden || !lienzo.width) return;
  const cv = $('pvCv');
  if (cv.width !== lienzo.width || cv.height !== lienzo.height) { cv.width = lienzo.width; cv.height = lienzo.height; }
  cv.getContext('2d').drawImage(lienzo, 0, 0);
}
$('pvX').onclick = () => { vis.hidden = true; };
// adelante, adentro o las dos juntas (en las Novatek de dos cámaras es el comando 3028)
$('pvVista').onclick = () => { P.vista = (P.vista + 1) % 3; F.pruveeo.cmd(3028, P.vista); };

/* ---- botón en la barra de Forte Tesla ---- */
F.pruveeoDock = function () {
  const d = $('dock'); if (!d) return;
  if (!d.querySelector('[data-b="pruveeo"]')) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.b = 'pruveeo';
    b.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/><path d="M6 4.5a6 6 0 0 1 7 0"/></svg><span>Pruveeo</span>';
    b.onclick = abrirVisor;
    d.insertBefore(b, d.firstChild);
  }
  const b = d.querySelector('[data-b="pruveeo"]');
  b.style.display = F.cfg.pruveeo ? '' : 'none';
  b.classList.toggle('on', F.pruveeo.listo());
};
setInterval(F.pruveeoDock, 1000); F.pruveeoDock();

const css = document.createElement('style');
css.textContent = `
#pvVer{position:fixed;inset:0;z-index:44;background:#000;display:flex;align-items:center;justify-content:center}
#pvVer[hidden]{display:none!important}
#pvCv{max-width:100%;max-height:100%;object-fit:contain;width:100%;height:100%}
#pvVer .pvBar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;align-items:center;padding:10px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));background:linear-gradient(transparent,rgba(0,0,0,.75))}
#pvEst{flex:1;color:#dfe6f0;font-size:15px;font-weight:600}
#pvVer button{height:44px;padding:0 16px;border-radius:12px;border:0;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-weight:700;cursor:pointer}`;
document.head.appendChild(css);

if (F.cfg.pruveeo && F.app) setTimeout(() => F.pruveeo.conectar(), 2500);
})();
