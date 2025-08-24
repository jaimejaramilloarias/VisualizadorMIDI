const assert = require('assert');
const { computeDiamondBounds } = require('./script');

const note = { start: 1, end: 3 };
const canvasWidth = 200;
const pixelsPerSecond = 50;
const baseWidth = 10;

let result = computeDiamondBounds(note, 0.5, canvasWidth, pixelsPerSecond, baseWidth);
assert.strictEqual(result.width, baseWidth);

result = computeDiamondBounds(note, 1.5, canvasWidth, pixelsPerSecond, baseWidth);
assert.strictEqual(result.width, (note.end - note.start) * pixelsPerSecond);

console.log('Prueba de extensión de diamante completada');
