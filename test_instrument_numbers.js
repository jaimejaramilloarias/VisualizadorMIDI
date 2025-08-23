const assert = require('assert');
const { assignTrackInfo } = require('./script');

const tracks = assignTrackInfo([
  { name: 'Flauta 1', events: [] },
  { name: 'Clarinete (Si Bemol) II', events: [] },
  { name: 'Corno francés (Sol) 4', events: [] },
]);

assert.strictEqual(tracks[0].instrument, 'Flauta');
assert.strictEqual(tracks[0].family, 'Maderas de timbre "redondo"');
assert.strictEqual(tracks[1].instrument, 'Clarinete');
assert.strictEqual(tracks[1].family, 'Dobles cañas');
assert.strictEqual(tracks[2].instrument, 'Corno francés');
assert.strictEqual(tracks[2].family, 'Metales');

console.log('Pruebas de reconocimiento de numeración de instrumentos completadas');
