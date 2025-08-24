const assert = require('assert');
const {
  startAutoFPSLoop,
  setFPSMode,
  getFPSMode,
} = require('./script');

const origRAF = global.requestAnimationFrame;
const origCancel = global.cancelAnimationFrame;
const origSetInterval = global.setInterval;
const origPerf = global.performance;

let rafCallback = null;
let canceled = false;
let capturedDt = null;
let now = 0;

global.performance = { now: () => now };
global.setInterval = () => {
  throw new Error('setInterval should not be used');
};
global.requestAnimationFrame = (fn) => {
  rafCallback = fn;
  return 1;
};
global.cancelAnimationFrame = (id) => {
  if (id === 1) canceled = true;
};

const stop = startAutoFPSLoop((dt) => {
  capturedDt = dt;
}, 10, 20);

now = 0;
rafCallback(5);
assert.strictEqual(capturedDt, 10);
now = 5;
rafCallback(40);
assert.strictEqual(capturedDt, 20);

stop();
assert(canceled);

setFPSMode(false);
assert.strictEqual(getFPSMode(), false);
setFPSMode(true);
assert.strictEqual(getFPSMode(), true);

if (origPerf) global.performance = origPerf; else delete global.performance;
global.requestAnimationFrame = origRAF;
global.cancelAnimationFrame = origCancel;
global.setInterval = origSetInterval;

console.log('Pruebas de alternancia de FPS completadas');
