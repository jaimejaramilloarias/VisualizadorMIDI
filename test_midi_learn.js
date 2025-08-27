const assert = require('assert');
const {
  startMidiLearn,
  setTempoSensitivity,
  getTempoMultiplier,
  handleMIDIMessage,
  setTempoRange,
} = require('./script.js');

// Simula la asignación de un control MIDI
startMidiLearn();
handleMIDIMessage({ data: [0xb0, 10, 64] });
// Ajusta sensibilidad y rango de tempo
setTempoSensitivity(0.02);
setTempoRange(0.5, 1.5);
// Incrementa dentro del rango
handleMIDIMessage({ data: [0xb0, 10, 127] });
assert.ok(Math.abs(getTempoMultiplier() - 1.5) < 1e-6);
// Intenta disminuir por debajo del mínimo permitido
handleMIDIMessage({ data: [0xb0, 10, 0] });
assert.ok(Math.abs(getTempoMultiplier() - 0.5) < 1e-6);

console.log('Pruebas de MIDI Learn completadas');
