const assert = require('assert');
const { setGlowStrength, computeGlowAlpha, applyGlowEffect } = require('./script');

function approx(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

setGlowStrength(2);
approx(computeGlowAlpha(0.2, 0), 0.5);
setGlowStrength(1.5, 'Metales');
approx(computeGlowAlpha(0.15, 0, 0.2, 'Metales'), 0.5);

const ctx = {
  shadowBlur: 0,
  shadowColor: null,
  fillStyle: null,
  ellipses: [],
  gradients: [],
  save() {},
  restore() {},
  beginPath() {},
  ellipse(cx, cy, rx, ry) {
    this.ellipses.push({ cx, cy, rx, ry });
  },
  rect() {},
  fill() {},
  createRadialGradient() {
    const stops = [];
    this.gradients.push(stops);
    return {
      addColorStop(pos, color) {
        stops.push({ pos, color });
      },
    };
  },
};

applyGlowEffect(ctx, 'square', 0, 0, 10, 10, 0.5, 'Metales');
assert(ctx.shadowBlur > 20, 'blur no escalado');
assert(ctx.ellipses.length > 0, 'el glow debe generar un halo amplio');
const haloRadius = ctx.ellipses.reduce((max, e) => Math.max(max, e.rx, e.ry), 0);
assert(haloRadius > 10, 'el halo debe superar el tamaño de la figura');
assert(ctx.gradients.length > 0, 'el glow debe utilizar gradientes');

console.log('Pruebas de control de glow completadas');
