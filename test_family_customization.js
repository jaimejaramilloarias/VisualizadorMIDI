const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  FAMILY_PRESETS,
  resetFamilyCustomizations,
  FAMILY_DEFAULTS,
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
assert.strictEqual(tracks[0].color, '#123456');
assert.strictEqual(tracks[0].shape, 'square');

resetFamilyCustomizations(tracks);

assert.strictEqual(
  FAMILY_PRESETS['Maderas de timbre "redondo"'].color,
  FAMILY_DEFAULTS['Maderas de timbre "redondo"'].color
);
assert.strictEqual(
  FAMILY_PRESETS['Maderas de timbre "redondo"'].shape,
  FAMILY_DEFAULTS['Maderas de timbre "redondo"'].shape
);
assert.strictEqual(
  tracks[0].color,
  FAMILY_DEFAULTS['Maderas de timbre "redondo"'].color
);
assert.strictEqual(
  tracks[0].shape,
  FAMILY_DEFAULTS['Maderas de timbre "redondo"'].shape
);

console.log('Pruebas de personalización de familias completadas');
