const assert = require('assert');
const {
  startMidiLearn,
  getTempoMultiplier,
  handleMIDIMessage,
  setTempoRangeBPM,
  setBaseBpm,
} = require('./script.js');

// Simula la asignación de un control MIDI
startMidiLearn();
handleMIDIMessage({ data: [0xb0, 10, 64] });
// Define BPM base y rango
setBaseBpm(120);
setTempoRangeBPM(20);
// Incrementa dentro del rango (120 + 10)
handleMIDIMessage({ data: [0xb0, 10, 127] });
assert.ok(Math.abs(getTempoMultiplier() - 130 / 120) < 1e-6);
// Intenta disminuir por debajo del mínimo permitido (no menos de 10% debajo del base)
setTempoRangeBPM(40);
handleMIDIMessage({ data: [0xb0, 10, 0] });
assert.ok(Math.abs(getTempoMultiplier() - 0.9) < 1e-6);

console.log('Pruebas de MIDI Learn completadas');
