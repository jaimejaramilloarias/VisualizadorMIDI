const assert = require('assert');
const {
  assignTrackInfo,
  FAMILY_PRESETS,
  INSTRUMENT_COLOR_SHIFT,
  adjustColorBrightness,
} = require('./script.js');

// Verifica oscurecimiento para instrumentos más graves
const clarinetTrack = assignTrackInfo([{ name: 'Clarinete', events: [] }])[0];
const clarinetBase = FAMILY_PRESETS['Dobles cañas'].color;
const clarinetExpected = adjustColorBrightness(
  clarinetBase,
  INSTRUMENT_COLOR_SHIFT['Clarinete']
);
assert.strictEqual(clarinetTrack.color, clarinetExpected);

// Verifica aclarado para instrumentos más agudos
const trumpetTrack = assignTrackInfo([{ name: 'Trompeta', events: [] }])[0];
const trumpetBase = FAMILY_PRESETS['Metales'].color;
const trumpetExpected = adjustColorBrightness(
  trumpetBase,
  INSTRUMENT_COLOR_SHIFT['Trompeta']
);
assert.strictEqual(trumpetTrack.color, trumpetExpected);

console.log('Pruebas de variaciones de color por instrumento completadas');
