const assert = require('assert');
const { computeFillAlpha } = require('./script');

function approx(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

// Canvas width 800 -> center 400
approx(computeFillAlpha(420, 800), 0);
approx(computeFillAlpha(400, 800), 1);
approx(computeFillAlpha(399, 800), 1);

console.log('Pruebas de desvanecimiento de relleno completadas');
