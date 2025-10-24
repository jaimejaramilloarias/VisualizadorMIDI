const assert = require('assert');
const { JSDOM } = require('jsdom');

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
<div id="assignment-modal"></div>
<div id="modal-instrument-list"></div>
<div id="modal-family-zones"></div>
<button id="apply-assignments"></button>
<button id="play-stop"></button>
<button id="seek-forward"></button>
<button id="seek-backward"></button>
<button id="restart"></button>
<button id="aspect-16-9"></button>
<button id="aspect-9-16"></button>
<button id="full-screen"></button>
</body></html>`, { runScripts: 'outside-only' });

global.document = dom.window.document;
global.window = dom.window;

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const contexts = [];
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  const ctx = {
    rects: [],
    rect(x, y, w, h) { this.rects.push({ x, y, w, h }); },
    fillRect() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    drawImage() {},
    globalAlpha: 1,
  };
  contexts.push(ctx);
  return ctx;
};

const script = require('./script.js');

dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

const canvas = dom.window.document.getElementById('visualizer');
const center = canvas.width / 2;
const visibleSeconds = script.getVisibleSeconds();
const pixelsPerSecond = canvas.width / visibleSeconds;

const notes = [
  { start: 2, end: 4, noteNumber: 60, color: '#fff', shape: 'square', family: 'Metales', velocity: 64 },
];

dom.window.__setTestNotes(notes);

const offscreen = contexts[1];

offscreen.rects.length = 0;
dom.window.__renderFrame(2);
assert.strictEqual(offscreen.rects.length > 0, true);
const atStart = offscreen.rects[0];
assert(Math.abs(atStart.x - center) <= 0.5, 'El borde izquierdo debe alinearse con el NOTE ON');

offscreen.rects.length = 0;
dom.window.__renderFrame(1.5);
const beforeStart = offscreen.rects[0];
const expectedFuture = Math.round((center + (notes[0].start - 1.5) * pixelsPerSecond) * 2) / 2;
assert(Math.abs(beforeStart.x - expectedFuture) <= 0.5, 'El avance futuro debe mantener el borde alineado al NOTE ON');

offscreen.rects.length = 0;
dom.window.__renderFrame(4.5);
const afterEnd = offscreen.rects[0];
const expectedPast = Math.round((center + (notes[0].start - 4.5) * pixelsPerSecond) * 2) / 2;
assert(Math.abs(afterEnd.x - expectedPast) <= 0.5, 'El retroceso pasado debe mantener el borde alineado al NOTE ON');

console.log('Pruebas de alineación de notas completadas');
