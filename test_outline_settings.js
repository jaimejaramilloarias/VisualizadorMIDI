const assert = require('assert');

const utils = require('./utils.js');
const {
  resolveOutlineConfig,
  shouldRenderOutline,
  setInstrumentCustomization,
  clearInstrumentCustomization,
  exportConfiguration,
  importConfiguration,
  sanitizeOutlineOverride,
} = require('./script.js');

const {
  setOutlineSettings,
  getOutlineSettings,
  resetOutlineSettings,
} = utils;

const FAMILY = 'Metales';
const TRACK_NAME = 'Prueba';

resetOutlineSettings();

setOutlineSettings({ enabled: true, width: 3, opacity: 0.6, mode: 'full' });
setOutlineSettings({ mode: 'pre', color: '#abcdef' }, FAMILY);

let outline = getOutlineSettings(FAMILY);
assert.strictEqual(outline.mode, 'pre');
assert.strictEqual(outline.enabled, true);
assert.strictEqual(outline.opacity, 0.6);
assert.strictEqual(outline.color, '#abcdef');

const note = {
  start: 5,
  end: 10,
  family: FAMILY,
  instrument: TRACK_NAME,
  trackName: TRACK_NAME,
};

let resolved = resolveOutlineConfig(note);
assert.strictEqual(resolved.mode, 'pre');
assert.strictEqual(resolved.width, 3);
assert.strictEqual(resolved.color, '#abcdef');

assert.strictEqual(shouldRenderOutline(resolved, 4, note), true);
assert.strictEqual(shouldRenderOutline(resolved, 8, note), false);
assert.strictEqual(shouldRenderOutline(resolved, 12, note), false);

const tracks = [
  {
    name: TRACK_NAME,
    family: FAMILY,
    detectedFamily: FAMILY,
    shape: 'circle',
    color: '#ffffff',
    secondaryColor: '#000000',
  },
];
const notes = [];

setInstrumentCustomization(
  TRACK_NAME,
  { outline: { opacity: 0.9, color: '#123456' } },
  tracks,
  notes,
  0,
);

resolved = resolveOutlineConfig(note);
assert.strictEqual(resolved.opacity, 0.9);
assert.strictEqual(resolved.color, '#123456');
assert.strictEqual(resolved.mode, 'pre');

const override = sanitizeOutlineOverride({
  enabled: true,
  width: 'invalid',
  mode: 'post',
  color: '#FF00FF',
});
assert.deepStrictEqual(override, { enabled: true, mode: 'post', color: '#ff00ff' });

const exported = JSON.parse(exportConfiguration());
assert.ok(exported.outlineSettings);
assert.strictEqual(exported.outlineSettings.global.enabled, true);
assert.strictEqual(exported.outlineSettings.families[FAMILY].mode, 'pre');

setOutlineSettings({ mode: 'post', color: null });
setOutlineSettings({ mode: 'full' }, FAMILY);

importConfiguration(exported, tracks, notes);
outline = getOutlineSettings(FAMILY);
assert.strictEqual(outline.mode, 'pre');
assert.strictEqual(outline.color, '#abcdef');

clearInstrumentCustomization(TRACK_NAME, tracks, notes, 0);
resetOutlineSettings();

console.log('Pruebas de contorno completadas');
