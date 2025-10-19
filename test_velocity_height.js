const assert = require('assert');
const { computeVelocityHeight, computeBumpHeight } = require('./script');

const base = 10;
assert.strictEqual(computeVelocityHeight(base, 127), base);
assert.strictEqual(computeVelocityHeight(base, 254), base * 2);
assert(Math.abs(computeVelocityHeight(base, 33) - base * (33 / 127)) < 1e-6);

// Verifica que la altura del bump también escala con la velocidad
const bumpBase = computeBumpHeight(computeVelocityHeight(base, 127), 0, 0, 1);
const bumpDouble = computeBumpHeight(computeVelocityHeight(base, 254), 0, 0, 1);
assert.strictEqual(bumpDouble, bumpBase * 2);

console.log('Pruebas de altura por velocidad completadas');
