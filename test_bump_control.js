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
setBumpControl(1.5, 'Metales');
approx(computeBumpHeight(base, 0, 0, 1, 0.5, 'Metales'), 17.5);
approx(computeBumpHeight(base, 1, 0, 1, 0.5, 'Metales'), 12.5);

console.log('Pruebas de control de bump completadas');
