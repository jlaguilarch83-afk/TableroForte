/* Tablero Forte · aviso de cansancio: si cierras los ojos manejando, alarma y voz,
   y le avisa a la persona que elijas (SMS automático con hora, velocidad y ubicación;
   la foto por WhatsApp se abre lista cuando el carro se detiene).
   La cara se ve con la cámara de adentro de la Pruveeo o con la cámara frontal del teléfono. */
(function () {
'use strict';
const F = window.F, ui = F.ui, $ = F.$, K = F.K;
const clamp = F.clamp;
for (const [k, v] of Object.entries({ cansancio: false, ojosFuente: 'pruveeo', contactoCansancio: null })) if (F.cfg[k] === undefined) F.cfg[k] = v;

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELO = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const O = { modelo: null, cargando: false, on: false, cerradoDesde: 0, ultimaCara: 0, alarmaT: 0, avisoT: 0, estado: 'apagado', pendiente: null, stream: null, score: 0 };
const vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.setAttribute('playsinline', '');
const foto = document.createElement('canvas');

F.ojos = { estado: () => O.estado, on: () => O.on, score: () => O.score };

async function cargarModelo() {
  if (O.modelo || O.cargando) return O.modelo;
  O.cargando = true; O.estado = 'cargando el detector de ojos';
  try {
    const mp = await import(MP + '/vision_bundle.mjs');
    const files = await mp.FilesetResolver.forVisionTasks(MP + '/wasm');
    const op = d => ({ baseOptions: { modelAssetPath: MODELO, delegate: d }, outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 1 });
    try { O.modelo = await mp.FaceLandmarker.createFromOptions(files, op('GPU')); }
    catch (e) { O.modelo = await mp.FaceLandmarker.createFromOptions(files, op('CPU')); }
  } catch (e) {
    O.estado = 'no se pudo cargar el detector (necesita internet la primera vez)';
  } finally { O.cargando = false; }
  return O.modelo;
}

// de dónde sale la cara
async function fuente() {
  if (F.cfg.ojosFuente === 'pruveeo') {
    if (O.stream) { O.stream.getTracks().forEach(t => t.stop()); O.stream = null; }
    if (F.pruveeo && !F.pruveeo.activo()) F.pruveeo.conectar();
    return F.pruveeo && F.pruveeo.listo() ? F.pruveeo.lienzo : null;
  }
  if (!O.stream) {
    try {
      O.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      vid.srcObject = O.stream; await vid.play().catch(() => {});
    } catch (e) { O.estado = 'no pude abrir la cámara frontal'; return null; }
  }
  return vid.videoWidth ? vid : null;
}

async function ciclo() {
  if (!O.on) return;
  try {
    const m = await cargarModelo();
    const src = m ? await fuente() : null;
    if (m && !src) O.estado = F.cfg.ojosFuente === 'pruveeo' ? 'esperando el video de la Pruveeo' : 'esperando la cámara frontal';
    if (m && src) {
      const r = m.detectForVideo(src, performance.now());
      const bs = r.faceBlendshapes && r.faceBlendshapes[0];
      if (!bs) {
        O.score = 0; O.cerradoDesde = 0;
        O.estado = performance.now() - O.ultimaCara > 4000 ? (F.cfg.ojosFuente === 'pruveeo' ? 'no veo tu cara (toca "Cambiar vista" en la Pruveeo)' : 'no veo tu cara') : O.estado;
      } else {
        O.ultimaCara = performance.now();
        const sc = n => (bs.categories.find(c => c.categoryName === n) || {}).score || 0;
        O.score = (sc('eyeBlinkLeft') + sc('eyeBlinkRight')) / 2;
        const cerrado = O.score > .5;
        if (cerrado && !O.cerradoDesde) O.cerradoDesde = performance.now();
        if (!cerrado) O.cerradoDesde = 0;
        O.estado = cerrado ? 'ojos cerrados' : 'vigilando · ojos abiertos';
        const seg = O.cerradoDesde ? (performance.now() - O.cerradoDesde) / 1000 : 0;
        if (seg >= 1.5 && (F.S.speed || 0) >= 10) alarma(src);
      }
    }
  } catch (e) { O.estado = 'error: ' + (e.message || e); }
  setTimeout(ciclo, 150);
}

function alarma(src) {
  const t = performance.now();
  if (t - O.alarmaT > 1200) { O.alarmaT = t; F.beep('alarma'); }
  if (!alarma.voz || t - alarma.voz > 4000) {
    alarma.voz = t;
    F.alert('cansancio', '¡Despierta! Cerraste los ojos', 'crit', 'Despierta. No te duermas');
  }
  // a la persona elegida, máximo una vez cada 10 minutos
  if (Date.now() - O.avisoT > 10 * 60e3) { O.avisoT = Date.now(); avisarContacto(src); }
}

function avisarContacto(src) {
  const c = F.cfg.contactoCansancio || F.cfg.contacto;
  const g = F.gps && !F.gps.sim ? F.gps : null;
  const hora = new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const texto = `Aviso automático de Tablero Forte: cerré los ojos manejando mi Kia Forte a las ${hora}, iba a ${Math.round(F.S.speed || 0)} km/h.` +
    (g ? ` Ubicación: https://maps.google.com/?q=${g.lat.toFixed(6)},${g.lon.toFixed(6)}` : '');
  // foto del momento
  let b64 = '';
  try {
    const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
    foto.width = Math.min(960, w); foto.height = Math.round(foto.width * h / w);
    foto.getContext('2d').drawImage(src, 0, 0, foto.width, foto.height);
    b64 = foto.toDataURL('image/jpeg', .8).split(',')[1];
  } catch (e) {}
  let uri = '';
  if (b64 && window.OBD && OBD.guardarFoto) { try { uri = OBD.guardarFoto(b64, `Cansancio_${Date.now()}.jpg`); } catch (e) {} }
  if (!c) { ui.toast('Elige a quién avisar en el menú ⋮ › Cansancio'); return; }
  if (window.OBD && OBD.sms) { try { OBD.sms(c.tel, texto); } catch (e) {} }
  // WhatsApp con la foto se abre cuando el carro se detenga, para no quitarte el tablero manejando
  O.pendiente = { tel: c.tel, texto, uri, nombre: c.nombre || c.tel };
}
setInterval(() => {
  const p = O.pendiente;
  if (!p || (F.S.speed || 0) > 3) return;
  O.pendiente = null;
  const intl = String(p.tel).replace(/\D/g, '').replace(/^(\d{10})$/, '52$1');
  if (window.OBD && OBD.whatsappFoto && p.uri) OBD.whatsappFoto(intl, p.texto, p.uri);
  else if (window.OBD && OBD.whatsapp) OBD.whatsapp(intl, p.texto);
  else window.open(`https://wa.me/${intl}?text=${encodeURIComponent(p.texto)}`, '_blank', 'noopener');
  ui.toast(`WhatsApp listo para ${p.nombre}: solo toca enviar`);
}, 2000);

F.ojosAplicar = function () {
  const quiere = !!F.cfg.cansancio;
  if (quiere && !O.on) { O.on = true; O.estado = 'iniciando'; ciclo(); }
  if (!quiere && O.on) {
    O.on = false; O.estado = 'apagado'; O.cerradoDesde = 0;
    if (O.stream) { O.stream.getTracks().forEach(t => t.stop()); O.stream = null; }
  }
};
F.ojosProbar = () => { alarma.voz = 0; O.alarmaT = 0; F.beep('alarma'); F.alert('cansancio', '¡Despierta! Cerraste los ojos (prueba)', 'crit', 'Despierta. No te duermas'); };

// estado chiquito en Forte Tesla, abajo a la izquierda
F.on('teslaFx', c => {
  if (!O.on) return;
  const cerr = O.estado === 'ojos cerrados', ok = O.estado.startsWith('vigilando');
  K.txt(c, `Ojos: ${O.estado}`, 100, 606, 16, cerr ? '#e5352b' : ok ? (F.tesla ? F.tesla.P.mute : '#888') : '#e89a10', 'left', 700);
});

if (F.cfg.cansancio && F.app) setTimeout(F.ojosAplicar, 4000);
})();
