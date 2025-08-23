const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  INSTRUMENT_COLOR_SHIFT,
  resetFamilyCustomizations,
} = require('./script.js');
const { interpolateColor } = require('./utils.js');

resetFamilyCustomizations();

const tracks = assignTrackInfo([
  { name: 'Oboe', events: [] },
  { name: 'Clarinete', events: [] },
]);

setFamilyCustomization(
  'Dobles cañas',
  { colorBright: '#0000ff', colorDark: '#000044' },
  tracks,
);

const bright = '#0000ff';
const dark = '#000044';

const oboe = tracks.find((t) => t.instrument === 'Oboe');
const clarinete = tracks.find((t) => t.instrument === 'Clarinete');

const factorOboe = (INSTRUMENT_COLOR_SHIFT['Oboe'] + 1) / 2;
const factorClarinete = (INSTRUMENT_COLOR_SHIFT['Clarinete'] + 1) / 2;

const expectedOboe = interpolateColor(dark, bright, factorOboe);
const expectedClarinete = interpolateColor(dark, bright, factorClarinete);

assert.strictEqual(oboe.color, expectedOboe);
assert.strictEqual(clarinete.color, expectedClarinete);

console.log('Pruebas de rangos de color por familia completadas');
