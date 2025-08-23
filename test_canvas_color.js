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
<div id="family-config-panel"></div>
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

dom.window.HTMLCanvasElement.prototype.getContext = function() {
  return {
    fillStyle: '#000',
    fillRect: function() {},
    drawImage: function() {},
    clearRect: function() {},
    beginPath: function() {},
    moveTo: function() {},
    lineTo: function() {},
    arc: function() {},
    ellipse: function() {},
    rect: function() {},
    closePath: function() {},
    fill: function() {},
    stroke: function() {},
  };
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

require('./script.js');

dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

const canvas = dom.window.document.getElementById('visualizer');
const toHex = (val) => {
  if (val.startsWith('#')) return val.toLowerCase();
  const m = val.match(/\d+/g);
  return (
    '#' +
    m
      .slice(0, 3)
      .map((n) => parseInt(n, 10).toString(16).padStart(2, '0'))
      .join('')
  );
};

assert.strictEqual(toHex(canvas.style.backgroundColor), '#000000');

const colorInput = dom.window.document.getElementById('canvas-color-input');
colorInput.value = '#123456';
colorInput.dispatchEvent(new dom.window.Event('change'));

assert.strictEqual(toHex(canvas.style.backgroundColor), '#123456');

console.log('Pruebas de color de canvas completadas');
