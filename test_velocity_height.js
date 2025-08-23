const assert = require('assert');
const { computeVelocityHeight, computeBumpHeight } = require('./script');

const base = 10;
assert.strictEqual(computeVelocityHeight(base, 67), base);
assert.strictEqual(computeVelocityHeight(base, 134), base * 2);
assert(Math.abs(computeVelocityHeight(base, 33) - base * (33 / 67)) < 1e-6);

// Verifica que la altura del bump también escala con la velocidad
const bumpBase = computeBumpHeight(computeVelocityHeight(base, 67), 0, 0, 1);
const bumpDouble = computeBumpHeight(computeVelocityHeight(base, 134), 0, 0, 1);
assert.strictEqual(bumpDouble, bumpBase * 2);

console.log('Pruebas de altura por velocidad completadas');
