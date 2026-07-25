const assert = require('assert');
const { setVelocityBase, getVelocityBase, computeVelocityHeight } = require('./script');

// Ajusta la velocidad base y verifica su efecto en la altura calculada
setVelocityBase(80);
assert.strictEqual(getVelocityBase(), 80);
const base = 10;
// Con velocidad igual a la base, la altura debe mantenerse
assert.strictEqual(computeVelocityHeight(base, 80), base);
// Con la mitad de la velocidad base, la altura debe ser la mitad
assert.strictEqual(computeVelocityHeight(base, 40), base * 0.5);

console.log('Pruebas de definición de velocidad base completadas');
