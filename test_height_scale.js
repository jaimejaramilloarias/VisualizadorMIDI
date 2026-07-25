const assert = require('assert');
const { setHeightScale, getHeightScale, computeNoteWidth } = require('./script');

setHeightScale(1.5);
assert.strictEqual(getHeightScale(), 1.5);
assert.strictEqual(getHeightScale('Metales'), 1.5);

setHeightScale(2, 'Metales');
assert.strictEqual(getHeightScale('Metales'), 2);
assert.strictEqual(getHeightScale('Tambores'), 1.5);

const noteMetales = { start: 0, end: 1, shape: 'circle', family: 'Metales' };
assert.strictEqual(computeNoteWidth(noteMetales, 10, 20), 20);

const noteTambores = { start: 0, end: 1, shape: 'circle', family: 'Tambores' };
assert.strictEqual(computeNoteWidth(noteTambores, 10, 20), 15);

console.log('Pruebas de escala de altura completadas');
