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

function computeCurvedX(note, time, center, canvasWidth, pixelsPerSecond) {
  const offset = (note.start - time) * pixelsPerSecond;
  if (time > note.end) {
    const linear = center + offset;
    return Math.round(linear * 2) / 2;
  }
  const curvedOffset = applyExpectedCurve(offset, canvasWidth);
  return Math.round((center + curvedOffset) * 2) / 2;
}

function applyExpectedCurve(offset, canvasWidth) {
  if (!Number.isFinite(offset) || offset === 0) {
    return offset;
  }
  const margin = Math.max(canvasWidth * 0.1, 80);
  const maxTravel = canvasWidth / 2 + margin;
  const absOffset = Math.abs(offset);
  if (!Number.isFinite(maxTravel) || maxTravel <= 0 || absOffset >= maxTravel) {
    return offset;
  }
  const normalized = absOffset / maxTravel;
  let adjustedNormalized = normalized;
  if (offset > 0) {
    const magnetZone = 0.25;
    const slowExponent = 2.5;
    const magnetExponent = 0.35;
    if (normalized <= magnetZone) {
      const safeZone = Math.max(magnetZone, Number.EPSILON);
      const magnetT = Math.max(0, Math.min(1, normalized / safeZone));
      const easedMagnet = Math.pow(magnetT, magnetExponent);
      adjustedNormalized = magnetZone * easedMagnet;
    } else {
      const regionT = (normalized - magnetZone) / (1 - magnetZone);
      const easedSlow = 1 - Math.pow(Math.max(0, 1 - regionT), slowExponent);
      adjustedNormalized = magnetZone + (1 - magnetZone) * easedSlow;
    }
    adjustedNormalized = Math.max(normalized, Math.min(1, adjustedNormalized));
  } else {
    const progress = 0.5 + normalized * 0.5;
    if (progress < 0.75) {
      const segmentT = Math.max(Math.min((progress - 0.5) / 0.25, 1), 0);
      const eased = segmentT - 0.8 * segmentT * segmentT * (1 - segmentT) * (1 - segmentT);
      const adjustedProgress = 0.5 + eased * 0.25;
      adjustedNormalized = Math.max(0, Math.min(1, (adjustedProgress - 0.5) / 0.5));
    }
  }
  return Math.sign(offset) * adjustedNormalized * maxTravel;
}

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
const linearFuture = center + (notes[0].start - 1.5) * pixelsPerSecond;
const curvedFuture = computeCurvedX(notes[0], 1.5, center, canvas.width, pixelsPerSecond);
assert(Math.abs(beforeStart.x - curvedFuture) <= 0.5, 'El avance futuro debe respetar la curva de aceleración previa al NOTE ON');
assert(beforeStart.x >= linearFuture + 0.25, 'El viaje previo debe mantener la figura a mayor distancia que el desplazamiento lineal');

offscreen.rects.length = 0;
const timeAfter = 4.2;
dom.window.__renderFrame(timeAfter);
const afterEnd = offscreen.rects[0];
const linearPast = center + (notes[0].start - timeAfter) * pixelsPerSecond;
const curvedPast = computeCurvedX(notes[0], timeAfter, center, canvas.width, pixelsPerSecond);
assert(Math.abs(afterEnd.x - curvedPast) <= 0.5, 'El retroceso posterior al NOTE OFF debe seguir el desplazamiento lineal');
assert(Math.abs(afterEnd.x - linearPast) <= 0.5, 'Sin curva tras el NOTE OFF: la figura debe seguir la posición lineal.');

console.log('Pruebas de alineación de notas completadas');
