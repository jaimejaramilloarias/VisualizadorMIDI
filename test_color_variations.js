const assert = require('assert');
const { assignTrackInfo, FAMILY_PRESETS } = require('./script.js');

// Verifica que los colores se mantienen constantes para instrumentos de la misma familia
const clarinetTrack = assignTrackInfo([{ name: 'Clarinete', events: [] }])[0];
const clarinetBase = FAMILY_PRESETS['Dobles cañas'].color;
assert.strictEqual(clarinetTrack.color, clarinetBase);

const trumpetTrack = assignTrackInfo([{ name: 'Trompeta', events: [] }])[0];
const trumpetBase = FAMILY_PRESETS['Metales'].color;
assert.strictEqual(trumpetTrack.color, trumpetBase);

console.log('Pruebas de colores consistentes por instrumento completadas');
