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
let opacityScale = { edge: 0, mid: 0.5 };

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
  const noteCenter = (xStart + xEnd) / 2;
  const dist = Math.abs(noteCenter - center);
  const maxDist = canvasWidth / 2;
  const progress = 1 - Math.min(dist / maxDist, 1);
  return opacityScale.edge + (opacityScale.mid - opacityScale.edge) * progress;
}

// Control global y por familia para el efecto "bump"
let bumpControl = 1;
let familyBumpControl = {};

function persistBumpControl() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      'bumpControl',
      JSON.stringify({ global: bumpControl, families: familyBumpControl })
    );
  }
}

function loadBumpControl() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('bumpControl');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'number') {
        bumpControl = parsed;
      } else {
        if (typeof parsed.global === 'number') bumpControl = parsed.global;
        if (parsed.families && typeof parsed.families === 'object') {
          familyBumpControl = Object.entries(parsed.families).reduce(
            (acc, [fam, val]) => {
              if (typeof val === 'number' && isFinite(val)) {
                acc[fam] = val;
              }
              return acc;
            },
            {},
          );
        }
      }
    } catch {
      const numeric = parseFloat(stored);
      if (!isNaN(numeric)) bumpControl = numeric;
    }
  }
}

function setBumpControl(value, family) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) return;
  if (family) {
    familyBumpControl[family] = value;
  } else {
    bumpControl = value;
    familyBumpControl = {};
  }
  persistBumpControl();
}

function getBumpControl(family) {
  loadBumpControl();
  if (family) {
    const override = familyBumpControl[family];
    if (typeof override === 'number' && isFinite(override)) {
      return override;
    }
  }
  return bumpControl;
}

function getBumpControlConfig() {
  loadBumpControl();
  return { global: bumpControl, families: { ...familyBumpControl } };
}

loadBumpControl();

// Calcula la altura con efecto "bump" para una nota en reproducción
// "bump" indica el incremento inicial de altura (0.5 = +50%)
function computeBumpHeight(baseHeight, currentSec, start, end, bump = 0.5, family) {
  const control = getBumpControl(family);
  const amount = bump * control;
  const duration = (end - start) * control;
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

// Escala global o por familia para la altura de las figuras
let heightScale = 1;
let familyHeightScale = {};

function persistHeightScale() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      'heightScale',
      JSON.stringify({ global: heightScale, families: familyHeightScale })
    );
  }
}

function setHeightScale(value, family) {
  if (typeof value !== 'number' || value <= 0) return;
  if (family) {
    familyHeightScale[family] = value;
  } else {
    heightScale = value;
    familyHeightScale = {};
  }
  persistHeightScale();
}

function loadHeightScale() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('heightScale');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed.global === 'number') heightScale = parsed.global;
      if (parsed.families && typeof parsed.families === 'object') {
        familyHeightScale = parsed.families;
      }
    } catch {}
  }
}

function getHeightScale(family) {
  loadHeightScale();
  if (family) return familyHeightScale[family] || heightScale;
  return heightScale;
}

function getHeightScaleConfig() {
  loadHeightScale();
  return { global: heightScale, families: { ...familyHeightScale } };
}

loadHeightScale();

// Control global y por familia del glow
let glowStrength = 1;
let familyGlowStrength = {};

function persistGlowStrength() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      'glowStrength',
      JSON.stringify({ global: glowStrength, families: familyGlowStrength })
    );
  }
}

function loadGlowStrength() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('glowStrength');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'number') {
        glowStrength = parsed;
      } else {
        if (typeof parsed.global === 'number') glowStrength = parsed.global;
        if (parsed.families && typeof parsed.families === 'object') {
          familyGlowStrength = Object.entries(parsed.families).reduce(
            (acc, [fam, val]) => {
              if (typeof val === 'number' && isFinite(val)) {
                acc[fam] = val;
              }
              return acc;
            },
            {},
          );
        }
      }
    } catch {
      const numeric = parseFloat(stored);
      if (!isNaN(numeric)) glowStrength = numeric;
    }
  }
}

function setGlowStrength(value, family) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) return;
  if (family) {
    familyGlowStrength[family] = value;
  } else {
    glowStrength = value;
    familyGlowStrength = {};
  }
  persistGlowStrength();
}

function getGlowStrength(family) {
  loadGlowStrength();
  if (family) {
    const override = familyGlowStrength[family];
    if (typeof override === 'number' && isFinite(override)) {
      return override;
    }
  }
  return glowStrength;
}

