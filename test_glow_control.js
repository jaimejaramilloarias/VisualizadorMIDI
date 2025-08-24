const assert = require('assert');
const { setGlowStrength, computeGlowAlpha, applyGlowEffect } = require('./script');

function approx(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

setGlowStrength(2);
approx(computeGlowAlpha(0.2, 0), 0.5);

const ctx = {
  shadowBlur: 0,
  shadowColor: null,
  fillStyle: null,
  save() {},
  restore() {},
  beginPath() {},
  rect(x, y, w, h) {
    this.w = w;
    this.h = h;
  },
  fill() {},
};

applyGlowEffect(ctx, 'square', 0, 0, 10, 10, 0.5);
assert(ctx.shadowBlur > 20, 'blur no escalado');
assert.strictEqual(ctx.w, 10, 'el ancho no debe cambiar');
assert(ctx.h > 10, 'la altura debe escalarse');

console.log('Pruebas de control de glow completadas');
