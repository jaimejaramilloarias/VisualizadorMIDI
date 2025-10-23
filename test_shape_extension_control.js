const assert = require('assert');
const { computeDynamicBounds, setShapeExtension } = require('./script');

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

console.log('Pruebas de control de extensión de figuras completadas');
