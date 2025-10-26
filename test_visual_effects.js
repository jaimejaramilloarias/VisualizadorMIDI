const assert = require('assert');
const {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  applyGlowEffect,
  setOpacityScale,
  setGlowStrength,
} = require('./script');

function approx(actual, expected, eps = 1e-6) {
  assert(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);
}

// Pruebas para computeOpacity
approx(computeOpacity(250, 350, 600), 0.5); // Nota cruzando el centro con escala por defecto
approx(computeOpacity(-50, 50, 600), 0); // Nota lejos del centro
approx(computeOpacity(125, 175, 600), 0.25); // Nota a mitad de distancia
setOpacityScale(0, 1);
approx(computeOpacity(250, 350, 600), 1); // Centro al 100%
approx(computeOpacity(125, 175, 600), 0.5); // Gradiente progresivo
setOpacityScale(0, 0.5);

// Pruebas para computeBumpHeight
const base = 10;
approx(computeBumpHeight(base, -0.1, 0, 1), base); // Antes de la nota
approx(computeBumpHeight(base, 0, 0, 1), base); // Inicio sin incremento instantáneo
approx(
  computeBumpHeight(base, 0.12, 0, 1),
  13.8134110787,
  1e-6,
); // Aumento progresivo rápido
approx(computeBumpHeight(base, 0.42, 0, 1), 16); // Pico del bump (120%)
approx(computeBumpHeight(base, 0.9, 0, 1), 10.888, 1e-3); // Decaimiento cercano al final
approx(computeBumpHeight(base, 1.2, 0, 1), base); // Regreso tras la extensión del bump
approx(computeBumpHeight(base, 0.42, 0, 1, 0.8), 19.6); // Bump incrementado

// Pruebas para computeGlowAlpha
approx(computeGlowAlpha(0, 0), 1); // Inicio del brillo
approx(computeGlowAlpha(0.1, 0), 2 / 3); // Mitad del efecto extendido
approx(computeGlowAlpha(0.3, 0), 0); // Efecto terminado

function brightness(hex) {
  const normalized = hex.replace('#', '');
  const num = parseInt(normalized, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

setGlowStrength(1.5);
const baseFill = '#336699';
const baseSecondary = '#112244';
const subtleTint = applyGlowEffect(baseFill, baseSecondary, 0.15, 'Metales');
const strongTint = applyGlowEffect(baseFill, baseSecondary, 0.9, 'Metales');
assert(
  strongTint.fill !== baseFill,
  'el color de relleno debe cambiar cuando el glow está activo',
);
assert(
  brightness(strongTint.fill) > brightness(baseFill),
  'el color iluminado debe ser más brillante que el original',
);
assert(
  brightness(strongTint.secondary) >= brightness(baseSecondary),
  'la capa secundaria también debe aclararse',
);
assert(
  brightness(strongTint.fill) > brightness(subtleTint.fill),
  'una activación fuerte debe aclarar más que una suave',
);

setGlowStrength(0);
const disabledTint = applyGlowEffect(baseFill, baseSecondary, 0.9, 'Metales');
assert.strictEqual(disabledTint.fill, baseFill, 'sin fuerza el color debe quedar intacto');
assert.strictEqual(
  disabledTint.secondary,
  baseSecondary,
  'sin fuerza la capa secundaria no debe cambiar',
);
setGlowStrength(1.5);

const idleTint = applyGlowEffect(baseFill, baseSecondary, 0, 'Metales');
assert.strictEqual(idleTint.fill, baseFill, 'sin alpha no debe haber cambio');
assert.strictEqual(idleTint.secondary, baseSecondary, 'el secundario debe mantenerse');

console.log('Pruebas de efectos visuales completadas');
