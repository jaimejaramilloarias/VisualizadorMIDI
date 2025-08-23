const assert = require('assert');
const { computeVelocityHeight } = require('./script');

const base = 10;
assert.strictEqual(computeVelocityHeight(base, 67), base);
assert.strictEqual(computeVelocityHeight(base, 134), base * 2);
assert(Math.abs(computeVelocityHeight(base, 33) - base * (33 / 67)) < 1e-6);

console.log('Pruebas de altura por velocidad completadas');
