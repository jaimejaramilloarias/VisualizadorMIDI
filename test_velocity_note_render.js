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
dom.window.HTMLCanvasElement.prototype.getContext = function() {
  const ctx = {
    rects: [],
    strokes: [],
    fills: [],
    __pathBounds: null,
    __ensurePath() {
      if (!this.__pathBounds) {
        this.__pathBounds = {
          minX: Infinity,
          minY: Infinity,
          maxX: -Infinity,
          maxY: -Infinity,
        };
      }
    },
    __extendBounds(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.__ensurePath();
      const b = this.__pathBounds;
      if (x < b.minX) b.minX = x;
      if (y < b.minY) b.minY = y;
      if (x > b.maxX) b.maxX = x;
      if (y > b.maxY) b.maxY = y;
    },
    __recordRect() {
      const b = this.__pathBounds;
      if (!b || b.minX === Infinity || b.minY === Infinity) return null;
      return {
        x: b.minX,
        y: b.minY,
        w: Math.max(0, b.maxX - b.minX),
        h: Math.max(0, b.maxY - b.minY),
      };
    },
    rect(x, y, w, h) {
      this.rects.push({ x, y, w, h });
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)) {
        this.__extendBounds(x, y);
        this.__extendBounds(x + w, y + h);
      }
    },
    fillRect() {},
    clearRect() {},
    beginPath() {
      this.__pathBounds = null;
      this.__ensurePath();
    },
    moveTo(x, y) {
      this.__extendBounds(x, y);
    },
    lineTo(x, y) {
      this.__extendBounds(x, y);
    },
    arc(cx, cy, r) {
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return;
      this.__extendBounds(cx - r, cy - r);
      this.__extendBounds(cx + r, cy + r);
    },
    ellipse(cx, cy, rx, ry) {
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
      const radiusX = Number.isFinite(rx) ? rx : 0;
      const radiusY = Number.isFinite(ry) ? ry : radiusX;
      this.__extendBounds(cx - radiusX, cy - radiusY);
      this.__extendBounds(cx + radiusX, cy + radiusY);
    },
    quadraticCurveTo(cpx, cpy, x, y) {
      this.__extendBounds(cpx, cpy);
      this.__extendBounds(x, y);
    },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      this.__extendBounds(cp1x, cp1y);
      this.__extendBounds(cp2x, cp2y);
      this.__extendBounds(x, y);
    },
    closePath() {},
    fill() {
      const rect = this.__recordRect();
      if (rect) this.fills.push(rect);
    },
    stroke() {
      const rect = this.__recordRect();
      if (rect) this.strokes.push(rect);
    },
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
const baseHeight = noteHeight * sizeFactor;
const velBase = script.getVelocityBase();

const notes = [
  { start: 0, end: 1, noteNumber: 60, color: '#fff', shape: 'roundedSquareSolid', family: 'Metales', velocity: velBase },
  { start: 0, end: 1, noteNumber: 62, color: '#fff', shape: 'roundedSquareSolid', family: 'Metales', velocity: velBase * 2 },
];

dom.window.__setTestNotes(notes);

dom.window.__renderFrame(1.1);

const strokes = contexts[1].strokes.filter((stroke) => stroke.w > 0 && stroke.h > 0);
assert.strictEqual(strokes.length, 2, 'Debe dibujar dos contornos tras el note off');

const h1 = strokes[0].h;
const h2 = strokes[1].h;

assert(Math.abs(h1 - baseHeight) < 1e-6);
assert(Math.abs(h2 - baseHeight * 2) < 1e-6);

console.log('Pruebas de altura de notas por velocidad en renderización completadas');
