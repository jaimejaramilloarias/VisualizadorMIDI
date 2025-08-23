const assert = require('assert');
const { canStartPlayback } = require('./utils.js');

// No hay audio ni notas
assert.strictEqual(canStartPlayback(null, []), false);

// Solo audio
assert.strictEqual(canStartPlayback({}, []), true);

// Solo notas
assert.strictEqual(canStartPlayback(null, [{ start: 0, end: 1 }]), true);

console.log('Pruebas del botón Play con una sola fuente completadas');
