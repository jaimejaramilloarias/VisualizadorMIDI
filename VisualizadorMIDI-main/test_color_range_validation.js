const assert = require('assert');
const {
  assignTrackInfo,
  setFamilyCustomization,
  FAMILY_PRESETS,
  resetFamilyCustomizations,
} = require('./script.js');
const { validateColorRange } = require('./utils.js');

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
  { colorBright: '#444444' },
  tracks,
  notes,
);
setFamilyCustomization(
  'Maderas de timbre "redondo"',
  { colorDark: '#444444' },
  tracks,
  notes,
);

const expected = validateColorRange('#444444', '#444444');
const preset = FAMILY_PRESETS['Maderas de timbre "redondo"'];

function luminance(color) {
  const num = parseInt(color.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const srgb = [r, g, b].map((c) => {
    const chan = c / 255;
    return chan <= 0.03928
      ? chan / 12.92
      : Math.pow((chan + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

assert.strictEqual(preset.colorBright, expected.bright);
assert.strictEqual(preset.colorDark, expected.dark);
const diff = luminance(preset.colorBright) - luminance(preset.colorDark);
assert(diff > 0);
assert(diff >= 0.2);

console.log('Pruebas de validación de rangos de color completadas');
