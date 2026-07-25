const assert = require('assert');
const { createAudioPlayer } = require('./audioPlayer.js');

class MockBufferSource {
  constructor(ctx) {
    this.ctx = ctx;
    this.buffer = null;
    this.onended = null;
    this.started = false;
    this.stopped = false;
  }
  connect() {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    if (this.onended) this.onended();
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  createBufferSource() {
    return new MockBufferSource(this);
  }
}

const player = createAudioPlayer({ createContext: () => new MockAudioContext() });
// sin audio ni notas
assert.strictEqual(player.canStart([]), false);
// solo audio
player.loadBuffer({ duration: 10 }, 0.5);
assert.strictEqual(player.canStart([]), true);
// solo notas
const playerOnlyNotes = createAudioPlayer({ createContext: () => new MockAudioContext() });
assert.strictEqual(playerOnlyNotes.canStart([{ start: 0, end: 1 }]), true);

const ctx = player.getAudioContext();
player.start([{ start: 0, end: 1 }]);
assert.strictEqual(player.isPlaying(), true);
ctx.currentTime = 2;
player.stop(true);
assert.strictEqual(player.isPlaying(), false);
assert.strictEqual(player.getStartOffset(), 2);
player.seek(3, 10, 0.5);
assert.strictEqual(player.getStartOffset(), 5);
console.log('Audio player tests passed');
