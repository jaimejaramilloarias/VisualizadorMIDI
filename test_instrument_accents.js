const assert = require('assert');
const { assignTrackInfo } = require('./script');

const tracks = assignTrackInfo([
  { name: 'Saxofón', events: [] },
  { name: 'Corno francés', events: [] },
  { name: 'SaxofÃ³n', events: [] },
  { name: 'Corno francÃ©s', events: [] },
]);

assert.strictEqual(tracks[0].instrument, 'Saxofon');
assert.strictEqual(tracks[0].family, 'Saxofones');
assert.strictEqual(tracks[1].instrument, 'Corno frances');
assert.strictEqual(tracks[1].family, 'Metales');
assert.strictEqual(tracks[2].instrument, 'Saxofon');
assert.strictEqual(tracks[2].family, 'Saxofones');
assert.strictEqual(tracks[3].instrument, 'Corno frances');
assert.strictEqual(tracks[3].family, 'Metales');

console.log('Pruebas de reconocimiento de tildes completadas');
