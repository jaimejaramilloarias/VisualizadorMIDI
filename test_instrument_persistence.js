const assert = require('assert');

const store = {};
global.localStorage = {
  getItem: (k) => store[k],
  setItem: (k, v) => {
    store[k] = v;
  },
};

let { setInstrumentEnabled, getVisibleNotes } = require('./script');

const notes = [
  {
    instrument: 'Flauta',
    start: 0,
    end: 1,
    noteNumber: 60,
    color: '#fff',
    shape: 'arabesque',
    family: 'Maderas de timbre "redondo"',
    velocity: 67,
  },
  { instrument: 'Violín', start: 0, end: 1, noteNumber: 65, color: '#fff', shape: 'diamond', family: 'Cuerdas frotadas', velocity: 67 },
];

setInstrumentEnabled('Flauta', false);
setInstrumentEnabled('Violín', true);

delete require.cache[require.resolve('./script')];
({ getVisibleNotes } = require('./script'));

const visible = getVisibleNotes(notes);
assert.strictEqual(visible.length, 1);
assert.strictEqual(visible[0].instrument, 'Violín');

console.log('Pruebas de persistencia de instrumentos completadas');
