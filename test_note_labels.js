const assert = require('assert');

const localStorageMock = {
  data: new Map(),
  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  },
  setItem(key, value) {
    this.data.set(key, String(value));
  },
  removeItem(key) {
    this.data.delete(key);
  },
};

global.localStorage = localStorageMock;

const {
  getNoteLabel,
  setNoteLabelsEnabled,
  setNoteLabelsColor,
  setNoteLabelsSize,
  setNoteLabelsFont,
} = require('./script.js');

assert.strictEqual(getNoteLabel(60), 'C');
assert.strictEqual(getNoteLabel(61), 'C#/Db');
assert.strictEqual(getNoteLabel(70), 'A#/Bb');
assert.strictEqual(getNoteLabel(-1), 'B');

setNoteLabelsEnabled(true);
assert.strictEqual(localStorageMock.getItem('noteLabelsEnabled'), 'true');

setNoteLabelsColor('#Ab12Ef');
assert.strictEqual(localStorageMock.getItem('noteLabelsColor'), '#ab12ef');
setNoteLabelsColor('blue');
assert.strictEqual(localStorageMock.getItem('noteLabelsColor'), '#ab12ef');

setNoteLabelsSize(4);
assert.strictEqual(localStorageMock.getItem('noteLabelsSize'), '8');
setNoteLabelsSize(120);
assert.strictEqual(localStorageMock.getItem('noteLabelsSize'), '64');

setNoteLabelsFont('Verdana');
assert.strictEqual(localStorageMock.getItem('noteLabelsFont'), 'Verdana');
setNoteLabelsFont('Comic Sans MS');
assert.strictEqual(localStorageMock.getItem('noteLabelsFont'), 'Verdana');

console.log('Pruebas de etiquetas de notas completadas');
