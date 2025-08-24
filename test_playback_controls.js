const assert = require('assert');
const { computeSeekOffset, resetStartOffset } = require('./script');
const { createAudioPlayer } = require('./audioPlayer.js');

// Pruebas para computeSeekOffset
assert.strictEqual(computeSeekOffset(0, 3, 10, 0), 3); // adelantar dentro del rango
assert.strictEqual(computeSeekOffset(0, -3, 10, 0), 0); // no retrocede por debajo de 0
assert.strictEqual(computeSeekOffset(8, 5, 10, 0), 10); // límite superior sin trim
assert.strictEqual(computeSeekOffset(5, 5, 10, 2), 8); // límite considerando trim

// Prueba para resetStartOffset
assert.strictEqual(resetStartOffset(), 0);

// Prueba para reiniciar cuando la reproducción está detenida
const mockCtx = {
  currentTime: 0,
  state: 'running',
  destination: {},
  resume() {
    this.state = 'running';
    return Promise.resolve();
  },
  createBufferSource() {
    return {
      connect() {},
      start() {},
      stop() {},
    };
  },
};
const player = createAudioPlayer({ createContext: () => mockCtx });
player.loadBuffer({ duration: 10 }, 0);
player.seek(5, 10, 0);
player.stop(false);
assert.strictEqual(player.getStartOffset(), 5);
player.resetStartOffset();
assert.strictEqual(player.getStartOffset(), 0);

console.log('Pruebas de controles de reproducción completadas');

