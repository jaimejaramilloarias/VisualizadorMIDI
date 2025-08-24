const assert = require('assert');
const {
  setFixedFPS,
  getFixedFPS,
  setFrameWindow,
  getFrameWindow,
  setSuperSampling,
  getSuperSampling,
} = require('./script');

setFixedFPS(75);
assert.strictEqual(getFixedFPS(), 75);

setFrameWindow(5, 40);
const win = getFrameWindow();
assert.strictEqual(win.min, 5);
assert.strictEqual(win.max, 40);

setSuperSampling(1.5);
assert.strictEqual(getSuperSampling(), 1.5);

console.log('Pruebas de controles de animación completadas');