function getGlowStrengthConfig() {
  loadGlowStrength();
  return { global: glowStrength, families: { ...familyGlowStrength } };
}

loadGlowStrength();

// Calcula la intensidad del brillo en el NOTE ON
function computeGlowAlpha(currentSec, start, baseDuration = 0.2, family) {
  const strength = getGlowStrength(family);
  const duration = baseDuration * strength;
  if (duration <= 0 || currentSec < start || currentSec > start + duration) return 0;
  const progress = (currentSec - start) / duration;
  return 1 - progress;
}

// Aplica un efecto de brillo con desenfoque alrededor de la figura
function applyGlowEffect(ctx, shape, x, y, width, height, alpha, family) {
  const strength = getGlowStrength(family);
  if (alpha <= 0 || strength <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 20 * strength;
  ctx.shadowColor = '#ffffff';
  ctx.fillStyle = '#ffffff';
  const w = width;
  const h = height * strength;
  const offsetX = x;
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
    case 'circle': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const rx = Math.max(width / 2, 0);
      const ry = Math.max(height / 2, 0);
      if (Math.abs(rx - ry) < 1e-6) {
        ctx.arc(cx, cy, rx, 0, Math.PI * 2);
      } else {
        ctx.save();
        ctx.translate(cx, cy);
        const scaleX = rx > 0 ? rx / Math.max(ry, 1e-6) : 1;
        ctx.scale(scaleX, 1);
        ctx.arc(0, 0, ry, 0, Math.PI * 2);
        ctx.restore();
      }
      break;
    }
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

const SHAPE_OPTIONS = [
  { value: 'oval', label: 'Óvalo alargado' },
  { value: 'capsule', label: 'Cápsula alargada' },
  { value: 'star', label: 'Estrella alargada' },
  { value: 'diamond', label: 'Diamante alargado' },
  { value: 'circle', label: 'Círculo' },
  { value: 'square', label: 'Cuadrado' },
  { value: 'star4', label: 'Estrella 4 puntas' },
  { value: 'pentagon', label: 'Pentágono' },
];

// Estado de alargamiento progresivo por figura alargada
const SHAPE_EXTENSION_DEFAULTS = {
  oval: true,
  capsule: true,
  star: true,
  diamond: true,
};
let shapeExtensions = { ...SHAPE_EXTENSION_DEFAULTS };
let familyShapeExtensions = {};

function loadShapeExtensions() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('shapeExtensions');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      shapeExtensions = { ...shapeExtensions, ...parsed };
    } catch {}
  }
  const byFamily = localStorage.getItem('familyShapeExtensions');
  if (byFamily) {
    try {
      const parsed = JSON.parse(byFamily);
      if (parsed && typeof parsed === 'object') {
        familyShapeExtensions = Object.entries(parsed).reduce(
          (acc, [fam, val]) => {
            if (typeof val === 'boolean') acc[fam] = val;
            return acc;
          },
          {},
        );
      }
    } catch {}
  }
}

function getShapeExtension(shape) {
  loadShapeExtensions();
  return shapeExtensions[shape] !== false;
}

function setShapeExtension(shape, enabled) {
  shapeExtensions[shape] = !!enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('shapeExtensions', JSON.stringify(shapeExtensions));
  }
}

function getShapeExtensions() {
  loadShapeExtensions();
  return { ...shapeExtensions };
}

function persistFamilyShapeExtensions() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      'familyShapeExtensions',
      JSON.stringify({ ...familyShapeExtensions })
    );
  }
}

function setFamilyExtension(family, enabled) {
  if (!family) return;
  if (typeof enabled === 'boolean') {
    familyShapeExtensions[family] = enabled;
  } else {
    delete familyShapeExtensions[family];
  }
  persistFamilyShapeExtensions();
}

function clearFamilyExtension(family) {
  setFamilyExtension(family, null);
}

function clearAllFamilyExtensions() {
  loadShapeExtensions();
  familyShapeExtensions = {};
  persistFamilyShapeExtensions();
}

function getFamilyExtension(family) {
  loadShapeExtensions();
  if (!family) return null;
  if (Object.prototype.hasOwnProperty.call(familyShapeExtensions, family)) {
    return familyShapeExtensions[family];
  }
  return null;
}

function getFamilyExtensionConfig() {
  loadShapeExtensions();
  return { ...familyShapeExtensions };
}

function isExtensionEnabledForFamily(shape, family) {
  const override = getFamilyExtension(family);
  if (typeof override === 'boolean') {
    return override;
  }
  return getShapeExtension(shape);
}

