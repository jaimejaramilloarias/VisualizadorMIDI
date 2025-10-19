const assert = require('assert');
const {
  assignTrackInfo,
  exportConfiguration,
  importConfiguration,
  getVelocityBase,
  getOpacityScale,
  getGlowStrength,
  getBumpControl,
  getContourWidthScale,
  getVisibleSeconds,
  getHeightScaleConfig,
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
  glowStrength: { global: 1.5, families: { Metales: 1.2 } },
  bumpControl: { global: 1.2, families: { Metales: 1.1 } },
  contourWidth: { global: 1.5, families: { Metales: 1.2 } },
  visibleSeconds: 6,
  heightScale: { global: 1, families: {} },
  shapeExtensions: { oval: true, capsule: true, star: true, diamond: true },
  familyExtensions: { Metales: true },
  familyLineSettings: {},
  familyTravelSettings: {},
};

importConfiguration(config, tracks, notes);

assert.strictEqual(tracks[0].family, 'Metales');
assert.strictEqual(tracks[0].shape, 'diamond');
assert.strictEqual(tracks[0].color, '#123456');
assert.strictEqual(notes[0].family, 'Metales');
assert.strictEqual(notes[0].shape, 'diamond');
assert.strictEqual(notes[0].color, '#123456');

assert.strictEqual(getVelocityBase(), 80);
assert.deepStrictEqual(getOpacityScale(), { edge: 0.1, mid: 0.8 });
assert.strictEqual(getGlowStrength(), 1.5);
assert.strictEqual(getGlowStrength('Metales'), 1.2);
assert.strictEqual(getBumpControl(), 1.2);
assert.strictEqual(getBumpControl('Metales'), 1.1);
assert.strictEqual(getContourWidthScale(), 1.5);
assert.strictEqual(getContourWidthScale('Metales'), 1.2);
assert.strictEqual(getVisibleSeconds(), 6);
assert.deepStrictEqual(getHeightScaleConfig(), { global: 1, families: {} });

const exported = JSON.parse(exportConfiguration());
assert.deepStrictEqual(exported, config);

console.log('Pruebas de exportación e importación completadas');
