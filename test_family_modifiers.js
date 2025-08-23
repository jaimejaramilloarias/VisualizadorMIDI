const assert = require('assert');
const { getFamilyModifiers, computeNoteWidth } = require('./script');

// Modificadores de familia
const platillos = getFamilyModifiers('Platillos');
assert.strictEqual(platillos.sizeFactor, 1.3);
assert.strictEqual(platillos.bump, 0.5);

const auxiliares = getFamilyModifiers('Auxiliares');
assert.strictEqual(auxiliares.bump, 0.8);

const defaultMods = getFamilyModifiers('Desconocida');
assert.strictEqual(defaultMods.sizeFactor, 1);

// Cálculo del ancho para figuras no alargadas
const notePlatillos = { start: 0, end: 1, shape: 'circle', family: 'Platillos' };
assert.strictEqual(computeNoteWidth(notePlatillos, 10, 20), 13);

const noteTambores = { start: 0, end: 1, shape: 'circle', family: 'Tambores' };
assert.strictEqual(computeNoteWidth(noteTambores, 10, 20), 10);

console.log('Pruebas de modificadores de familia completadas');
