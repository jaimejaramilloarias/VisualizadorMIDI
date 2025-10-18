const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  resetFamilyCustomizations,
} = require('./script.js');

resetFamilyCustomizations();

const tracks = assignTrackInfo([
  { name: 'Oboe', events: [] },
  { name: 'Clarinete', events: [] },
]);
const notes = tracks.map((t) => ({
  instrument: t.instrument,
  family: t.family,
  color: t.color,
  shape: t.shape,
}));

setFamilyCustomization(
  'Dobles cañas',
  { color: '#334455' },
  tracks,
  notes
);

const oboe = tracks.find((t) => t.instrument === 'Oboe');
const clarinete = tracks.find((t) => t.instrument === 'Clarinete');

assert.strictEqual(oboe.color, '#334455');
assert.strictEqual(clarinete.color, '#334455');

const noteOboe = notes.find((n) => n.instrument === 'Oboe');
const noteClarinete = notes.find((n) => n.instrument === 'Clarinete');

assert.strictEqual(noteOboe.color, '#334455');
assert.strictEqual(noteClarinete.color, '#334455');

console.log('Pruebas de color uniforme por familia completadas');
