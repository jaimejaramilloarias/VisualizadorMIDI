const assert = require('assert');
const { setOpacityScale, getOpacityScale, computeOpacity } = require('./script');

function approx(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

setOpacityScale(0.1, 0.8);
const scale = getOpacityScale();
approx(scale.edge, 0.1);
approx(scale.mid, 0.8);

approx(computeOpacity(-50, 50, 600), 0.1);
approx(computeOpacity(125, 175, 600), 0.45);

console.log('Pruebas de escala de opacidad configurables completadas');
