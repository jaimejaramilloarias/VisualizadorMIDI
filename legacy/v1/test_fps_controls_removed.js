const assert = require('assert');
const fs = require('fs');
const {
  setFPSMode,
  getFPSMode,
  setFixedFPS,
  getFixedFPS,
  startFixedFPSLoop,
} = require('./script.js');

const html = fs.readFileSync('index.html', 'utf8');
assert(html.includes('id="fps-mode"'));
assert(html.includes('id="fps-value"'));

assert.strictEqual(getFPSMode(), 'auto');
setFPSMode('fixed');
assert.strictEqual(getFPSMode(), 'fixed');
setFPSMode('invalid');
assert.strictEqual(getFPSMode(), 'auto');

assert.strictEqual(getFixedFPS(), 90);
setFixedFPS(500);
assert.strictEqual(getFixedFPS(), 240);
setFixedFPS(10);
assert.strictEqual(getFixedFPS(), 30);

const originalRAF = global.requestAnimationFrame;
const originalCancel = global.cancelAnimationFrame;
const originalPerformance = global.performance;
let scheduled = [];
const canceled = [];
let currentNow = 0;

global.performance = { now: () => currentNow };
global.requestAnimationFrame = (fn) => {
  scheduled.push(fn);
  return scheduled.length;
};
global.cancelAnimationFrame = (id) => {
  canceled.push(id);
};

const deltas = [];
const stop = startFixedFPSLoop((dt) => {
  deltas.push(dt);
}, 50);

function runFrame(time) {
  currentNow = time;
  const cb = scheduled.shift();
  assert(cb, 'No hay frame programado');
  cb(time);
}

assert.strictEqual(scheduled.length, 1);
runFrame(0);
assert.deepStrictEqual(deltas, [0]);
assert.strictEqual(scheduled.length, 1);
runFrame(10);
assert.deepStrictEqual(deltas, [0]);
assert.strictEqual(scheduled.length, 1);
runFrame(30);
assert.deepStrictEqual(deltas, [0, 20]);
assert.strictEqual(scheduled.length, 1);
runFrame(50);
assert.deepStrictEqual(deltas, [0, 20, 20]);

stop();
assert(canceled.length >= 1);

if (originalPerformance) {
  global.performance = originalPerformance;
} else {
  delete global.performance;
}
global.requestAnimationFrame = originalRAF;
global.cancelAnimationFrame = originalCancel;

console.log('Controles de FPS disponibles y funcionales');
