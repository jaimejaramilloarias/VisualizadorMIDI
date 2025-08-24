const assert = require('assert');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<canvas id="visualizer" width="800" height="720"></canvas>
<button id="load-midi"></button>
<input id="midi-file-input" />
<button id="load-wav"></button>
<input id="wav-file-input" />
<select id="instrument-select"></select>
<select id="family-select"></select>
<button id="toggle-family-panel"></button>
<button id="developer-mode"></button>
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
const canvases = [];
dom.window.HTMLCanvasElement.prototype.getContext = function() {
  canvases.push(this);
  const ctx = {
    operations: [],
    fillStyle: '#000',
    lastDrawImageSource: null,
    fillRect: function() { this.operations.push('fillRect'); },
    clearRect: function() { this.operations.push('clearRect'); },
    beginPath: function() { this.operations.push('beginPath'); },
    moveTo: function() { this.operations.push('moveTo'); },
    lineTo: function() { this.operations.push('lineTo'); },
    arc: function() { this.operations.push('arc'); },
    ellipse: function() { this.operations.push('ellipse'); },
    rect: function() { this.operations.push('rect'); },
    closePath: function() { this.operations.push('closePath'); },
    fill: function() { this.operations.push('fill'); },
    stroke: function() { this.operations.push('stroke'); },
    save: function() { this.operations.push('save'); },
    restore: function() { this.operations.push('restore'); },
    drawImage: function(src) { this.lastDrawImageSource = src; this.operations.push('drawImage'); },
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '#000',
  };
  contexts.push(ctx);
  return ctx;
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

require('./script.js');

dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

dom.window.__setTestNotes([
  { start: 0, end: 1, noteNumber: 60, color: '#ff0000', shape: 'square', family: 'Metales' },
]);

dom.window.__renderFrame(0);

assert(contexts[1].operations.includes('rect'), 'La nota no se dibujó en el offscreen canvas');
assert.strictEqual(contexts[0].lastDrawImageSource, canvases[1], 'El canvas principal no recibió la imagen del offscreen');

console.log('Pruebas de renderizado offscreen completadas');
