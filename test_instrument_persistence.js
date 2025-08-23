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
  { instrument: 'Flauta', start: 0, end: 1, noteNumber: 60, color: '#fff', shape: 'oval', family: 'Maderas de timbre "redondo"', velocity: 67 },
  { instrument: 'Violin', start: 0, end: 1, noteNumber: 65, color: '#fff', shape: 'triangle', family: 'Cuerdas frotadas', velocity: 67 },
];

setInstrumentEnabled('Flauta', false);
setInstrumentEnabled('Violin', true);

delete require.cache[require.resolve('./script')];
({ getVisibleNotes } = require('./script'));

const visible = getVisibleNotes(notes);
assert.strictEqual(visible.length, 1);
assert.strictEqual(visible[0].instrument, 'Violin');

console.log('Pruebas de persistencia de instrumentos completadas');
