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
let bumpControl = 1.2;
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
function computeBumpHeight(
  baseHeight,
  currentSec,
  start,
  end,
  bump = 0.5,
  family,
  alignmentX,
  canvasWidth,
) {
  const control = getBumpControl(family);
  const amount = bump * control;
  const duration = (end - start) * control;
  if (amount <= 0 || duration <= 0) return baseHeight;
  if (
    typeof alignmentX === 'number' &&
    typeof canvasWidth === 'number' &&
    alignmentX > canvasWidth / 2 + 0.001
  ) {
    return baseHeight;
  }
  if (currentSec < start || currentSec > start + duration) return baseHeight;
  const progress = (currentSec - start) / duration;
  const clamped = Math.min(Math.max(progress, 0), 1);
  return baseHeight * (1 + amount * (1 - clamped));
}

// Referencia de velocidad MIDI para altura 100%
let velocityBase = 127;

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
let heightScale = 2;
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
let glowStrength = 1.5;
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
function computeGlowAlpha(
  currentSec,
  start,
  baseDuration = 0.2,
  family,
  alignmentX,
  canvasWidth,
) {
  const strength = getGlowStrength(family);
  const duration = baseDuration * strength;
  if (
    duration <= 0 ||
    (typeof alignmentX === 'number' &&
      typeof canvasWidth === 'number' &&
      alignmentX > canvasWidth / 2 + 0.001)
  ) {
    return 0;
  }
  if (currentSec < start || currentSec > start + duration) return 0;
  const progress = (currentSec - start) / duration;
  const clamped = Math.min(Math.max(progress, 0), 1);
  return 1 - clamped;
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

function computeNoteStrokeWidth(width = 0, height = 0) {
  const minDim = Math.max(Math.min(width, height), 1);
  return Math.max(minDim / 6, 1.5);
}

function configureNoteStrokeStyle(ctx, shape, width, height, strokeWidth) {
  const widthToUse =
    typeof strokeWidth === 'number' && !Number.isNaN(strokeWidth)
      ? strokeWidth
      : computeNoteStrokeWidth(width, height);
  ctx.lineWidth = widthToUse;
  const meta = SHAPE_METADATA[shape];
  const isSharp = !!(meta && meta.sharp);
  if (isSharp) {
    ctx.lineJoin = 'miter';
    ctx.miterLimit = meta && meta.miterLimit ? meta.miterLimit : 8;
    ctx.lineCap = 'butt';
  } else {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 4;
  }
  return widthToUse;
}

function traceEllipse(ctx, x, y, width, height, scale = 1) {
  const w = width * scale;
  const h = height * scale;
  const cx = x + width / 2;
  const cy = y + height / 2;
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
}

function getScaledFrame(x, y, width, height, scale) {
  const w = width * scale;
  const h = height * scale;
  const nx = x + (width - w) / 2;
  const ny = y + (height - h) / 2;
  return { x: nx, y: ny, width: w, height: h };
}

function getCenteredSquareFrame(x, y, width, height, scale = 1) {
  const size = Math.min(width, height);
  const scaled = size * scale;
  const nx = x + (width - scaled) / 2;
  const ny = y + (height - scaled) / 2;
  return { x: nx, y: ny, width: scaled, height: scaled };
}

function traceRoundedSquare(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const right = x + width;
  const bottom = y + height;
  ctx.moveTo(x + r, y);
  ctx.lineTo(right - r, y);
  ctx.quadraticCurveTo(right, y, right, y + r);
  ctx.lineTo(right, bottom - r);
  ctx.quadraticCurveTo(right, bottom, right - r, bottom);
  ctx.lineTo(x + r, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function traceDiamond(ctx, x, y, width, height, inset = 0) {
  const insetX = typeof inset === 'object' ? inset.insetX || 0 : inset;
  const insetY = typeof inset === 'object' ? inset.insetY || 0 : inset;
  const left = x + insetX;
  const top = y + insetY;
  const right = x + width - insetX;
  const bottom = y + height - insetY;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  ctx.moveTo(left, midY);
  ctx.lineTo(midX, top);
  ctx.lineTo(right, midY);
  ctx.lineTo(midX, bottom);
  ctx.closePath();
}

function traceFourPointStar(ctx, x, y, width, height, inset = 0) {
  const insetX = typeof inset === 'object' ? inset.insetX || 0 : inset;
  const insetY = typeof inset === 'object' ? inset.insetY || 0 : inset;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const effectiveWidth = Math.max(width - insetX * 2, 0);
  const effectiveHeight = Math.max(height - insetY * 2, 0);
  const outerRadiusX = effectiveWidth / 2;
  const outerRadiusY = effectiveHeight / 2;
  const innerRadiusX = outerRadiusX * 0.55;
  const innerRadiusY = outerRadiusY * 0.55;
  const outerHandleX = outerRadiusX * 0.82;
  const outerHandleY = outerRadiusY * 0.82;
  const innerHandleX = innerRadiusX * 0.68;
  const innerHandleY = innerRadiusY * 0.68;

  const toPoint = (angle, radiusX, radiusY) => ({
    x: centerX + Math.cos(angle) * radiusX,
    y: centerY + Math.sin(angle) * radiusY,
  });

  const start = toPoint(-Math.PI / 2, outerRadiusX, outerRadiusY);
  ctx.moveTo(start.x, start.y);

  for (let i = 0; i < 4; i++) {
    const baseAngle = -Math.PI / 2 + i * (Math.PI / 2);
    const innerAngle = baseAngle + Math.PI / 4;
    const nextOuterAngle = baseAngle + Math.PI / 2;

    const control1 = toPoint(baseAngle + Math.PI / 10, outerHandleX, outerHandleY);
    const control2 = toPoint(innerAngle - Math.PI / 10, innerHandleX, innerHandleY);
    const innerPoint = toPoint(innerAngle, innerRadiusX, innerRadiusY);
    ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, innerPoint.x, innerPoint.y);

    const control3 = toPoint(innerAngle + Math.PI / 10, innerHandleX, innerHandleY);
    const control4 = toPoint(nextOuterAngle - Math.PI / 10, outerHandleX, outerHandleY);
    const nextOuter = toPoint(nextOuterAngle, outerRadiusX, outerRadiusY);
    ctx.bezierCurveTo(control3.x, control3.y, control4.x, control4.y, nextOuter.x, nextOuter.y);
  }

  ctx.closePath();
}

function traceSixPointStar(ctx, x, y, width, height, inset = 0) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const insetX = typeof inset === 'object' ? inset.insetX || 0 : inset;
  const insetY = typeof inset === 'object' ? inset.insetY || 0 : inset;
  const spanX = width - insetX * 2;
  const spanY = height - insetY * 2;
  const barThickness = Math.min(spanX, spanY) * 0.28;

  ctx.save();
  ctx.translate(cx, cy);

  const drawBar = (angle) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.rect(-barThickness / 2, -spanY / 2, barThickness, spanY);
    ctx.restore();
  };

  drawBar(0);
  drawBar(Math.PI / 3);
  drawBar(-Math.PI / 3);

  ctx.restore();
}

