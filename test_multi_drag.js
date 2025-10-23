const assert = require('assert');
const { JSDOM } = require('jsdom');

// Stub modules before requiring script.js
const pathML = require.resolve('./midiLoader.js');
require.cache[pathML] = {
  id: pathML,
  filename: pathML,
  loaded: true,
  exports: {
    loadMusicFile: async () => ({
      tracks: [
        { name: 'Inst1' },
        { name: 'Inst2' },
        { name: 'Inst3' },
        { name: 'Inst4' },
      ],
      tempoMap: [],
      timeDivision: 1,
    }),
  },
};

const pathWL = require.resolve('./wavLoader.js');
require.cache[pathWL] = {
  id: pathWL,
  filename: pathWL,
  loaded: true,
  exports: {
    loadWavFile: async () => ({ audioBuffer: null, trimOffset: 0 }),
  },
};

const pathAP = require.resolve('./audioPlayer.js');
require.cache[pathAP] = {
  id: pathAP,
  filename: pathAP,
  loaded: true,
  exports: {
    createAudioPlayer: () => ({
      resetStartOffset() {},
      getAudioContext() { return { state: 'running', currentTime: 0 }; },
      loadBuffer() {},
      getAudioBuffer() { return null; },
      getTrimOffset() { return 0; },
      canStart() { return true; },
      start() { return true; },
      stop() {},
      seek() {},
      isPlaying() { return false; },
      getStartOffset() { return 0; },
      getCurrentTime() { return 0; },
    }),
  },
};

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<canvas id="visualizer" width="800" height="720"></canvas>
<button id="load-midi"></button>
<input id="midi-file-input" />
<button id="load-wav"></button>
<input id="wav-file-input" />
<select id="family-parameter-select"></select>
<input id="family-height-control" data-output="family-height-value" />
<span id="family-height-value"></span>
<input id="family-glow-control" data-output="family-glow-value" />
<span id="family-glow-value"></span>
<input id="family-bump-control" data-output="family-bump-value" />
<span id="family-bump-value"></span>
<input type="checkbox" id="family-extension-toggle" />
<button id="toggle-family-panel"></button>
<div id="family-config-panel"><div id="developer-controls"></div></div>
<div id="assignment-modal">
  <ul id="modal-instrument-list"></ul>
  <div id="modal-family-zones"></div>
</div>
<button id="apply-assignments"></button>
<button id="play-stop"></button>
<button id="seek-forward"></button>
<button id="seek-backward"></button>
<button id="restart"></button>
<button id="aspect-16-9"></button>
<button id="aspect-9-16"></button>
<button id="full-screen"></button>
</body></html>`, { runScripts: 'outside-only' });

global.window = dom.window;
global.document = dom.window.document;
const ctxStub = {
  fillRect() {},
  drawImage() {},
  clearRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  ellipse() {},
  rect() {},
  closePath() {},
  fill() {},
  stroke() {},
  fillStyle: '#000',
};
dom.window.HTMLCanvasElement.prototype.getContext = () => ctxStub;

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

global.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, val) { this.data[key] = String(val); },
  removeItem(key) { delete this.data[key]; },
};

class AudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; }
  resume() {}
  createBufferSource() { return { connect() {}, start() {}, stop() {}, onended: null }; }
  get destination() { return {}; }
}

global.AudioContext = AudioContext;
global.webkitAudioContext = AudioContext;

global.alert = () => {};
global.CSS = { escape: (s) => s };

require('./script.js');

dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
(async () => {
  // Trigger MIDI file load to populate modal
  const fileInput = document.getElementById('midi-file-input');
  Object.defineProperty(fileInput, 'files', { value: [{}] });
  fileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await Promise.resolve();

  const list = document.getElementById('modal-instrument-list');
  const items = list.querySelectorAll('.instrument-item');

  // Select first two items via shift selection
  items[0].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
  dom.window.document.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));
  items[1].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
  dom.window.document.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));

  // Start dragging the first selected item
  items[0].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
  const dataTransfer = {
    data: {},
    setData(fmt, val) { this.data[fmt] = val; },
    getData(fmt) { return this.data[fmt] || ''; },
  };
  const dragEvent = new dom.window.Event('dragstart', { bubbles: true });
  dragEvent.dataTransfer = dataTransfer;
  items[0].dispatchEvent(dragEvent);

  // Drop onto first family zone
  const firstZone = document.querySelector('.family-zone ul');
  const dropEvent = new dom.window.Event('drop', { bubbles: true });
  dropEvent.dataTransfer = dataTransfer;
  firstZone.dispatchEvent(dropEvent);

  assert.strictEqual(firstZone.children.length, 2);
  assert.strictEqual(list.children.length, 2);

  console.log('Prueba de arrastre múltiple de instrumentos completada');
})();
