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
<div id="assignment-modal">
  <ul id="modal-instrument-list">
    <li class="instrument-item" data-instrument="Inst1">Inst1</li>
    <li class="instrument-item" data-instrument="Inst2">Inst2</li>
    <li class="instrument-item" data-instrument="Inst3">Inst3</li>
    <li class="instrument-item" data-instrument="Inst4">Inst4</li>
  </ul>
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

global.document = dom.window.document;
global.window = dom.window;

// Stub canvas context
const ctxStub = {
  fillRect: () => {},
  drawImage: () => {},
  clearRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  ellipse: () => {},
  rect: () => {},
  closePath: () => {},
  fill: () => {},
  stroke: () => {},
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

require('./script.js');

dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

const list = dom.window.document.getElementById('modal-instrument-list');
const items = list.querySelectorAll('.instrument-item');

items[0].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
dom.window.document.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));
items[3].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
dom.window.document.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));

assert(Array.from(items).slice(0, 4).every((it) => it.classList.contains('selected')));

// Reinicia la selección para probar arrastre
Array.from(items).forEach((it) => it.classList.remove('selected'));
items[0].classList.add('selected');
const dragEvent = new dom.window.Event('dragstart', { bubbles: true });
dragEvent.dataTransfer = { setData() {}, getData() { return ''; } };
items[0].dispatchEvent(dragEvent);
items[1].dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
dom.window.document.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));
assert(!items[1].classList.contains('selected'));

console.log('Pruebas de selección múltiple con shift en modal completadas');
console.log('Pruebas de arrastre sin selección adicional completadas');
