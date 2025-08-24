const assert = require('assert');
const { assignTrackInfo, importConfiguration } = require('./script.js');

const tracks = assignTrackInfo([
  { name: 'Flauta 1', events: [] },
  { name: 'Flauta 2', events: [] },
]);

const notes = tracks.map((t) => ({
  family: t.family,
  shape: t.shape,
  instrument: t.instrument,
  trackName: t.name,
}));

const config = {
  assignedFamilies: { 'Flauta 1': 'Metales', 'Flauta 2': 'Voces' },
};

importConfiguration(config, tracks, notes);

assert.strictEqual(tracks[0].family, 'Metales');
assert.strictEqual(tracks[1].family, 'Voces');
assert.strictEqual(notes[0].family, 'Metales');
assert.strictEqual(notes[1].family, 'Voces');

console.log('Pruebas de asignación por nombre de pista completadas');
