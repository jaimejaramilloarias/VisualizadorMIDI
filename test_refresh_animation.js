const assert = require('assert');
const { refreshPlaybackAnimation } = require('./script.js');
const { createAudioPlayer } = require('./audioPlayer.js');

(async () => {
  const notes = [{ start: 0, end: 1 }];
  let resumeCalls = 0;
  const mockCtx = {
    currentTime: 0,
    state: 'suspended',
    destination: {},
    resume() {
      resumeCalls += 1;
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
  player.start(notes, () => {});
  mockCtx.currentTime = 2;
  resumeCalls = 0;

  let stopAnimationCalls = 0;
  const renderedOffsets = [];
  let restarted = false;

  await refreshPlaybackAnimation(
    player,
    () => {
      stopAnimationCalls += 1;
    },
    () => {
      renderedOffsets.push(player.getStartOffset());
    },
    () => {
      restarted = true;
      player.start(notes, () => {});
    },
    { canStart: true }
  );

  assert.strictEqual(stopAnimationCalls, 1, 'stopAnimation no fue llamado exactamente una vez');
  assert(renderedOffsets[0] >= 1.9 && renderedOffsets[0] <= 2.1, 'El render no usó el offset actualizado');
  assert.strictEqual(resumeCalls, 1, 'El contexto de audio no se reanudó durante el refresco');
  assert(restarted, 'La animación no se reinició tras el refresco');
  assert(player.isPlaying(), 'El reproductor debería continuar en reproducción tras el refresco');

  const idleCtx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume() {
      throw new Error('No debería reanudarse el contexto en modo detenido');
    },
    createBufferSource() {
      return {
        connect() {},
        start() {},
        stop() {},
      };
    },
  };

  const idlePlayer = createAudioPlayer({ createContext: () => idleCtx });
  idlePlayer.loadBuffer({ duration: 5 }, 0);

  let restartCalls = 0;
  await refreshPlaybackAnimation(
    idlePlayer,
    () => {},
    () => {
      renderedOffsets.push(idlePlayer.getStartOffset());
    },
    () => {
      restartCalls += 1;
    },
    { canStart: false, shouldRestart: false }
  );

  assert.strictEqual(restartCalls, 0, 'No debe reiniciar cuando shouldRestart es falso');

  console.log('Pruebas de refresco de animación completadas');
})();
