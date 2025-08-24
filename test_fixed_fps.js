const assert = require('assert');
const { startFixedFPSLoop } = require('./script');

const origSetInterval = global.setInterval;
const origClearInterval = global.clearInterval;
const origRAF = global.requestAnimationFrame;
let capturedDelay = null;
let cleared = false;

global.requestAnimationFrame = () => {
  throw new Error('requestAnimationFrame should not be used');
};

global.setInterval = (fn, delay) => {
  capturedDelay = delay;
  fn();
  return 1;
};
global.clearInterval = (id) => {
  if (id === 1) cleared = true;
};

const stop = startFixedFPSLoop(() => {});
assert(Math.abs(capturedDelay - 1000 / 60) < 1e-6);
stop();
assert(cleared);

global.setInterval = origSetInterval;
global.clearInterval = origClearInterval;
global.requestAnimationFrame = origRAF;

console.log('Pruebas de FPS constantes completadas');
