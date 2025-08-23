/**
 * utilidades de animación y cálculo para el Visualizador MIDI.
 * Separamos estas funciones del script principal para mejorar
 * la modularidad y facilitar su reutilización en pruebas.
 */

(function (global) {
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

// Calcula opacidad según la distancia de la nota a la línea de presente
function computeOpacity(xStart, xEnd, canvasWidth) {
  const center = canvasWidth / 2;
  if (xStart <= center && xEnd >= center) return 1;
  const noteCenter = (xStart + xEnd) / 2;
  const dist = Math.abs(noteCenter - center);
  const maxDist = canvasWidth / 2;
  const progress = 1 - Math.min(dist / maxDist, 1);
  return 0.05 + 0.65 * progress;
}

// Calcula la altura con efecto "bump" para una nota en reproducción
// "bump" indica el incremento inicial de altura (0.5 = +50%)
function computeBumpHeight(baseHeight, currentSec, start, end, bump = 0.5) {
  if (currentSec < start || currentSec > end) return baseHeight;
  const progress = (currentSec - start) / (end - start);
  const clamped = Math.min(Math.max(progress, 0), 1);
  return baseHeight * (1 + bump * (1 - clamped));
}

// Calcula la intensidad del brillo en el NOTE ON
function computeGlowAlpha(currentSec, start, glowDuration = 0.2) {
  if (currentSec < start || currentSec > start + glowDuration) return 0;
  const progress = (currentSec - start) / glowDuration;
  return 1 - progress;
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
    case 'triangle':
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y + height / 2);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      break;
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
  { value: 'triangle', label: 'Triángulo alargado' },
  { value: 'circle', label: 'Círculo' },
  { value: 'square', label: 'Cuadrado' },
  { value: 'star4', label: 'Estrella 4 puntas' },
  { value: 'pentagon', label: 'Pentágono' },
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

const utils = {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  drawNoteShape,
  adjustColorBrightness,
  NON_STRETCHED_SHAPES,
  SHAPE_OPTIONS,
  getFamilyModifiers,
  computeNoteWidth,
  calculateCanvasSize,
  computeSeekOffset,
  resetStartOffset,
  canStartPlayback,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = utils;
} else {
  global.utils = utils;
}
})(typeof globalThis !== 'undefined' ? globalThis : this);

