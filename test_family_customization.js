const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  FAMILY_PRESETS,
  INSTRUMENT_COLOR_SHIFT,
  adjustColorBrightness,
} = require('./script.js');

const tracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);
setFamilyCustomization(
  'Maderas de timbre "redondo"',
  { color: '#123456', shape: 'square' },
  tracks
);

assert.strictEqual(
  FAMILY_PRESETS['Maderas de timbre "redondo"'].color,
  '#123456'
);
assert.strictEqual(
  FAMILY_PRESETS['Maderas de timbre "redondo"'].shape,
  'square'
);
const expectedColor = adjustColorBrightness(
  '#123456',
  INSTRUMENT_COLOR_SHIFT['Flauta']
);
assert.strictEqual(tracks[0].color, expectedColor);
assert.strictEqual(tracks[0].shape, 'square');

console.log('Pruebas de personalización de familias completadas');
