const assert = require('assert');
const { computeDiamondBounds } = require('./script');

const note = { start: 1, end: 3 };
const canvasWidth = 200;
const pixelsPerSecond = 50;
const baseWidth = 10;
const finalWidth = (note.end - note.start) * pixelsPerSecond;

let result = computeDiamondBounds(note, 0.5, canvasWidth, pixelsPerSecond, baseWidth);
assert.strictEqual(result.width, baseWidth);

result = computeDiamondBounds(note, 2, canvasWidth, pixelsPerSecond, baseWidth);
assert.strictEqual(result.width, baseWidth + (finalWidth - baseWidth) / 2);

result = computeDiamondBounds(note, 3, canvasWidth, pixelsPerSecond, baseWidth);
assert.strictEqual(result.width, finalWidth);

console.log('Prueba de extensión de diamante completada');
