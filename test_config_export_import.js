const assert = require('assert');
const {
  assignTrackInfo,
  exportConfiguration,
  importConfiguration,
  INSTRUMENT_COLOR_SHIFT,
  adjustColorBrightness,
  getVelocityBase,
  getOpacityScale,
  getGlowStrength,
  getBumpControl,
} = require('./script.js');

const tracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);
const notes = [
  {
    start: 0,
    end: 1,
    noteNumber: 60,
    velocity: 64,
    color: tracks[0].color,
    shape: tracks[0].shape,
    family: tracks[0].family,
    instrument: tracks[0].instrument,
  },
];

const config = {
  assignedFamilies: { Flauta: 'Metales' },
  familyCustomizations: { Metales: { color: '#123456', shape: 'diamond' } },
  enabledInstruments: { Flauta: true },
  velocityBase: 80,
  opacityScale: { edge: 0.1, mid: 0.8 },
  glowStrength: 1.5,
  bumpControl: 1.2,
};

importConfiguration(config, tracks, notes);

assert.strictEqual(tracks[0].family, 'Metales');
assert.strictEqual(tracks[0].shape, 'diamond');
const expectedColor = adjustColorBrightness(
  '#123456',
  INSTRUMENT_COLOR_SHIFT['Flauta']
);
assert.strictEqual(tracks[0].color, expectedColor);
assert.strictEqual(notes[0].family, 'Metales');
assert.strictEqual(notes[0].shape, 'diamond');
assert.strictEqual(notes[0].color, expectedColor);

assert.strictEqual(getVelocityBase(), 80);
assert.deepStrictEqual(getOpacityScale(), { edge: 0.1, mid: 0.8 });
assert.strictEqual(getGlowStrength(), 1.5);
assert.strictEqual(getBumpControl(), 1.2);

const exported = JSON.parse(exportConfiguration());
assert.deepStrictEqual(exported, config);

console.log('Pruebas de exportación e importación completadas');
