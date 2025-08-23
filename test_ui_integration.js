const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeUI } = require('./ui');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<button id="play-stop"></button>
<button id="seek-forward"></button>
<button id="seek-backward"></button>
<button id="restart"></button>
<button id="aspect-16-9"></button>
<button id="aspect-9-16"></button>
<button id="full-screen"></button>
</body></html>`);

global.document = dom.window.document;

let playing = false;
let playCalls = 0;
let stopCalls = 0;
let forwardCalls = 0;

initializeUI({
  isPlaying: () => playing,
  onPlay: () => {
    playing = true;
    playCalls++;
  },
  onStop: () => {
    playing = false;
    stopCalls++;
  },
  onForward: () => {
    forwardCalls++;
  },
  onBackward: () => {},
  onRestart: () => {},
  onAspect169: () => {},
  onAspect916: () => {},
  onFullScreen: () => {},
});

document.getElementById('play-stop').click();
document.getElementById('play-stop').click();
document.getElementById('seek-forward').click();

assert.strictEqual(playCalls, 1);
assert.strictEqual(stopCalls, 1);
assert.strictEqual(forwardCalls, 1);

console.log('Pruebas de integración de UI completadas');
