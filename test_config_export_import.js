const assert = require('assert');
const {
  assignTrackInfo,
  exportConfiguration,
  importConfiguration,
  INSTRUMENT_COLOR_SHIFT,
  adjustColorBrightness,
} = require('./script.js');

const tracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);

const config = {
  assignedFamilies: { Flauta: 'Metales' },
  familyCustomizations: { Metales: { color: '#123456', shape: 'triangle' } },
};

importConfiguration(config, tracks);

assert.strictEqual(tracks[0].family, 'Metales');
assert.strictEqual(tracks[0].shape, 'triangle');
const expectedColor = adjustColorBrightness(
  '#123456',
  INSTRUMENT_COLOR_SHIFT['Flauta']
);
assert.strictEqual(tracks[0].color, expectedColor);

const exported = JSON.parse(exportConfiguration());
assert.deepStrictEqual(exported, config);

console.log('Pruebas de exportación e importación completadas');
