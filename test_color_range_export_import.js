const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  exportConfiguration,
  importConfiguration,
  FAMILY_PRESETS,
  resetFamilyCustomizations,
} = require('./script.js');

resetFamilyCustomizations();

const tracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);
setFamilyCustomization(
  'Maderas de timbre "redondo"',
  { color: '#112233' },
  tracks
);

const exported = JSON.parse(exportConfiguration());
assert.strictEqual(
  exported.familyCustomizations['Maderas de timbre "redondo"'].color,
  '#112233'
);
assert.strictEqual(
  FAMILY_PRESETS['Maderas de timbre "redondo"'].color,
  '#112233'
);

resetFamilyCustomizations();

const newTracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);
importConfiguration(exported, newTracks);

assert.strictEqual(newTracks[0].color, '#112233');

console.log('Pruebas de exportación e importación de colores de familia completadas');
