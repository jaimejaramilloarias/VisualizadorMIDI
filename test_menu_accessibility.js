const assert = require('assert');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<nav id="top-menu">
  <button id="load-midi"></button>
  <button id="load-wav"></button>
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
</nav>
<canvas id="visualizer" width="800" height="720"></canvas>
<input id="midi-file-input" />
<input id="wav-file-input" />
<select id="family-parameter-select"></select>
<input id="family-height-control" data-output="family-height-value" />
<span id="family-height-value"></span>
<input id="family-glow-control" data-output="family-glow-value" />
<span id="family-glow-value"></span>
<input id="family-bump-control" data-output="family-bump-value" />
<span id="family-bump-value"></span>
<input type="checkbox" id="family-extension-toggle" />
<nav id="bottom-menu">
  <button id="toggle-family-panel"></button>
  <button id="developer-mode"></button>
  <button id="tap-tempo-mode"></button>
</nav>
<div id="family-config-panel"><div id="developer-controls"></div></div>
<div id="assignment-modal"></div>
<div id="modal-instrument-list"></div>
<div id="modal-family-zones"></div>
<button id="apply-assignments"></button>
<div id="tap-tempo-panel"></div>
<button id="start-tap-tempo"></button>
<button id="stop-tap-tempo"></button>
<div id="tap-tempo-status"></div>
<div id="tap-tempo-editor"></div>
<canvas id="tap-waveform"></canvas>
<input id="tap-zoom" />
<input id="tap-position" />
<button id="tap-marker-add"></button>
<button id="tap-marker-delete"></button>
<div id="tap-tooltip"></div>
</body></html>`, { runScripts: 'outside-only' });

global.window = dom.window;
global.document = dom.window.document;

global.alert = () => {};
dom.window.alert = global.alert;

global.Image = dom.window.Image;

dom.window.innerWidth = 1280;
dom.window.innerHeight = 720;

class StubAudioContext {
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
    const source = {
      connect() {},
      start() {},
      stop() {},
      onended: null,
    };
    return source;
  }
}

global.AudioContext = StubAudioContext;
global.webkitAudioContext = StubAudioContext;
dom.window.AudioContext = StubAudioContext;
dom.window.webkitAudioContext = StubAudioContext;

const contexts = [];
dom.window.HTMLCanvasElement.prototype.getContext = function () {
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

let rafId = 0;
const rafTimers = new Map();
const raf = (cb) => {
  const id = ++rafId;
  const timer = setTimeout(() => {
    rafTimers.delete(id);
    cb(Date.now());
  }, 0);
  rafTimers.set(id, timer);
  return id;
};
const caf = (id) => {
  const timer = rafTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    rafTimers.delete(id);
  }
};

global.requestAnimationFrame = raf;
global.cancelAnimationFrame = caf;
dom.window.requestAnimationFrame = raf;
dom.window.cancelAnimationFrame = caf;

const script = require('./script.js');

dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

dom.window.__setTestNotes([
  {
    start: 0,
    end: 2,
    noteNumber: 60,
    velocity: 90,
    color: '#ffffff',
    shape: 'roundedSquare',
    family: 'Metales',
  },
]);

const loadBtn = dom.window.document.getElementById('load-midi');
const toggleBtn = dom.window.document.getElementById('toggle-family-panel');
const playBtn = dom.window.document.getElementById('play-stop');

const initialLoadDisabled = loadBtn.disabled;
const initialToggleDisabled = toggleBtn.disabled;

const delay = () => new Promise((resolve) => setTimeout(resolve, 0));

(async () => {
  playBtn.click();
  await delay();

  assert.strictEqual(loadBtn.disabled, true, 'El botón de carga debe bloquearse durante la reproducción');
  assert.strictEqual(
    toggleBtn.disabled,
    true,
    'El panel de familias debe bloquearse durante la reproducción'
  );

  playBtn.click();
  await delay();

  assert.strictEqual(
    loadBtn.disabled,
    initialLoadDisabled,
    'El botón de carga debe restaurar su estado original tras pausar'
  );
  assert.strictEqual(
    toggleBtn.disabled,
    initialToggleDisabled,
    'El botón del panel de familias debe restaurar su estado tras pausar'
  );

  console.log('Pruebas de accesibilidad de menús tras pausa completadas');
})();
