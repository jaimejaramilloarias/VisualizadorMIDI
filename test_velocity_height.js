const assert = require('assert');
const { computeVelocityHeight, computeBumpHeight } = require('./script');

const base = 10;
const reference = 67;
assert.strictEqual(computeVelocityHeight(base, reference), base);
assert.strictEqual(computeVelocityHeight(base, reference * 2), base * 2);
assert(
  Math.abs(computeVelocityHeight(base, 34) - base * (34 / reference)) < 1e-6,
);

// Verifica que la altura del bump también escala con la velocidad
const bumpBase = computeBumpHeight(computeVelocityHeight(base, reference), 0, 0, 1);
const bumpDouble = computeBumpHeight(
  computeVelocityHeight(base, reference * 2),
  0,
  0,
  1,
);
assert.strictEqual(bumpDouble, bumpBase * 2);

console.log('Pruebas de altura por velocidad completadas');
