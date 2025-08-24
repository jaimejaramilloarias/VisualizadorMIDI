const assert = require('assert');
const { assignTrackInfo } = require('./script');

const tracks = assignTrackInfo([
  { name: 'Trompeta en Bb', events: [] },
  { name: 'Clarinete en Si Bemol', events: [] },
  { name: 'Violín solo', events: [] },
]);

assert.strictEqual(tracks[0].instrument, 'Trompeta');
assert.strictEqual(tracks[0].family, 'Metales');
assert.strictEqual(tracks[1].instrument, 'Clarinete');
assert.strictEqual(tracks[1].family, 'Dobles cañas');
assert.strictEqual(tracks[2].instrument, 'Violín');
assert.strictEqual(tracks[2].family, 'Cuerdas frotadas');

console.log('Pruebas de detección automática de familias completadas');
