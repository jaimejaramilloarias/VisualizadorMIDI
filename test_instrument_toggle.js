const assert = require('assert');
const { getVisibleNotes, setInstrumentEnabled } = require('./script');

const notes = [
  {
    instrument: 'Flauta',
    start: 0,
    end: 1,
    noteNumber: 60,
    color: '#fff',
    shape: 'roundedSquare',
    family: 'Maderas de timbre "redondo"',
  },
  { instrument: 'Violín', start: 0, end: 1, noteNumber: 65, color: '#fff', shape: 'diamond', family: 'Cuerdas frotadas' },
];

setInstrumentEnabled('Flauta', false);
setInstrumentEnabled('Violín', true);

const visible = getVisibleNotes(notes);
assert.strictEqual(visible.length, 1);
assert.strictEqual(visible[0].instrument, 'Violín');

console.log('Pruebas de activación/desactivación de instrumentos completadas');
