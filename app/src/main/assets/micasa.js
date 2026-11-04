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

setInterval(() => {
  if (!F.cfg.casaOn) return;
  const d = lectura();
  if (d) { ultimo = d; if (Date.now() - enviadoAt > CADA) F.casaEnviar(); }
  else if (pendiente) F.casaEnviar();
}, 30000);
})();
