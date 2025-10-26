const assert = require('assert');
const { setGlowStrength, computeGlowAlpha, applyGlowEffect } = require('./script');

function approx(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

setGlowStrength(2);
approx(computeGlowAlpha(0.2, 0), 0.5);
setGlowStrength(1.5, 'Metales');
approx(computeGlowAlpha(0.15, 0, 0.2, 'Metales'), 0.5);

function brightness(hex) {
  const normalized = hex.replace('#', '');
  const num = parseInt(normalized, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const baseColor = '#884400';
const baseSecondary = '#442200';
const globalTint = applyGlowEffect(baseColor, baseSecondary, 0.6);
const familyTint = applyGlowEffect(baseColor, baseSecondary, 0.6, 'Metales');

assert(
  brightness(globalTint.fill) > brightness(baseColor),
  'el tintado global debe aclarar el color base',
);
assert(
  brightness(globalTint.fill) > brightness(familyTint.fill),
  'la fuerza global mayor debe aclarar más que la específica de familia',
);
assert(
  brightness(familyTint.secondary) >= brightness(baseSecondary),
  'la capa secundaria debe aclararse con la activación del glow',
);

const idleTint = applyGlowEffect(baseColor, baseSecondary, 0, 'Metales');
assert.strictEqual(idleTint.fill, baseColor, 'sin activación el color no debe cambiar');
assert.strictEqual(
  idleTint.secondary,
  baseSecondary,
  'el secundario debe permanecer igual cuando no hay glow',
);

setGlowStrength(1.5);

console.log('Pruebas de control de glow completadas');