function traceTriangle(ctx, x, y, width, height, inset = 0) {
  const insetX = typeof inset === 'object' ? inset.insetX || 0 : inset;
  const insetY = typeof inset === 'object' ? inset.insetY || 0 : inset;
  ctx.moveTo(x + width / 2, y + insetY);
  ctx.lineTo(x + width - insetX, y + height - insetY);
  ctx.lineTo(x + insetX, y + height - insetY);
  ctx.closePath();
}

const SHAPE_METADATA = {
  circle: {
    label: 'Círculo clásico',
    draw(ctx, x, y, width, height) {
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    },
  },
  circleDouble: {
    label: 'Círculo doble',
    layers: [
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceEllipse(ctx, x, y, width, height);
        },
      },
      {
        color: 'secondary',
        draw(ctx, x, y, width, height) {
          traceEllipse(ctx, x, y, width, height, 0.7);
        },
      },
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceEllipse(ctx, x, y, width, height, 0.396);
        },
      },
    ],
    secondaryFill: '#000000',
    draw(ctx, x, y, width, height) {
      traceEllipse(ctx, x, y, width, height);
    },
  },
  square: {
    label: 'Cuadrado sólido',
    sharp: true,
    draw(ctx, x, y, width, height) {
      ctx.rect(x, y, width, height);
    },
  },
  squareDouble: {
    label: 'Marco cuadrado doble',
    sharp: true,
    layers: [
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          ctx.rect(x, y, width, height);
        },
      },
      {
        color: 'secondary',
        draw(ctx, x, y, width, height) {
          const frame = getScaledFrame(x, y, width, height, 0.72);
          ctx.rect(frame.x, frame.y, frame.width, frame.height);
        },
      },
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          const frame = getScaledFrame(x, y, width, height, 0.405);
          ctx.rect(frame.x, frame.y, frame.width, frame.height);
        },
      },
    ],
    secondaryFill: '#000000',
    draw(ctx, x, y, width, height) {
      ctx.rect(x, y, width, height);
    },
  },
  roundedSquare: {
    label: 'Cuadrado redondeado',
    draw(ctx, x, y, width, height) {
      traceRoundedSquare(ctx, x, y, width, height, Math.min(width, height) * 0.25);
    },
  },
  roundedSquareDouble: {
    label: 'Cuadrado redondeado doble',
    layers: [
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          const radius = Math.min(width, height) * 0.25;
          traceRoundedSquare(ctx, x, y, width, height, radius);
        },
      },
      {
        color: 'secondary',
        draw(ctx, x, y, width, height) {
          const frame = getScaledFrame(x, y, width, height, 0.72);
          const radius = Math.min(frame.width, frame.height) * 0.25;
          traceRoundedSquare(ctx, frame.x, frame.y, frame.width, frame.height, radius);
        },
      },
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          const frame = getScaledFrame(x, y, width, height, 0.414);
          const radius = Math.min(frame.width, frame.height) * 0.25;
          traceRoundedSquare(ctx, frame.x, frame.y, frame.width, frame.height, radius);
        },
      },
    ],
    secondaryFill: '#000000',
    draw(ctx, x, y, width, height) {
      const radius = Math.min(width, height) * 0.25;
      traceRoundedSquare(ctx, x, y, width, height, radius);
    },
  },
  diamond: {
    label: 'Diamante facetado',
    sharp: true,
    draw(ctx, x, y, width, height) {
      traceDiamond(ctx, x, y, width, height);
    },
  },
  diamondDouble: {
    label: 'Diamante doble',
    sharp: true,
    layers: [
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceDiamond(ctx, x, y, width, height);
        },
      },
      {
        color: 'secondary',
        draw(ctx, x, y, width, height) {
          traceDiamond(ctx, x, y, width, height, {
            insetX: width * 0.16,
            insetY: height * 0.16,
          });
        },
      },
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceDiamond(ctx, x, y, width, height, {
            insetX: width * 0.352,
            insetY: height * 0.352,
          });
        },
      },
    ],
    secondaryFill: '#000000',
    draw(ctx, x, y, width, height) {
      traceDiamond(ctx, x, y, width, height);
    },
  },
  fourPointStar: {
    label: 'Estrella de 4 puntas',
    sharp: true,
    miterLimit: 6,
    draw(ctx, x, y, width, height) {
      traceFourPointStar(ctx, x, y, width, height);
    },
  },
  fourPointStarDouble: {
    label: 'Estrella de 4 puntas doble',
    sharp: true,
    miterLimit: 6,
    layers: [
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceFourPointStar(ctx, x, y, width, height);
        },
      },
      {
        color: 'secondary',
        draw(ctx, x, y, width, height) {
          traceFourPointStar(ctx, x, y, width, height, {
            insetX: width * 0.16,
            insetY: height * 0.16,
          });
        },
      },
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceFourPointStar(ctx, x, y, width, height, {
            insetX: width * 0.352,
            insetY: height * 0.352,
          });
        },
      },
    ],
    secondaryFill: '#000000',
    draw(ctx, x, y, width, height) {
      traceFourPointStar(ctx, x, y, width, height);
    },
  },
  sixPointStar: {
    label: 'Estrella de 6 puntas',
    sharp: true,
    draw(ctx, x, y, width, height) {
      traceSixPointStar(ctx, x, y, width, height);
    },
  },
  sixPointStarDouble: {
    label: 'Estrella de 6 puntas doble',
    sharp: true,
    draw(ctx, x, y, width, height) {
      traceSixPointStar(ctx, x, y, width, height);
    },
    layers: [
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceSixPointStar(ctx, x, y, width, height);
        },
      },
      {
        color: 'secondary',
        draw(ctx, x, y, width, height) {
          traceSixPointStar(ctx, x, y, width, height, {
            insetX: width * 0.16,
            insetY: height * 0.16,
          });
        },
      },
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceSixPointStar(ctx, x, y, width, height, {
            insetX: width * 0.352,
            insetY: height * 0.352,
          });
        },
      },
    ],
    secondaryFill: '#000000',
  },
  triangle: {
    label: 'Triángulo',
    sharp: true,
    draw(ctx, x, y, width, height) {
      traceTriangle(ctx, x, y, width, height);
    },
  },
  triangleDouble: {
    label: 'Triángulo doble',
    sharp: true,
    layers: [
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceTriangle(ctx, x, y, width, height);
        },
      },
      {
        color: 'secondary',
        draw(ctx, x, y, width, height) {
          traceTriangle(ctx, x, y, width, height, {
            insetX: width * 0.18,
            insetY: height * 0.18,
          });
        },
      },
      {
        color: 'primary',
        draw(ctx, x, y, width, height) {
          traceTriangle(ctx, x, y, width, height, {
            insetX: width * 0.352,
            insetY: height * 0.352,
          });
        },
      },
    ],
    secondaryFill: '#000000',
    draw(ctx, x, y, width, height) {
      traceTriangle(ctx, x, y, width, height);
    },
  },
};