loadShapeExtensions();

const DEFAULT_LINE_SETTINGS = { enabled: false, opacity: 0.45, width: 1.5 };
let familyLineSettings = {};
let familyTravelSettings = {};
const DEFAULT_TRAVEL_EFFECT = true;

function sanitizeLineSettings(config = {}) {
  const sanitized = { ...DEFAULT_LINE_SETTINGS };
  if (typeof config.enabled === 'boolean') sanitized.enabled = config.enabled;
  if (typeof config.opacity === 'number' && isFinite(config.opacity)) {
    sanitized.opacity = Math.min(Math.max(config.opacity, 0), 1);
  }
  if (typeof config.width === 'number' && isFinite(config.width)) {
    sanitized.width = Math.max(config.width, 0.25);
  }
  return sanitized;
}

function loadFamilyLineSettings() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('familyLineSettings');
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === 'object') {
      familyLineSettings = Object.entries(parsed).reduce((acc, [family, cfg]) => {
        acc[family] = sanitizeLineSettings(cfg);
        return acc;
      }, {});
    }
  } catch {
    familyLineSettings = {};
  }
}

function persistFamilyLineSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('familyLineSettings', JSON.stringify(familyLineSettings));
}

function getFamilyLineSettings(family) {
  if (!Object.keys(familyLineSettings).length) loadFamilyLineSettings();
  const stored = familyLineSettings[family];
  return stored ? { ...stored } : { ...DEFAULT_LINE_SETTINGS };
}

function updateFamilyLineSettings(family, updates = {}) {
  const current = getFamilyLineSettings(family);
  const merged = sanitizeLineSettings({ ...current, ...updates });
  familyLineSettings[family] = merged;
  persistFamilyLineSettings();
  return merged;
}

function getAllFamilyLineSettings() {
  if (!Object.keys(familyLineSettings).length) loadFamilyLineSettings();
  return { ...familyLineSettings };
}

function setAllFamilyLineSettings(settings = {}) {
  familyLineSettings = Object.entries(settings || {}).reduce(
    (acc, [family, cfg]) => {
      acc[family] = sanitizeLineSettings(cfg);
      return acc;
    },
    {},
  );
  persistFamilyLineSettings();
}

function resetFamilyLineSettings() {
  familyLineSettings = {};
  persistFamilyLineSettings();
}

function loadFamilyTravelSettings() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('familyTravelSettings');
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === 'object') {
      familyTravelSettings = Object.entries(parsed).reduce((acc, [family, enabled]) => {
        acc[family] = !!enabled;
        return acc;
      }, {});
    }
  } catch {
    familyTravelSettings = {};
  }
}

function persistFamilyTravelSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('familyTravelSettings', JSON.stringify(familyTravelSettings));
}

function isTravelEffectEnabled(family) {
  if (!Object.keys(familyTravelSettings).length) loadFamilyTravelSettings();
  if (family && Object.prototype.hasOwnProperty.call(familyTravelSettings, family)) {
    return !!familyTravelSettings[family];
  }
  return DEFAULT_TRAVEL_EFFECT;
}

function setTravelEffectEnabled(family, enabled) {
  if (!family) return;
  familyTravelSettings[family] = !!enabled;
  persistFamilyTravelSettings();
}

function getTravelEffectSettings() {
  if (!Object.keys(familyTravelSettings).length) loadFamilyTravelSettings();
  return { ...familyTravelSettings };
}

function setTravelEffectSettings(settings = {}) {
  familyTravelSettings = Object.entries(settings || {}).reduce(
    (acc, [family, enabled]) => {
      acc[family] = !!enabled;
      return acc;
    },
    {},
  );
  persistFamilyTravelSettings();
}

function resetTravelEffectSettings() {
  familyTravelSettings = {};
  persistFamilyTravelSettings();
}

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
  const baseHeight = noteHeight * sizeFactor * getHeightScale(note.family);
  const durationWidth = Math.max(
    (note.end - note.start) * pixelsPerSecond,
    baseHeight,
  );
  if (!isExtensionEnabledForFamily(note.shape, note.family)) {
    return durationWidth;
  }
  return baseHeight;
}

