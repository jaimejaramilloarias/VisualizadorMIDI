const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  INSTRUMENT_COLOR_SHIFT,
  resetFamilyCustomizations,
} = require('./script.js');
const { interpolateColor, validateColorRange } = require('./utils.js');

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
  { colorBright: '#0000ff', colorDark: '#000044' },
  tracks,
  notes,
);

const { bright, dark } = validateColorRange('#0000ff', '#000044');

const oboe = tracks.find((t) => t.instrument === 'Oboe');
const clarinete = tracks.find((t) => t.instrument === 'Clarinete');

const factorOboe = (INSTRUMENT_COLOR_SHIFT['Oboe'] + 1) / 2;
const factorClarinete = (INSTRUMENT_COLOR_SHIFT['Clarinete'] + 1) / 2;

const expectedOboe = interpolateColor(dark, bright, factorOboe);
const expectedClarinete = interpolateColor(dark, bright, factorClarinete);

assert.strictEqual(oboe.color, expectedOboe);
assert.strictEqual(clarinete.color, expectedClarinete);

const noteOboe = notes.find((n) => n.instrument === 'Oboe');
const noteClarinete = notes.find((n) => n.instrument === 'Clarinete');

assert.strictEqual(noteOboe.color, expectedOboe);
assert.strictEqual(noteClarinete.color, expectedClarinete);

console.log('Pruebas de rangos de color por familia completadas');
