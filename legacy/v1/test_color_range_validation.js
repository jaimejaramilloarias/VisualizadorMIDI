const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  FAMILY_PRESETS,
  resetFamilyCustomizations,
} = require('./script.js');

resetFamilyCustomizations();

const tracks = assignTrackInfo([
  { name: 'Flauta', events: [] },
]);
const notes = tracks.map((t) => ({
  instrument: t.instrument,
  family: t.family,
  color: t.color,
  shape: t.shape,
}));

setFamilyCustomization(
  'Maderas de timbre "redondo"',
  { color: '#445566' },
  tracks,
  notes
);

assert.strictEqual(
  FAMILY_PRESETS['Maderas de timbre "redondo"'].color,
  '#445566'
);
assert.strictEqual(notes[0].color, '#445566');

setFamilyCustomization(
  'Maderas de timbre "redondo"',
  { color: '#778899' },
  tracks,
  notes
);

assert.strictEqual(
  FAMILY_PRESETS['Maderas de timbre "redondo"'].color,
  '#778899'
);
assert.strictEqual(notes[0].color, '#778899');

console.log('Pruebas de actualización de color de familia completadas');
