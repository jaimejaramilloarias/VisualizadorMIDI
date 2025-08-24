const assert = require('assert');
const { computeFillAlpha } = require('./script');

function approx(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

// Canvas width 800 -> center 400, fadeWidth 80
approx(computeFillAlpha(400, 800), 1);
approx(computeFillAlpha(360, 800), 0.5);
approx(computeFillAlpha(320, 800), 0);

console.log('Pruebas de desvanecimiento de relleno completadas');
