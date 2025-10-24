const assert = require('assert');
const { startAutoFPSLoop } = require('./script');

const originalRAF = global.requestAnimationFrame;
const originalCancel = global.cancelAnimationFrame;
const originalPerformance = global.performance;

let rafCallback = null;
let canceled = false;
const deltas = [];

global.performance = { now: () => 0 };

global.requestAnimationFrame = (fn) => {
  rafCallback = fn;
  return 1;
};

global.cancelAnimationFrame = (id) => {
  if (id === 1) canceled = true;
};

const stop = startAutoFPSLoop((dt) => {
  deltas.push(dt);
}, 10, 20);

rafCallback(0);
rafCallback(5);
rafCallback(30);

assert.strictEqual(deltas.length, 3);
assert.strictEqual(deltas[0], 0);
assert.strictEqual(deltas[1], 5);
assert.strictEqual(deltas[2], 25);

stop();
assert(canceled);

if (originalPerformance) {
  global.performance = originalPerformance;
} else {
  delete global.performance;
}
global.requestAnimationFrame = originalRAF;
global.cancelAnimationFrame = originalCancel;

console.log('Pruebas de FPS automáticos completadas');
