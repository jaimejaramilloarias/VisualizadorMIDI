const assert = require('assert');
const { startFixedFPSLoop } = require('./script');

const origSetInterval = global.setInterval;
const origClearInterval = global.clearInterval;
let capturedDelay = null;
let cleared = false;

global.setInterval = (fn, delay) => {
  capturedDelay = delay;
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

console.log('Pruebas de FPS constantes completadas');