const SHAPE_ORDER = [
  'circle',
  'circleDouble',
  'square',
  'squareDouble',
  'roundedSquare',
  'roundedSquareDouble',
  'diamond',
  'diamondDouble',
  'fourPointStar',
  'fourPointStarDouble',
  'sixPointStar',
  'sixPointStarDouble',
  'triangle',
  'triangleDouble',
];

const NON_EXTENDABLE_SHAPES = new Set([
  'circleDouble',
  'squareDouble',
  'roundedSquareDouble',
  'diamondDouble',
  'fourPointStarDouble',
  'sixPointStar',
  'sixPointStarDouble',
  'triangleDouble',
]);

const SHAPE_OPTIONS = SHAPE_ORDER.map((value) => ({ value, label: SHAPE_METADATA[value].label }));

const DOUBLE_SHAPE_PATTERN = /double$/i;
const DEFAULT_SECONDARY_LAYER_COLOR = '#000000';
const isDoubleShape = (shape) => typeof shape === 'string' && DOUBLE_SHAPE_PATTERN.test(shape);

const OUTLINE_MODES = ['full', 'pre', 'post'];
const OUTLINE_DEFAULTS = Object.freeze({
  enabled: false,
  mode: 'full',
  width: 3,
  color: null,
  opacity: 1,
});
let outlineSettings = { ...OUTLINE_DEFAULTS };
let familyOutlineSettings = {};

