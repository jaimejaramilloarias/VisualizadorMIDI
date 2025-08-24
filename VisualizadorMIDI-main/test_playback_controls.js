const assert = require('assert');
const { computeSeekOffset, resetStartOffset } = require('./script');

// Pruebas para computeSeekOffset
assert.strictEqual(computeSeekOffset(0, 3, 10, 0), 3); // adelantar dentro del rango
assert.strictEqual(computeSeekOffset(0, -3, 10, 0), 0); // no retrocede por debajo de 0
assert.strictEqual(computeSeekOffset(8, 5, 10, 0), 10); // límite superior sin trim
assert.strictEqual(computeSeekOffset(5, 5, 10, 2), 8); // límite considerando trim

// Prueba para resetStartOffset
assert.strictEqual(resetStartOffset(), 0);

console.log('Pruebas de controles de reproducción completadas');

