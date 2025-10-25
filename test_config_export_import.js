const assert = require('assert');
const {
  assignTrackInfo,
  exportConfiguration,
  importConfiguration,
  getVelocityBase,
  getOpacityScale,
  getGlowStrength,
  getBumpControl,
  getVisibleSeconds,
  getHeightScaleConfig,
  getShapeStretch,
  getFamilyStretch,
} = require('./script.js');
const { getOutlineSettings, resetOutlineSettings } = require('./utils.js');

const tracks = assignTrackInfo([{ name: 'Flauta', events: [] }]);
const notes = [
  {
    start: 0,
    end: 1,
    noteNumber: 60,
    velocity: 64,
    color: tracks[0].color,
    shape: tracks[0].shape,
    secondaryColor: tracks[0].secondaryColor,
    family: tracks[0].family,
    instrument: tracks[0].instrument,
  },
];

resetOutlineSettings();

const config = {
  assignedFamilies: { Flauta: 'Metales' },
  familyCustomizations: {
    Metales: { color: '#123456', shape: 'diamond', secondaryColor: '#222222' },
  },
  enabledInstruments: { Flauta: true },
  velocityBase: 80,
  opacityScale: { edge: 0.1, mid: 0.8 },
  glowStrength: { global: 1.5, families: { Metales: 1.2 } },
  bumpControl: { global: 1.2, families: { Metales: 1.1 } },
  visibleSeconds: 6,
  heightScale: { global: 2, families: {} },
  shapeStretch: {
    circle: true,
    circleDouble: false,
    square: true,
    squareDouble: false,
    roundedSquare: false,
    roundedSquareDouble: false,
    diamond: false,
    diamondDouble: false,
    fourPointStar: true,
    fourPointStarDouble: false,
    sixPointStar: false,
    sixPointStarDouble: false,
    triangle: true,
    triangleDouble: false,
  },
  shapeExtensions: {
    circle: true,
    circleDouble: false,
    square: true,
    squareDouble: false,
    roundedSquare: true,
    roundedSquareDouble: false,
    diamond: true,
    diamondDouble: false,
    fourPointStar: true,
    fourPointStarDouble: false,
    sixPointStar: false,
    sixPointStarDouble: false,
    triangle: true,
    triangleDouble: false,
  },
  familyExtensions: { Metales: true },
  familyStretch: { Metales: false },
  familyLineSettings: {},
  familyTravelSettings: {},
  outlineSettings: {
    global: {
      enabled: true,
      mode: 'full',
      width: 4,
      color: '#654321',
      opacity: 0.75,
    },
    families: {
      Metales: {
        enabled: true,
        mode: 'post',
        width: 6,
        color: '#abcdef',
        opacity: 0.5,
      },
    },
  },
};

importConfiguration(config, tracks, notes);

const globalOutline = getOutlineSettings();
assert.deepStrictEqual(globalOutline, config.outlineSettings.global);
const familyOutline = getOutlineSettings('Metales');
assert.strictEqual(familyOutline.mode, 'post');
assert.strictEqual(familyOutline.width, 6);
assert.strictEqual(familyOutline.color, '#abcdef');
assert.strictEqual(familyOutline.opacity, 0.5);
assert.strictEqual(familyOutline.enabled, true);

assert.strictEqual(tracks[0].family, 'Metales');
assert.strictEqual(tracks[0].shape, 'diamond');
assert.strictEqual(tracks[0].color, '#123456');
assert.strictEqual(tracks[0].secondaryColor, '#222222');
assert.strictEqual(notes[0].family, 'Metales');
assert.strictEqual(notes[0].shape, 'diamond');
assert.strictEqual(notes[0].color, '#123456');
assert.strictEqual(notes[0].secondaryColor, '#222222');

assert.strictEqual(getVelocityBase(), 80);
assert.deepStrictEqual(getOpacityScale(), { edge: 0.1, mid: 0.8 });
assert.strictEqual(getGlowStrength(), 1.5);
assert.strictEqual(getGlowStrength('Metales'), 1.2);
assert.strictEqual(getBumpControl(), 1.2);
assert.strictEqual(getBumpControl('Metales'), 1.1);
assert.strictEqual(getVisibleSeconds(), 6);
assert.deepStrictEqual(getHeightScaleConfig(), { global: 2, families: {} });
assert.strictEqual(getShapeStretch('roundedSquare'), false);
assert.strictEqual(getShapeStretch('diamond'), false);
assert.strictEqual(getFamilyStretch('Metales'), false);

const exported = JSON.parse(exportConfiguration());
assert.deepStrictEqual(exported, config);

resetOutlineSettings();

console.log('Pruebas de exportación e importación completadas');
