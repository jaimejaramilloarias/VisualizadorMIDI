const assert = require('assert');
const { getVisibleNotes, setInstrumentEnabled } = require('./script');

const notes = [
  { instrument: 'Flauta', start: 0, end: 1, noteNumber: 60, color: '#fff', shape: 'oval', family: 'Maderas de timbre "redondo"' },
  { instrument: 'Violin', start: 0, end: 1, noteNumber: 65, color: '#fff', shape: 'triangle', family: 'Cuerdas frotadas' },
];

setInstrumentEnabled('Flauta', false);
setInstrumentEnabled('Violin', true);

const visible = getVisibleNotes(notes);
assert.strictEqual(visible.length, 1);
assert.strictEqual(visible[0].instrument, 'Violin');

console.log('Pruebas de activación/desactivación de instrumentos completadas');
