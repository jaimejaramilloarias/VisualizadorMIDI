const assert = require('assert');
const { computeDynamicBounds, setShapeExtension } = require('./script');

const note = { start: 1, end: 3, shape: 'oval' };
const canvasWidth = 200;
const pixelsPerSecond = 50;
const baseWidth = 10;
const finalWidth = (note.end - note.start) * pixelsPerSecond;

let result = computeDynamicBounds(note, 0.5, canvasWidth, pixelsPerSecond, baseWidth, 'oval');
assert.strictEqual(result.width, baseWidth);

setShapeExtension('oval', false);
result = computeDynamicBounds(note, 0.5, canvasWidth, pixelsPerSecond, baseWidth, 'oval');
assert.strictEqual(result.width, finalWidth);

setShapeExtension('oval', true);
result = computeDynamicBounds(note, 2, canvasWidth, pixelsPerSecond, baseWidth, 'oval');
assert.strictEqual(result.width, baseWidth + (finalWidth - baseWidth) / 2);

console.log('Pruebas de control de extensión de figuras completadas');
