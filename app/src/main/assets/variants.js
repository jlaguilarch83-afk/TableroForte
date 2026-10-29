/* Tablero Forte · 80 diseños más: 8 estilos × 10 paletas, y la pantalla "Datos completos".
   Se arman con las mismas herramientas de dibujo, así la app casi no crece. */
(function () {
'use strict';
const F = window.F, K = F.K;
const n = (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toFixed(d);
const clamp = F.clamp;

const PALETAS = [
  { id: 'artico',   nom: 'Ártico',    bg0: '#f4f7fb', bg1: '#dde5ef', fg: '#132033', mute: '#6c7c92', acc: '#1f6bff', acc2: '#00b8d9', trk: '#cfd8e4', red: '#e5352b', claro: true },
  { id: 'noche',    nom: 'Medianoche',bg0: '#050a18', bg1: '#0b1630', fg: '#e8f0ff', mute: '#7f93b8', acc: '#38c8ff', acc2: '#5c7cff', trk: '#16223f', red: '#ff4058' },
  { id: 'lava',     nom: 'Lava',      bg0: '#0a0705', bg1: '#1d0f06', fg: '#fff3e6', mute: '#b08a6a', acc: '#ff7a1a', acc2: '#ffcc33', trk: '#2c1a0e', red: '#ff3b2f' },
  { id: 'esmeralda',nom: 'Esmeralda', bg0: '#03100b', bg1: '#082418', fg: '#e7fff3', mute: '#78b298', acc: '#22e39a', acc2: '#b6ff5a', trk: '#113324', red: '#ff5470' },
  { id: 'purpura',  nom: 'Púrpura',   bg0: '#0c0518', bg1: '#1c0b35', fg: '#f6eaff', mute: '#a487c9', acc: '#c45bff', acc2: '#ff5bd2', trk: '#2a1647', red: '#ff3d6e' },
  { id: 'oro',      nom: 'Oro',       bg0: '#070605', bg1: '#15110a', fg: '#fff6df', mute: '#a8956a', acc: '#e8b84a', acc2: '#fff0a8', trk: '#272013', red: '#ff5a3c' },
  { id: 'grafito',  nom: 'Grafito',   bg0: '#16181b', bg1: '#24272c', fg: '#f2f3f5', mute: '#8b919a', acc: '#ffffff', acc2: '#b8c0cc', trk: '#33373e', red: '#ff4a4a' },
  { id: 'hielo',    nom: 'Hielo',     bg0: '#eef5f5', bg1: '#d3e6e6', fg: '#0f2a2c', mute: '#5e8285', acc: '#0aa5a8', acc2: '#3fd0c9', trk: '#c3dadb', red: '#e0453a', claro: true },
  { id: 'fuego',    nom: 'Fuego',     bg0: '#120203', bg1: '#2b0507', fg: '#fff1e8', mute: '#c78678', acc: '#ff2d2d', acc2: '#ffd21f', trk: '#3a0c0f', red: '#ffd21f' },
  { id: 'oceano',   nom: 'Océano',    bg0: '#021018', bg1: '#032636', fg: '#e6fbff', mute: '#6fa8bb', acc: '#00d4ff', acc2: '#00ffb2', trk: '#0b3445', red: '#ff5a5a' }
];

const fondo = P => (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w * .3, h);
  g.addColorStop(0, P.bg0); g.addColorStop(1, P.bg1);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
};
const tc = (V, P) => K.tempCol(V.coolant, P.acc2, P.fg, P.red);
const fuelCol = (V, P) => V.fuel != null && V.fuel < 15 ? P.red : P.acc;
function dato(c, P, x, y, label, val, align = 'center', size = 40) {
  K.txt(c, label, x, y, 16, P.mute, align, 700);
  K.txt(c, val, x, y + size * .95, size, P.fg, align, 700);
}

/* ---- estilos ---- */
const ESTILOS = {
  // 1 · un arco grande de rpm con la velocidad al centro
  arco(c, V, P) {
    K.arcG(c, { cx: 800, cy: 330, r: 245, a0: 135, a1: 405, v: V.rpm, max: 8000, w: 26, track: P.trk, col: [P.acc, P.acc2], glow: P.claro ? null : P.acc, cap: 'round',
      red: { from: 6500, col: P.red, r: 272, w: 6 },
      ticks: { every: 500, major: 1000, col: P.mute, mcol: P.fg, r: 222, labels: { r: 185, size: 30, col: P.fg, rcol: P.red, fmt: v => v / 1000 } } });
    K.txt(c, Math.round(V.speed), 800, 320, 150, P.fg, 'center', 700);
    K.txt(c, 'km/h', 800, 410, 24, P.mute, 'center', 600);
    dato(c, P, 250, 200, 'MOTOR', `${n(V.coolant)}°`); dato(c, P, 250, 360, 'KM/L', n(V.kml, 1));
    dato(c, P, 1350, 200, 'GASOLINA', `${n(V.fuel)}%`); dato(c, P, 1350, 360, 'BATERÍA', `${n(V.volt, 1)}V`);
    K.txt(c, V.clock, 800, 560, 26, P.mute, 'center', 600);
  },
  // 2 · dos relojes con aguja
  gemelos(c, V, P) {
    const base = { face: P.bg1, tick: P.fg, label: P.fg, needle: P.acc, hub: [P.acc2, P.bg0], needleGlow: P.claro ? null : P.acc, fam: 'Saira' };
    K.analog(c, Object.assign({}, base, { cx: 430, cy: 310, r: 250, v: V.speed, max: 220, every: 10, major: 20, unit: 'km/h' }));
    K.analog(c, Object.assign({}, base, { cx: 1170, cy: 310, r: 250, v: V.rpm, max: 8000, every: 250, major: 1000, fmt: v => v / 1000, unit: 'rpm x1000', red: { from: 6500, col: P.red } }));
    K.txt(c, Math.round(V.speed), 430, 310 + 150, 48, P.fg, 'center', 700);
    K.txt(c, `${n(V.coolant)}°  ·  ${n(V.fuel)}%`, 800, 300, 26, P.fg, 'center', 700);
    K.txt(c, V.clock, 800, 60, 26, P.mute, 'center', 600);
  },
  // 3 · digital con barra de rpm
  digital(c, V, P) {
    K.txt(c, Math.round(V.speed), 560, 290, 260, P.fg, 'center', 800, 'Saira', 'middle', 'condensed');
    K.txt(c, 'KM/H', 560, 440, 30, P.acc, 'center', 800);
    const segs = 32, f = clamp(V.rpm / 8000, 0, 1);
    K.leds(c, 140, 520, 1320, 34, segs, f, k => k > .8 ? P.red : k > .6 ? P.acc2 : P.acc, P.trk, 6);
    K.txt(c, `${Math.round(V.rpm / 10) * 10} RPM`, 140, 500, 22, P.mute, 'left', 700);
    const rows = [['RENDIMIENTO', `${n(V.kml, 1)} km/L`], ['MOTOR', `${n(V.coolant)} °C`], ['GASOLINA', `${n(V.fuel)} %`], ['BATERÍA', `${n(V.volt, 1)} V`]];
    rows.forEach(([l, v], i) => { K.txt(c, l, 1050, 90 + i * 100, 16, P.mute, 'left', 700); K.txt(c, v, 1050, 128 + i * 100, 40, P.fg, 'left', 700); });
  },
  // 4 · anillos concéntricos
  anillos(c, V, P) {
    const R = [[250, V.rpm / 8000, P.acc, 'RPM'], [205, (V.fuel || 0) / 100, fuelCol(V, P), 'GAS'], [160, V.coolant == null ? 0 : (V.coolant - 40) / 90, tc(V, P), 'MOTOR']];
    R.forEach(([r, f, col]) => {
      K.arc(c, 800, 320, r, 0, 360, P.trk, 30);
      if (f > .003) K.glow(c, P.claro ? 'transparent' : col, 12, () => K.arc(c, 800, 320, r, -90, -90 + 360 * clamp(f, 0, 1), col, 30, 'round'));
    });
    K.txt(c, Math.round(V.speed), 800, 312, 110, P.fg, 'center', 800);
    K.txt(c, 'km/h', 800, 380, 22, P.mute, 'center', 600);
    [['RPM', Math.round(V.rpm), P.acc], ['GASOLINA', `${n(V.fuel)}%`, fuelCol(V, P)], ['MOTOR', `${n(V.coolant)}°C`, tc(V, P)]].forEach(([l, v, col], i) => {
      c.fillStyle = col; c.beginPath(); c.arc(1150, 160 + i * 120, 10, 0, Math.PI * 2); c.fill();
      K.txt(c, l, 1180, 150 + i * 120, 16, P.mute, 'left', 700); K.txt(c, String(v), 1180, 185 + i * 120, 40, P.fg, 'left', 700);
    });
    dato(c, P, 330, 200, 'KM/L', n(V.kml, 1), 'center', 48); dato(c, P, 330, 380, 'BATERÍA', `${n(V.volt, 1)}V`, 'center', 48);
  },
  // 5 · barras tipo ecualizador
  barras(c, V, P) {
    const B = [['RPM', V.rpm / 8000, Math.round(V.rpm)], ['ACEL', V.throttle / 100, `${n(V.throttle)}%`], ['CARGA', V.load / 100, `${n(V.load)}%`],
      ['MOTOR', V.coolant == null ? 0 : (V.coolant - 40) / 90, `${n(V.coolant)}°`], ['GAS', (V.fuel || 0) / 100, `${n(V.fuel)}%`], ['VOLT', V.volt == null ? 0 : (V.volt - 11) / 4, n(V.volt, 1)]];
    B.forEach(([l, f, v], i) => {
      const x = 640 + i * 150;
      for (let k = 0; k < 20; k++) {
        const on = k < Math.round(clamp(f, 0, 1) * 20);
        c.fillStyle = on ? (k >= 16 ? P.red : k >= 12 ? P.acc2 : P.acc) : P.trk;
        K.rr(c, x, 470 - k * 19, 100, 13, 3); c.fill();
      }
      K.txt(c, l, x + 50, 510, 18, P.mute, 'center', 700); K.txt(c, String(v), x + 50, 548, 26, P.fg, 'center', 700);
    });
    K.txt(c, Math.round(V.speed), 300, 270, 190, P.fg, 'center', 800);
    K.txt(c, 'km/h', 300, 380, 26, P.mute, 'center', 600);
    K.txt(c, `${n(V.kml, 1)} km/L · ${V.clock}`, 300, 460, 24, P.mute, 'center', 600);
  },
  // 6 · pantalla LCD de siete segmentos
  lcd(c, V, P) {
    const off = P.claro ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
    K.seg7(c, String(Math.round(V.speed)).padStart(3, ' '), 900, 120, 280, P.acc, off, 'right');
    K.txt(c, 'KM/H', 930, 380, 30, P.acc, 'left', 700, 'Share Tech Mono');
    const mini = [['RPM', V.rpm ? String(Math.round(V.rpm)) : '0'], ['°C', V.coolant == null ? '--' : String(Math.round(V.coolant))], ['%', V.fuel == null ? '--' : String(Math.round(V.fuel))], ['V', V.volt == null ? '--.-' : V.volt.toFixed(1)]];
    mini.forEach(([u, v], i) => { K.seg7(c, v, 1460, 90 + i * 120, 80, P.acc2, off, 'right'); K.txt(c, u, 1475, 150 + i * 120, 22, P.mute, 'left', 700, 'Share Tech Mono'); });
    K.leds(c, 120, 470, 860, 40, 24, V.rpm / 8000, k => k > .8 ? P.red : P.acc, off, 6);
    K.txt(c, V.clock, 120, 80, 30, P.mute, 'left', 700, 'Share Tech Mono');
  },
  // 7 · cinta horizontal que se desliza (velocímetro de banda)
  cinta(c, V, P) {
    c.save(); K.rr(c, 120, 190, 1360, 150, 20); c.fillStyle = P.trk; c.fill(); c.clip();
    const pxPor = 9;
    for (let v = Math.floor((V.speed - 80) / 5) * 5; v <= V.speed + 80; v += 5) {
      if (v < 0) continue;
      const x = 800 + (v - V.speed) * pxPor, big = v % 20 === 0;
      c.fillStyle = big ? P.fg : P.mute; c.fillRect(x - (big ? 2 : 1), 190, big ? 4 : 2, big ? 44 : 24);
      if (big) K.txt(c, String(v), x, 290, 34, P.fg, 'center', 700);
    }
    c.restore();
    c.fillStyle = P.acc; c.beginPath(); c.moveTo(800, 350); c.lineTo(780, 380); c.lineTo(820, 380); c.closePath(); c.fill();
    c.fillRect(798, 180, 4, 170);
    K.txt(c, `${Math.round(V.speed)} km/h`, 800, 110, 72, P.fg, 'center', 800);
    K.bar(c, 120, 440, 1360, 22, V.rpm / 8000, V.rpm > 6000 ? P.red : P.acc, P.trk, 11);
    K.txt(c, `${Math.round(V.rpm / 10) * 10} rpm`, 120, 420, 20, P.mute, 'left', 700);
    K.txt(c, `Motor ${n(V.coolant)}° · Gas ${n(V.fuel)}% · ${n(V.volt, 1)} V · ${n(V.kml, 1)} km/L`, 800, 530, 28, P.fg, 'center', 600);
  },
  // 8 · mira central con fuerza G y datos en esquinas
  mira(c, V, P) {
    K.gmeter(c, 800, 310, 230, V.gLat || 0, V.gLong || 0, P.acc, P.trk, P.acc2);
    K.arcG(c, { cx: 800, cy: 310, r: 270, a0: 200, a1: 340, v: V.rpm, max: 8000, w: 14, track: P.trk, col: [P.acc, P.red], cap: 'round' });
    K.txt(c, Math.round(V.speed), 800, 300, 120, P.fg, 'center', 800);
    K.txt(c, 'km/h', 800, 370, 22, P.mute, 'center', 600);
    dato(c, P, 220, 120, 'MOTOR', `${n(V.coolant)}°C`, 'left'); dato(c, P, 220, 420, 'BATERÍA', `${n(V.volt, 1)} V`, 'left');
    dato(c, P, 1380, 120, 'GASOLINA', `${n(V.fuel)} %`, 'right'); dato(c, P, 1380, 420, 'KM/L', n(V.kml, 1), 'right');
    K.txt(c, `G ${n(Math.hypot(V.gLong || 0, V.gLat || 0), 2)}`, 800, 590, 22, P.mute, 'center', 700);
  }
};
const NOMBRES = { arco: 'Arco', gemelos: 'Gemelos', digital: 'Digital', anillos: 'Anillos', barras: 'Barras', lcd: 'LCD', cinta: 'Cinta', mira: 'Mira' };

for (const e in ESTILOS) for (const P of PALETAS) {
  F.SKINS.push({ kind: 'canvas', id: `${e}-${P.id}`, name: `${NOMBRES[e]} ${P.nom}`, group: NOMBRES[e], back: fondo(P), draw: (c, V) => ESTILOS[e](c, V, P) });
}

/* ---- Datos completos: todo lo que manda el carro ---- */
const LISTA = [
  ['Velocidad', V => `${n(V.speed)} km/h`], ['Revoluciones', V => `${n(V.rpm)} rpm`], ['Acelerador', V => `${n(V.throttle)} %`],
  ['Carga del motor', V => `${n(V.load)} %`], ['Temp. motor', V => `${n(V.coolant)} °C`], ['Temp. aceite', () => `${n(F.D.oil)} °C`],
  ['Aire de admisión', V => `${n(V.intake)} °C`], ['Exterior', V => `${n(V.ambient)} °C`], ['Batería', V => `${n(V.volt, 2)} V`],
  ['Voltaje computadora', () => `${n(F.D.ecuvolt, 2)} V`], ['Gasolina', V => `${n(V.fuel)} %`], ['Autonomía', V => `${n(V.range)} km`],
  ['Flujo de aire (MAF)', () => `${n(F.D.maf, 1)} g/s`], ['Consumo', V => `${n(V.lh, 1)} L/h`], ['Rendimiento', V => `${n(V.kml, 1)} km/L`],
  ['Promedio', V => `${n(V.avg, 1)} km/L`], ['Avance de encendido', () => `${n(F.D.timing, 1)}°`], ['Tiempo con motor', () => F.D.runtime == null ? '—' : F.fmtTime(F.D.runtime)],
  ['Presión atmosférica', () => `${n(F.D.baro)} kPa`], ['Presión combustible', () => `${n(F.D.fuelpress)} kPa`], ['Ajuste corto', () => `${n(F.D.stft, 1)} %`],
  ['Ajuste largo', () => `${n(F.D.ltft, 1)} %`], ['Fuerza G', V => n(Math.hypot(V.gLong || 0, V.gLat || 0), 2)], ['Altitud', V => `${n(V.alt)} m`],
  ['Viaje', V => `${n(V.tripKm, 1)} km`], ['Gasto', V => `$${n(V.gasto, 2)}`], ['Fallas', V => String(V.codes || 0)], ['Calificación', V => `${V.score}/100`]
];
F.SKINS.push({ kind: 'canvas', id: 'datos', name: 'Datos completos', group: 'Especiales',
  back: fondo(PALETAS[1]),
  draw(c, V) {
    const P = PALETAS[1], cols = 4, cw = 360, ch = 70, x0 = 80, y0 = 62;
    LISTA.forEach(([l, fn], i) => {
      const x = x0 + (i % cols) * (cw + 20), y = y0 + Math.floor(i / cols) * (ch + 7);
      K.rr(c, x, y, cw, ch, 12); c.fillStyle = 'rgba(56,200,255,.06)'; c.fill();
      K.txt(c, l, x + 18, y + 24, 16, P.mute, 'left', 700);
      K.txt(c, fn(V), x + 18, y + 52, 28, P.fg, 'left', 700);
    });
  } });
})();
