/* Tablero Forte · Mi Casa
   Manda a la app de la casa la última lectura del Forte (gasolina, batería, alcance y dónde quedó).
   Se activa en ⋮ › Seguridad › Mi Casa, con el mismo PIN de la casa. */
(function () {
'use strict';
const F = window.F;
const URL = 'https://micasa-jl.netlify.app/api/casa?action=kia';
const CADA = 5 * 60e3;
let ultimo = null, enviadoAt = 0, pendiente = false, estado = 'Todavía no', enviando = false, okAntes = false;

function lectura() {
  if (F.sim || !F.conn || F.conn.kind !== 'ok') return null;
  const S = F.S, V = F.V || {};
  if (S.fuel == null && S.volt == null) return null;
  const g = F.gps && !F.gps.sim ? F.gps : null;
  return {
    gas: S.fuel, volt: S.volt, rango: V.range != null ? Math.round(V.range) : null, temp: S.coolant,
    lat: g ? +g.lat.toFixed(5) : null, lon: g ? +g.lon.toFixed(5) : null,
    fallas: Array.isArray(F.codes) ? F.codes.length : null
  };
}

F.casaEnviar = async function (manual) {
  const c = F.cfg;
  if (!c.casaOn) return;
  if (!c.casaPin) { if (manual) F.ui.toast('Escribe el PIN de Mi Casa'); return; }
  const d = lectura() || ultimo;
  if (!d) { if (manual) F.ui.toast('Conecta el OBD con el carro prendido'); return; }
  if (enviando) return;
  enviando = true;
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Casa-Pin': c.casaPin }, body: JSON.stringify(d) });
    if (r.status === 401) { estado = 'PIN incorrecto'; pendiente = false; if (manual) F.ui.toast('El PIN de Mi Casa no es correcto'); }
    else if (r.ok) { enviadoAt = Date.now(); pendiente = false; estado = 'Listo a las ' + new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }); if (manual) F.ui.toast('Mandado a Mi Casa'); }
    else { pendiente = true; estado = 'Error ' + r.status + ', reintento'; }
  } catch (e) {
    // Sin internet (por ejemplo, conectado al Wi-Fi de la Pruveeo): se reintenta después
    pendiente = true; estado = 'Sin internet, reintento';
    if (manual) F.ui.toast('Sin internet; lo mando en cuanto haya');
  }
  enviando = false;
};
F.casaEstado = () => estado;

// Al apagar el carro (se pierde el OBD) se manda la última lectura: así se ve dónde quedó
F.on('conn', (cn) => {
  const ok = cn && cn.kind === 'ok';
  if (okAntes && !ok && ultimo) { pendiente = true; setTimeout(() => F.casaEnviar(), 1500); }
  okAntes = ok;
});

// ---------- Llegada a la casa ----------
// A unos 500 m de la casa (viniendo de más de 800 m): Mi Casa prende las luces si es de noche,
// el carro avisa con voz y sale un aviso con botón "Abrir portón" (también en el reloj).
const BASE = 'https://micasa-jl.netlify.app/api/casa?action=';
let casaPos = null, casaPosAt = 0, lejos = false, llegandoAt = 0;
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
async function pedirCasa() {
  if (Date.now() - casaPosAt < 6 * 3600e3) return;
  casaPosAt = Date.now();
  try {
    const r = await fetch(BASE + 'casa', { headers: { 'X-Casa-Pin': F.cfg.casaPin } });
    const j = await r.json();
    if (j.ok) { casaPos = j.casa; F.casaLlegadaOn = !j.llegada || j.llegada.on !== false; }
  } catch (e) { casaPosAt = 0; }
}
async function llegando() {
  llegandoAt = Date.now();
  let r = null;
  try {
    const res = await fetch(BASE + 'llegando', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Casa-Pin': F.cfg.casaPin }, body: JSON.stringify({ who: 'Kia' }) });
    r = await res.json();
  } catch (e) { /* sin internet: igual se pregunta */ }
  const luces = r && r.luces && r.luces.length ? 'Prendí ' + r.luces.length + (r.luces.length === 1 ? ' luz. ' : ' luces. ') : '';
  const abierto = r && r.porton;
  F.speak('Llegando a casa. ' + luces + (abierto ? 'El portón ya está abierto.' : '¿Abro el portón? Toca el aviso.'));
  if (!abierto) {
    const txt = luces + 'Toca "Abrir portón" aquí o en tu reloj.' + (r && r.alarma && r.alarma !== 'disarm' ? ' Ojo: la alarma está armada.' : '');
    if (window.OBD && OBD.casaLlegada) { try { OBD.casaLlegada(F.cfg.casaPin, txt); } catch (e) {} }
    else F.ui.toast('Llegando a casa · abre el portón desde Mi Casa');
  }
}
setInterval(() => {
  const c = F.cfg;
  if (!c.casaOn || !c.casaPin || c.casaLlegada === false || F.casaLlegadaOn === false) return;
  pedirCasa();
  const g = F.gps;
  if (!casaPos || !g || g.sim || g.lat == null) return;
  const d = km(casaPos.lat, casaPos.lon, g.lat, g.lon);
  if (d > 0.8) lejos = true;
  if (lejos && d < 0.5 && Date.now() - llegandoAt > 10 * 60e3) { lejos = false; llegando(); }
}, 4000);
F.casaProbarLlegada = llegando;

setInterval(() => {
  if (!F.cfg.casaOn) return;
  const d = lectura();
  if (d) { ultimo = d; if (Date.now() - enviadoAt > CADA) F.casaEnviar(); }
  else if (pendiente) F.casaEnviar();
}, 30000);
})();
