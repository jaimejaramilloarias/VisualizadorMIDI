const assert = require('assert');
const {
  computeDynamicBounds,
  setShapeExtension,
  setShapeExtensionsEnabled,
  getShapeExtension,
  setShapeStretch,
  setShapeStretchEnabled,
  getShapeStretch,
} = require('./script');

const note = { start: 1, end: 3, shape: 'circle' };
const canvasWidth = 200;
const pixelsPerSecond = 50;
const baseWidth = 10;
const finalWidth = (note.end - note.start) * pixelsPerSecond;

let result = computeDynamicBounds(note, 0.5, canvasWidth, pixelsPerSecond, baseWidth, 'circle');
assert.strictEqual(result.width, baseWidth);

setShapeExtension('circle', false);
result = computeDynamicBounds(note, 0.5, canvasWidth, pixelsPerSecond, baseWidth, 'circle');
assert.strictEqual(result.width, finalWidth);

setShapeExtension('circle', true);
result = computeDynamicBounds(note, 2, canvasWidth, pixelsPerSecond, baseWidth, 'circle');
assert.strictEqual(result.width, baseWidth + (finalWidth - baseWidth) / 2);

setShapeStretch('circle', false);
result = computeDynamicBounds(note, 1.5, canvasWidth, pixelsPerSecond, baseWidth, 'circle');
assert.strictEqual(result.width, baseWidth);

setShapeStretch('circle', true);

setShapeExtensionsEnabled(false);
assert.strictEqual(getShapeExtension('circle'), false);
setShapeExtensionsEnabled(true);
assert.strictEqual(getShapeExtension('circle'), true);
assert.strictEqual(getShapeExtension('circleDouble'), true);

setShapeStretchEnabled(false);
assert.strictEqual(getShapeStretch('circle'), false);
setShapeStretchEnabled(true);
assert.strictEqual(getShapeStretch('circle'), true);

const doubleNote = {
  start: 1,
  end: 3,
  shape: 'circleDouble',
  family: 'Percusión',
};
result = computeDynamicBounds(
  doubleNote,
  1,
  canvasWidth,
  pixelsPerSecond,
  baseWidth,
  'circleDouble',
);
assert.strictEqual(result.width, baseWidth);

result = computeDynamicBounds(
  doubleNote,
  2,
  canvasWidth,
  pixelsPerSecond,
  baseWidth,
  'circleDouble',
);
assert.strictEqual(result.width, baseWidth + (finalWidth - baseWidth) / 2);

console.log('Pruebas de control de extensión de figuras completadas');