function persistOutlineSettings() {
  if (typeof localStorage === 'undefined') return;
  const payload = {
    global: outlineSettings,
    families: familyOutlineSettings,
  };
  localStorage.setItem('outlineSettings', JSON.stringify(payload));
}

function sanitizeOutlineSettings(config = {}, base = OUTLINE_DEFAULTS) {
  const sanitized = { ...base };
  if (typeof config.enabled === 'boolean') sanitized.enabled = config.enabled;
  if (typeof config.mode === 'string' && OUTLINE_MODES.includes(config.mode)) {
    sanitized.mode = config.mode;
  }
  if (typeof config.width === 'number' && Number.isFinite(config.width)) {
    sanitized.width = Math.max(0.25, config.width);
  }
  if (typeof config.opacity === 'number' && Number.isFinite(config.opacity)) {
    sanitized.opacity = Math.min(Math.max(config.opacity, 0), 1);
  }
  if (typeof config.color === 'string') {
    const hex = config.color.trim();
    sanitized.color = /^#([0-9a-f]{3}){1,2}$/i.test(hex) ? hex.toLowerCase() : sanitized.color;
  } else if (config.color === null) {
    sanitized.color = null;
  }
  return sanitized;
}

function loadOutlineSettings() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('outlineSettings');
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === 'object') {
      if (parsed.global && typeof parsed.global === 'object') {
        outlineSettings = sanitizeOutlineSettings(parsed.global, outlineSettings);
      }
      if (parsed.families && typeof parsed.families === 'object') {
        familyOutlineSettings = Object.entries(parsed.families).reduce(
          (acc, [family, cfg]) => {
            if (cfg && typeof cfg === 'object') {
              acc[family] = sanitizeOutlineSettings(cfg, outlineSettings);
            }
            return acc;
          },
          {},
        );
      }
    }
  } catch (err) {
    try {
      const fallback = JSON.parse(stored);
      if (fallback && typeof fallback === 'object') {
        outlineSettings = sanitizeOutlineSettings(fallback, outlineSettings);
      }
    } catch {}
  }
}

