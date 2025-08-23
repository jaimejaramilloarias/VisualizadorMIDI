const assert = require('assert');
const { assignTrackInfo } = require('./script');

const tracks = assignTrackInfo([
  { name: 'Saxofon', events: [] },
  { name: 'Corno frances', events: [] },
]);

assert.strictEqual(tracks[0].instrument, 'Saxofón');
assert.strictEqual(tracks[0].family, 'Saxofones');
assert.strictEqual(tracks[1].instrument, 'Corno francés');
assert.strictEqual(tracks[1].family, 'Metales');

console.log('Pruebas de reconocimiento de tildes completadas');
