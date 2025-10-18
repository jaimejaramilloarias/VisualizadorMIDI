const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeUI } = require('./ui');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<button id="play-stop"></button>
<button id="seek-forward"></button>
<button id="seek-backward"></button>
<button id="seek-forward-arrow"></button>
<button id="seek-backward-arrow"></button>
<button id="restart"></button>
<button id="refresh-animation"></button>
<button id="aspect-16-9"></button>
<button id="aspect-9-16"></button>
<button id="full-screen"></button>
</body></html>`);

global.document = dom.window.document;

let playing = false;
let playCalls = 0;
let stopCalls = 0;
let forwardCalls = 0;
let backwardCalls = 0;
let refreshCalls = 0;

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
  onBackward: () => {
    backwardCalls++;
  },
  onRestart: () => {},
  onRefresh: () => {
    refreshCalls++;
  },
  onAspect169: () => {},
  onAspect916: () => {},
  onFullScreen: () => {},
});

document.getElementById('play-stop').click();
document.getElementById('play-stop').click();
document.getElementById('seek-forward').click();
document.getElementById('seek-forward-arrow').click();
document.getElementById('seek-backward').click();
document.getElementById('seek-backward-arrow').click();
document.getElementById('refresh-animation').click();

assert.strictEqual(playCalls, 1);
assert.strictEqual(stopCalls, 1);
assert.strictEqual(forwardCalls, 2);
assert.strictEqual(backwardCalls, 2);
assert.strictEqual(refreshCalls, 1);

console.log('Pruebas de integración de UI completadas');