function setOutlineSettings(updates = {}, family) {
  loadOutlineSettings();
  if (family) {
    const current = familyOutlineSettings[family] || outlineSettings;
    familyOutlineSettings[family] = sanitizeOutlineSettings(updates, current);
  } else {
    outlineSettings = sanitizeOutlineSettings(updates, outlineSettings);
  }
  persistOutlineSettings();
}

function mergeOutlineSettings(base, override) {
  if (!override) return { ...base };
  const merged = { ...base };
  if (typeof override.enabled === 'boolean') merged.enabled = override.enabled;
  if (typeof override.mode === 'string' && OUTLINE_MODES.includes(override.mode)) {
    merged.mode = override.mode;
  }
  if (typeof override.width === 'number' && Number.isFinite(override.width)) {
    merged.width = Math.max(0.25, override.width);
  }
  if (typeof override.opacity === 'number' && Number.isFinite(override.opacity)) {
    merged.opacity = Math.min(Math.max(override.opacity, 0), 1);
  }
  if (override.color === null) {
    merged.color = null;
  } else if (typeof override.color === 'string') {
    const hex = override.color.trim();
    if (/^#([0-9a-f]{3}){1,2}$/i.test(hex)) {
      merged.color = hex.toLowerCase();
    }
  }
  return merged;
}

function getOutlineSettings(family) {
  loadOutlineSettings();
  const base = { ...outlineSettings };
  if (!family) return base;
  const override = familyOutlineSettings[family];
  if (!override) return base;
  return mergeOutlineSettings(base, override);
}

function getOutlineSettingsConfig() {
  loadOutlineSettings();
  return {
    global: { ...outlineSettings },
    families: { ...familyOutlineSettings },
  };
}

function clearFamilyOutlineSettings(family) {
  loadOutlineSettings();
  if (!family) return;
  delete familyOutlineSettings[family];
  persistOutlineSettings();
}

function resetOutlineSettings() {
  outlineSettings = { ...OUTLINE_DEFAULTS };
  familyOutlineSettings = {};
  persistOutlineSettings();
}

loadOutlineSettings();

