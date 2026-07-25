const assert = require('assert');
const { assignTrackInfo } = require('./script');

const tracks = assignTrackInfo([
  { name: 'Fl@uta', events: [] },
  { name: 'Tr$mpeta', events: [] },
  { name: 'Vio?lín', events: [] },
]);

assert.strictEqual(tracks[0].instrument, 'Flauta');
assert.strictEqual(tracks[0].family, 'Maderas de timbre "redondo"');
assert.strictEqual(tracks[1].instrument, 'Trompeta');
assert.strictEqual(tracks[1].family, 'Metales');
assert.strictEqual(tracks[2].instrument, 'Violín');
assert.strictEqual(tracks[2].family, 'Cuerdas frotadas');

console.log('Pruebas de reconocimiento de caracteres extraños completadas');
