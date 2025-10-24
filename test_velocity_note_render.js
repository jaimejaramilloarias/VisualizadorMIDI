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

const contexts = [];
dom.window.HTMLCanvasElement.prototype.getContext = function() {
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

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const script = require('./script.js');

dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

const canvas = dom.window.document.getElementById('visualizer');
const noteHeight = canvas.height / 88;
const sizeFactor = script.getFamilyModifiers('Metales').sizeFactor;
const baseHeight = noteHeight * sizeFactor * script.getHeightScale('Metales');
const velBase = script.getVelocityBase();

const notes = [
  { start: 0, end: 1, noteNumber: 60, color: '#fff', shape: 'square', family: 'Metales', velocity: velBase },
  { start: 0, end: 1, noteNumber: 62, color: '#fff', shape: 'square', family: 'Metales', velocity: velBase * 2 },
];

dom.window.__setTestNotes(notes);

dom.window.__renderFrame(1.3);

const rects = contexts[1].rects;
assert.strictEqual(rects.length, 2, 'Debe dibujar dos rectángulos de contorno tras el note off');

const h1 = rects[0].h;
const h2 = rects[1].h;

assert(Math.abs(h1 - baseHeight) < 1e-6);
assert(Math.abs(h2 - baseHeight * 2) < 1e-6);

console.log('Pruebas de altura de notas por velocidad en renderización completadas');
