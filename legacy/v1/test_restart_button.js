const assert = require('assert');
const { restartPlayback } = require('./script.js');
const { createAudioPlayer } = require('./audioPlayer.js');

(async () => {
  let started = false;
  let resumed = false;
  const mockCtx = {
    currentTime: 0,
    state: 'suspended',
    destination: {},
    resume() {
      this.state = 'running';
      resumed = true;
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

  await restartPlayback(
    player,
    () => {},
    () => {},
    () => {
      started = true;
    }
  );

  assert(resumed, 'El contexto de audio no se reanudó');
  assert.strictEqual(player.getStartOffset(), 0, 'El desplazamiento no se reinició');
  assert(started, 'La reproducción no se inició tras presionar Inicio');

  console.log('Prueba del botón Inicio completada');
})();
