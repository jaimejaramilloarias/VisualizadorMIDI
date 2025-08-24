const assert = require('assert');
const { startFixedFPSLoop } = require('./script');

const origSetInterval = global.setInterval;
const origClearInterval = global.clearInterval;
const origRAF = global.requestAnimationFrame;
const origPerf = global.performance;

let capturedDelay = null;
let cleared = false;
let capturedDt = null;
let now = 0;

global.performance = { now: () => now };

global.requestAnimationFrame = () => {
  throw new Error('requestAnimationFrame should not be used');
};

global.setInterval = (fn, delay) => {
  capturedDelay = delay;
  now += 50; // simula un retraso grande
  fn();
  return 1;
};
global.clearInterval = (id) => {
  if (id === 1) cleared = true;
};

const stop = startFixedFPSLoop((dt) => {
  capturedDt = dt;
}, 60, 8, 32);
assert(Math.abs(capturedDelay - 1000 / 60) < 1e-6);
assert.strictEqual(capturedDt, 32);
stop();
assert(cleared);

// Probar clamp mínimo
capturedDt = null;
now = 0;
global.setInterval = (fn, delay) => {
  capturedDelay = delay;
  now += 2; // simula retraso pequeño
  fn();
  return 2;
};
const stop2 = startFixedFPSLoop((dt) => {
  capturedDt = dt;
}, 60, 10, 20);
assert.strictEqual(capturedDt, 10);
stop2();

// Restaurar globales
if (origPerf) global.performance = origPerf; else delete global.performance;
global.setInterval = origSetInterval;
global.clearInterval = origClearInterval;
global.requestAnimationFrame = origRAF;

console.log('Pruebas de FPS constantes completadas');
