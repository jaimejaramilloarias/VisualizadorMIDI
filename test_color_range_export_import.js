const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  exportConfiguration,
  importConfiguration,
  FAMILY_PRESETS,
  INSTRUMENT_COLOR_SHIFT,
  resetFamilyCustomizations,
} = require('./script.js');
const { interpolateColor } = require('./utils.js');

resetFamilyCustomizations();

const tracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);
setFamilyCustomization(
  'Maderas de timbre "redondo"',
  { colorBright: '#0000ff', colorDark: '#000044' },
  tracks,
);

const exported = exportConfiguration();
const parsed = JSON.parse(exported);
assert.strictEqual(
  parsed.familyCustomizations['Maderas de timbre "redondo"'].colorBright,
  '#0000ff',
);
assert.strictEqual(
  parsed.familyCustomizations['Maderas de timbre "redondo"'].colorDark,
  '#000044',
);

resetFamilyCustomizations();

const newTracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);
importConfiguration(exported, newTracks);

const factor = (INSTRUMENT_COLOR_SHIFT['Flauta'] + 1) / 2;
const expectedColor = interpolateColor('#000044', '#0000ff', factor);
assert.strictEqual(newTracks[0].color, expectedColor);

console.log('Pruebas de exportación e importación de rangos de color completadas');