// Calcula la posición y el ancho de una figura alargada considerando la línea de presente
function computeDynamicBounds(
  note,
  currentSec,
  canvasWidth,
  pixelsPerSecond,
  baseWidth,
  shape = note.shape
) {
  const center = canvasWidth / 2;
  const xStart = center + (note.start - currentSec) * pixelsPerSecond;
  const finalWidth = (note.end - note.start) * pixelsPerSecond;
  const effectiveShape = shape || note.shape;
  if (!isExtensionEnabledForFamily(effectiveShape, note.family)) {
    const width = finalWidth;
    return { xStart, xEnd: xStart + width, width };
  }
  if (xStart > center) {
    const width = baseWidth;
    return { xStart, xEnd: xStart + width, width };
  }
  const duration = Math.max(note.end - note.start, Number.EPSILON);
  const elapsed = Math.max(currentSec - note.start, 0);
  const progress = Math.min(elapsed / duration, 1);
  const width = baseWidth + progress * (finalWidth - baseWidth);
  const xEnd = xStart + width;
  return { xStart, xEnd, width };
}

// Compatibilidad: función específica para diamantes
function computeDiamondBounds(
  note,
  currentSec,
  canvasWidth,
  pixelsPerSecond,
  baseWidth
) {
  return computeDynamicBounds(
    note,
    currentSec,
    canvasWidth,
    pixelsPerSecond,
    baseWidth,
    'diamond'
  );
}

// Calcula dimensiones del canvas según relación de aspecto y modo de pantalla
function calculateCanvasSize(
  aspect = '16:9',
  baseHeight = 720,
  fullScreen = false,
  viewportWidth = 0,
  viewportHeight = 0,
  dpr = 1,
  superSampling = 1
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
    width: Math.round(styleWidth * dpr * superSampling),
    height: Math.round(styleHeight * dpr * superSampling),
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

// Detecta si el usuario prefiere reducir las animaciones
function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function startAutoFPSLoop(callback, minDt = 8, maxDt = 32) {
  if (prefersReducedMotion()) {
    callback(0, performance.now());
    return () => {};
  }

  let last = performance.now();
  let adaptiveMin = minDt;
  let adaptiveMax = maxDt;
  let sampleCount = 0;
  let sampleTotal = 0;
  let id;

  const clampDt = (value) => {
    const lower = Math.min(Math.max(adaptiveMin, minDt), maxDt);
    const upper = Math.max(lower, Math.min(adaptiveMax, maxDt));
    return Math.min(Math.max(value, lower), upper);
  };

  function updateAdaptiveWindow(delta) {
    if (!Number.isFinite(delta) || delta <= 0) return;
    sampleCount += 1;
    sampleTotal += delta;
    if (sampleCount > 120) {
      sampleCount = Math.round(sampleCount / 2);
      sampleTotal /= 2;
    }
    if (sampleCount < 5) return;
    const average = sampleTotal / sampleCount;
    const target = Math.min(Math.max(average, minDt), maxDt);
    const span = target * 0.25;
    adaptiveMin = Math.max(minDt, target - span);
    adaptiveMax = Math.min(maxDt, target + span);
  }

  function frame(now) {
    const delta = now - last;
    updateAdaptiveWindow(delta);
    const dt = clampDt(Number.isFinite(delta) ? delta : minDt);
    last = now;
    callback(dt, now);
    id = requestAnimationFrame(frame);
  }

  id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
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
  getGlowStrengthConfig,
  setBumpControl,
  getBumpControl,
  getBumpControlConfig,
  setHeightScale,
  getHeightScale,
  getHeightScaleConfig,
  setShapeExtension,
  getShapeExtension,
  getShapeExtensions,
  setFamilyExtension,
  getFamilyExtension,
  getFamilyExtensionConfig,
  clearFamilyExtension,
  clearAllFamilyExtensions,
  isExtensionEnabledForFamily,
  getFamilyLineSettings,
  updateFamilyLineSettings,
  getAllFamilyLineSettings,
  setAllFamilyLineSettings,
  resetFamilyLineSettings,
  isTravelEffectEnabled,
  setTravelEffectEnabled,
  getTravelEffectSettings,
  setTravelEffectSettings,
  resetTravelEffectSettings,
  SHAPE_OPTIONS,
  getFamilyModifiers,
  computeNoteWidth,
  computeDynamicBounds,
  computeDiamondBounds,
  calculateCanvasSize,
  computeSeekOffset,
  resetStartOffset,
  canStartPlayback,
  prefersReducedMotion,
  startAutoFPSLoop,
  preprocessTempoMap,
  ticksToSeconds,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = utils;
} else {
  global.utils = utils;
}
})(typeof globalThis !== 'undefined' ? globalThis : this);