// Dibuja cualquiera de las figuras declaradas anteriormente respetando reglas de relleno
function drawNoteShape(
  ctx,
  shape,
  x,
  y,
  width,
  height,
  stroke = false,
  strokeWidth,
  options = {},
) {
  const meta = SHAPE_METADATA[shape] || SHAPE_METADATA.circle;
  const { secondaryColor: secondaryOverride } = options || {};
  if (!stroke && Array.isArray(meta.layers) && meta.layers.length > 0) {
    const baseColor = ctx.fillStyle;
    const secondaryColor =
      secondaryOverride || meta.secondaryFill || DEFAULT_SECONDARY_LAYER_COLOR;
    for (const layer of meta.layers) {
      const layerColor = layer.color === 'secondary'
        ? layer.fill || secondaryColor
        : layer.fill || baseColor;
      ctx.beginPath();
      if (typeof layer.draw === 'function') {
        layer.draw(ctx, x, y, width, height);
      } else {
        meta.draw(ctx, x, y, width, height);
      }
      ctx.fillStyle = layerColor;
      ctx.fill();
    }
    ctx.fillStyle = baseColor;
    return;
  }

  ctx.beginPath();
  meta.draw(ctx, x, y, width, height);
  if (stroke) {
    configureNoteStrokeStyle(ctx, shape, width, height, strokeWidth);
    ctx.stroke();
    return;
  }
  if (meta.fillRule === 'evenodd') ctx.fill('evenodd');
  else ctx.fill();
}

// Estado de alargamiento progresivo por figura alargada
const SHAPE_EXTENSION_DEFAULTS = SHAPE_ORDER.reduce((acc, value) => {
  acc[value] = !isDoubleShape(value) && !NON_EXTENDABLE_SHAPES.has(value);
  return acc;
}, {});
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
  NON_EXTENDABLE_SHAPES.forEach((shape) => {
    shapeExtensions[shape] = false;
  });
  Object.keys(shapeExtensions).forEach((shape) => {
    if (isDoubleShape(shape)) {
      shapeExtensions[shape] = false;
    }
  });
}

function isShapeExtendable(shape) {
  return !!(shape && !isDoubleShape(shape) && !NON_EXTENDABLE_SHAPES.has(shape));
}

function getShapeExtension(shape) {
  loadShapeExtensions();
  if (!isShapeExtendable(shape)) return false;
  return shapeExtensions[shape] !== false;
}

function setShapeExtension(shape, enabled) {
  if (!isShapeExtendable(shape)) {
    shapeExtensions[shape] = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('shapeExtensions', JSON.stringify(shapeExtensions));
    }
    return;
  }
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
  if (!isShapeExtendable(shape)) return false;
  const override = getFamilyExtension(family);
  if (typeof override === 'boolean') {
    return override;
  }
  return getShapeExtension(shape);
}

loadShapeExtensions();

const DEFAULT_LINE_SETTINGS = { enabled: false, opacity: 0.3, width: 8 };
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
    return isDoubleShape(note.shape) ? baseHeight : durationWidth;
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
  const doubleShape = isDoubleShape(effectiveShape);
  if (!isExtensionEnabledForFamily(effectiveShape, note.family)) {
    const width = doubleShape ? baseWidth : finalWidth;
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
    const now = performance.now();
    callback(0, now);
    return () => {};
  }

  let last = performance.now();
  let initialized = false;
  let id;

  const fallbackMin = Math.max(0, Number.isFinite(minDt) ? minDt : 0);
  const fallbackMax = Math.max(fallbackMin, Number.isFinite(maxDt) ? maxDt : fallbackMin);

  function computeDt(now) {
    const delta = now - last;
    last = now;
    if (!Number.isFinite(delta) || delta <= 0) {
      return fallbackMin;
    }
    if (fallbackMax > 0 && delta > fallbackMax * 4) {
      return fallbackMax;
    }
    return delta;
  }

  function frame(now) {
    const current = Number.isFinite(now) ? now : performance.now();
    if (!initialized) {
      last = current;
      initialized = true;
      callback(0, current);
    } else {
      const dt = computeDt(current);
      callback(dt, current);
    }
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
  computeNoteStrokeWidth,
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
  setOutlineSettings,
  getOutlineSettings,
  getOutlineSettingsConfig,
  clearFamilyOutlineSettings,
  resetOutlineSettings,
  sanitizeOutlineSettings,
  OUTLINE_MODES,
  OUTLINE_DEFAULTS,
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

