/**
 * utilidades de animación y cálculo para el Visualizador MIDI.
 * Separamos estas funciones del script principal para mejorar
 * la modularidad y facilitar su reutilización en pruebas.
 */

(function (global) {
// Integración de nuevas figuras
// En navegadores no existe `require`, así que se intenta obtener la
// función desde el objeto global si no está disponible CommonJS.
let drawSoloEspressivo;
if (typeof require !== 'undefined') {
  ({ drawSoloEspressivo } = require('./soloEspressivo.js'));
} else {
  drawSoloEspressivo = global.drawSoloEspressivo;
}

// Cache simple para evitar recalcular ajustes de color
const colorCache = new Map();

function adjustColorBrightness(color, factor) {
  const key = `${color}_${factor}`;
  if (colorCache.has(key)) return colorCache.get(key);
  const num = parseInt(color.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const adjust = (c) =>
    factor >= 0 ? Math.round(c + (255 - c) * factor) : Math.round(c * (1 + factor));
  r = Math.min(255, Math.max(0, adjust(r)));
  g = Math.min(255, Math.max(0, adjust(g)));
  b = Math.min(255, Math.max(0, adjust(b)));
  const result = `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  colorCache.set(key, result);
  return result;
}

// Interpola entre dos colores hexadecimales según un factor [0,1]
function interpolateColor(color1, color2, factor) {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Luminancia relativa de un color hex
function getLuminance(color) {
  const num = parseInt(color.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const srgb = [r, g, b].map((c) => {
    const chan = c / 255;
    return chan <= 0.03928
      ? chan / 12.92
      : Math.pow((chan + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// Ajusta colores brillantes y oscuros para garantizar contraste
const MIN_COLOR_CONTRAST = 0.2;

function validateColorRange(bright, dark) {
  let lumBright = getLuminance(bright);
  let lumDark = getLuminance(dark);
  if (lumBright < lumDark) {
    [bright, dark] = [dark, bright];
    [lumBright, lumDark] = [lumDark, lumBright];
  }
  let diff = lumBright - lumDark;
  let iterations = 0;
  while (diff < MIN_COLOR_CONTRAST && iterations < 20) {
    bright = adjustColorBrightness(bright, 0.05);
    dark = adjustColorBrightness(dark, -0.05);
    lumBright = getLuminance(bright);
    lumDark = getLuminance(dark);
    diff = lumBright - lumDark;
    iterations++;
    if (bright === '#ffffff' && dark === '#000000') break;
  }
  return { bright, dark };
}

// Parámetros configurables de opacidad
let opacityScale = { edge: 0.05, mid: 0.7 };

function setOpacityScale(edge, mid) {
  opacityScale = { edge, mid };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('opacityScale', JSON.stringify(opacityScale));
  }
}

function getOpacityScale() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('opacityScale');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (
          typeof parsed.edge === 'number' &&
          typeof parsed.mid === 'number'
        ) {
          opacityScale = parsed;
        }
      } catch {}
    }
  }
  return opacityScale;
}

getOpacityScale();

// Calcula opacidad según la distancia de la nota a la línea de presente
function computeOpacity(xStart, xEnd, canvasWidth) {
  const center = canvasWidth / 2;
  if (xStart <= center && xEnd >= center) return 1;
  const noteCenter = (xStart + xEnd) / 2;
  const dist = Math.abs(noteCenter - center);
  const maxDist = canvasWidth / 2;
  const progress = 1 - Math.min(dist / maxDist, 1);
  return opacityScale.edge + (opacityScale.mid - opacityScale.edge) * progress;
}

// Control global para el efecto "bump"
let bumpControl = 1;

function setBumpControl(value) {
  bumpControl = value;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('bumpControl', String(bumpControl));
  }
}

function getBumpControl() {
  if (typeof localStorage !== 'undefined') {
    const stored = parseFloat(localStorage.getItem('bumpControl'));
    if (!isNaN(stored)) bumpControl = stored;
  }
  return bumpControl;
}

getBumpControl();

// Calcula la altura con efecto "bump" para una nota en reproducción
// "bump" indica el incremento inicial de altura (0.5 = +50%)
function computeBumpHeight(baseHeight, currentSec, start, end, bump = 0.5) {
  const amount = bump * bumpControl;
  const duration = (end - start) * bumpControl;
  if (amount <= 0 || duration <= 0) return baseHeight;
  if (currentSec < start || currentSec > start + duration) return baseHeight;
  const progress = (currentSec - start) / duration;
  const clamped = Math.min(Math.max(progress, 0), 1);
  return baseHeight * (1 + amount * (1 - clamped));
}

// Referencia de velocidad MIDI para altura 100%
let velocityBase = 67;

// Permite definir una nueva velocidad base
function setVelocityBase(value) {
  velocityBase = value;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('velocityBase', String(velocityBase));
  }
}

// Devuelve la velocidad base actual
function getVelocityBase() {
  if (typeof localStorage !== 'undefined') {
    const stored = parseInt(localStorage.getItem('velocityBase'), 10);
    if (!isNaN(stored)) {
      velocityBase = stored;
    }
  }
  return velocityBase;
}

// Escala la altura base de la nota según la velocidad MIDI
function computeVelocityHeight(baseHeight, velocity, reference = velocityBase) {
  return baseHeight * (velocity / reference);
}

// Control global del glow
let glowStrength = 1;

function setGlowStrength(value) {
  glowStrength = value;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('glowStrength', String(glowStrength));
  }
}

function getGlowStrength() {
  if (typeof localStorage !== 'undefined') {
    const stored = parseFloat(localStorage.getItem('glowStrength'));
    if (!isNaN(stored)) glowStrength = stored;
  }
  return glowStrength;
}

getGlowStrength();

// Calcula la intensidad del brillo en el NOTE ON
function computeGlowAlpha(currentSec, start, baseDuration = 0.2) {
  const duration = baseDuration * glowStrength;
  if (duration <= 0 || currentSec < start || currentSec > start + duration) return 0;
  const progress = (currentSec - start) / duration;
  return 1 - progress;
}

// Aplica un efecto de brillo con desenfoque alrededor de la figura
function applyGlowEffect(ctx, shape, x, y, width, height, alpha) {
  if (alpha <= 0 || glowStrength <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 20 * glowStrength;
  ctx.shadowColor = '#ffffff';
  ctx.fillStyle = '#ffffff';
  const w = width * glowStrength;
  const h = height * glowStrength;
  const offsetX = x - (w - width) / 2;
  const offsetY = y - (h - height) / 2;
  drawNoteShape(ctx, shape, offsetX, offsetY, w, h);
  ctx.restore();
}

// Dibuja una figura en el contexto del canvas según el tipo especificado
function drawNoteShape(ctx, shape, x, y, width, height, stroke = false) {
  ctx.beginPath();
  switch (shape) {
    case 'oval':
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      break;
    case 'capsule': {
      const r = Math.min(width, height) * 0.25;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
      ctx.lineTo(x + width, y + height - r);
      ctx.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
      ctx.lineTo(x + r, y + height);
      ctx.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
      ctx.lineTo(x, y + r);
      ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
      break;
    }
    case 'star': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const w = width / 2;
      const h = height / 2;
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + w * 0.2, cy - h * 0.2);
      ctx.lineTo(x + width, cy);
      ctx.lineTo(cx + w * 0.2, cy + h * 0.2);
      ctx.lineTo(cx, y + height);
      ctx.lineTo(cx - w * 0.2, cy + h * 0.2);
      ctx.lineTo(x, cy);
      ctx.lineTo(cx - w * 0.2, cy - h * 0.2);
      ctx.closePath();
      break;
    }
    case 'diamond': {
      const midX = x + width / 2;
      const midY = y + height / 2;
      ctx.moveTo(x, midY);
      ctx.lineTo(midX, y);
      ctx.lineTo(x + width, midY);
      ctx.lineTo(midX, y + height);
      ctx.closePath();
      break;
    }
    case 'circle':
      ctx.arc(x + width / 2, y + height / 2, height / 2, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(x, y, width, height);
      break;
    case 'star4': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const w = width / 2;
      const h = height / 2;
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + w * 0.3, cy);
      ctx.lineTo(x + width, cy);
      ctx.lineTo(cx, cy + h * 0.3);
      ctx.lineTo(cx, y + height);
      ctx.lineTo(cx - w * 0.3, cy);
      ctx.lineTo(x, cy);
      ctx.lineTo(cx, cy - h * 0.3);
      ctx.closePath();
      break;
    }
    case 'pentagon': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const r = Math.min(width, height) / 2;
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i * (2 * Math.PI)) / 5;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'soloEspressivo':
      drawSoloEspressivo(ctx, x, y, width, height);
      break;
    default:
      ctx.rect(x, y, width, height);
  }
  if (stroke) ctx.stroke();
  else ctx.fill();
}

const NON_STRETCHED_SHAPES = new Set(['circle', 'square', 'star4', 'pentagon']);

const SHAPE_OPTIONS = [
  { value: 'oval', label: 'Óvalo alargado' },
  { value: 'capsule', label: 'Cápsula alargada' },
  { value: 'star', label: 'Estrella alargada' },
  { value: 'diamond', label: 'Diamante alargado' },
  { value: 'circle', label: 'Círculo' },
  { value: 'square', label: 'Cuadrado' },
  { value: 'star4', label: 'Estrella 4 puntas' },
  { value: 'pentagon', label: 'Pentágono' },
  { value: 'soloEspressivo', label: 'Solo esspresivo' },
];

function getFamilyModifiers(family) {
  switch (family) {
    case 'Platillos':
      return { sizeFactor: 1.3, bump: 0.5 };
    case 'Auxiliares':
      return { sizeFactor: 1, bump: 0.8 };
    default:
      return { sizeFactor: 1, bump: 0.5 };
  }
}

// Calcula el ancho base de la nota en píxeles
function computeNoteWidth(note, noteHeight, pixelsPerSecond) {
  const { sizeFactor } = getFamilyModifiers(note.family);
  const baseHeight = noteHeight * sizeFactor;
  if (NON_STRETCHED_SHAPES.has(note.shape)) {
    return baseHeight;
  }
  return (note.end - note.start) * pixelsPerSecond;
}

// Calcula dimensiones del canvas según relación de aspecto y modo de pantalla
function calculateCanvasSize(
  aspect = '16:9',
  baseHeight = 720,
  fullScreen = false,
  viewportWidth = 0,
  viewportHeight = 0,
  dpr = 1
) {
  const ratio = aspect === '9:16' ? 9 / 16 : 16 / 9;
  let styleWidth;
  let styleHeight;
  if (!fullScreen) {
    styleHeight = baseHeight;
    styleWidth = Math.round(baseHeight * ratio);
  } else {
    let width = viewportWidth;
    let height = width / ratio;
    if (height > viewportHeight) {
      height = viewportHeight;
      width = height * ratio;
    }
    styleWidth = Math.round(width);
    styleHeight = Math.round(height);
  }
  return {
    width: Math.round(styleWidth * dpr),
    height: Math.round(styleHeight * dpr),
    styleWidth,
    styleHeight,
  };
}

// Calcula un nuevo offset al buscar hacia adelante o atrás
function computeSeekOffset(startOffset, delta, duration, trimOffset = 0) {
  const maxOffset = Math.max(0, duration - trimOffset);
  return Math.min(Math.max(0, startOffset + delta), maxOffset);
}

// Reinicia el offset de reproducción al inicio
function resetStartOffset() {
  return 0;
}

// Determina si se puede iniciar la reproducción
// Devuelve true si existe un buffer de audio o al menos una nota
function canStartPlayback(audioBuffer, notes) {
  return !!(audioBuffer || (Array.isArray(notes) && notes.length > 0));
}

// Inicia un bucle de animación a fps constantes utilizando setInterval y rAF
function startFixedFPSLoop(callback, fps = 60) {
  const interval = 1000 / fps;
  const id = setInterval(() => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(callback);
    } else {
      callback();
    }
  }, interval);
  return () => clearInterval(id);
}

// Preprocesa el mapa de tempo agregando acumulados de segundos
function preprocessTempoMap(tempoMap, timeDivision) {
  let lastTick = 0;
  let lastTempo = tempoMap[0].microsecondsPerBeat;
  let seconds = 0;
  return tempoMap.map((ev) => {
    const secPerTick = lastTempo / 1e6 / timeDivision;
    seconds += (ev.time - lastTick) * secPerTick;
    lastTick = ev.time;
    lastTempo = ev.microsecondsPerBeat;
    return { ...ev, seconds };
  });
}

// Convierte ticks de MIDI a segundos utilizando un mapa de tempo (preprocesado)
function ticksToSeconds(tick, tempoMap, timeDivision) {
  if (!tempoMap || tempoMap.length === 0) {
    return (tick / timeDivision) * 0.5; // 120 BPM por defecto
  }
  const map = 'seconds' in tempoMap[0] ? tempoMap : preprocessTempoMap(tempoMap, timeDivision);
  let last = map[0];
  for (let i = 0; i < map.length; i++) {
    if (tick < map[i].time) break;
    last = map[i];
  }
  const secPerTick = last.microsecondsPerBeat / 1e6 / timeDivision;
  return last.seconds + (tick - last.time) * secPerTick;
}

const utils = {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  applyGlowEffect,
  drawNoteShape,
  adjustColorBrightness,
  interpolateColor,
  getLuminance,
  validateColorRange,
  computeVelocityHeight,
  setVelocityBase,
  getVelocityBase,
  setOpacityScale,
  getOpacityScale,
  setGlowStrength,
  getGlowStrength,
  setBumpControl,
  getBumpControl,
  NON_STRETCHED_SHAPES,
  SHAPE_OPTIONS,
  getFamilyModifiers,
  computeNoteWidth,
  calculateCanvasSize,
  computeSeekOffset,
  resetStartOffset,
  canStartPlayback,
  startFixedFPSLoop,
  preprocessTempoMap,
  ticksToSeconds,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = utils;
} else {
  global.utils = utils;
}
})(typeof globalThis !== 'undefined' ? globalThis : this);

