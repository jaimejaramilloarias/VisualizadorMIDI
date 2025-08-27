const assert = require('assert');
const {
  startMidiLearn,
  setTempoSensitivity,
  getTempoMultiplier,
  handleMIDIMessage,
} = require('./script.js');

// Simula la asignación de un control MIDI
startMidiLearn();
handleMIDIMessage({ data: [0xb0, 10, 64] });
// Ajusta sensibilidad y prueba variaciones
setTempoSensitivity(0.02);
handleMIDIMessage({ data: [0xb0, 10, 65] });
assert.ok(Math.abs(getTempoMultiplier() - 1.02) < 1e-6);
handleMIDIMessage({ data: [0xb0, 10, 63] });
assert.ok(Math.abs(getTempoMultiplier() - 0.98) < 1e-6);

console.log('Pruebas de MIDI Learn completadas');
