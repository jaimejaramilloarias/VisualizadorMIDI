const assert = require('assert');
const { setBumpControl, computeBumpHeight } = require('./script');

function approx(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

const base = 10;
setBumpControl(2);
approx(computeBumpHeight(base, 0, 0, 1), 20);
approx(computeBumpHeight(base, 1, 0, 1), 15);
approx(computeBumpHeight(base, 2, 0, 1), base);

console.log('Pruebas de control de bump completadas');
