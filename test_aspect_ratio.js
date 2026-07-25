const assert = require('assert');
const { calculateCanvasSize } = require('./script.js');

// Helper to compare numbers with tolerance
function almostEqual(actual, expected, eps = 0.5) {
  assert(Math.abs(actual - expected) <= eps, `${actual} !~= ${expected}`);
}

// Non-fullscreen 16:9
let res = calculateCanvasSize('16:9', 720, false, 0, 0, 1);
assert.strictEqual(res.width, 1280);
assert.strictEqual(res.height, 720);
assert.strictEqual(res.styleWidth, 1280);
assert.strictEqual(res.styleHeight, 720);

// Non-fullscreen 9:16
res = calculateCanvasSize('9:16', 720, false, 0, 0, 1);
assert.strictEqual(res.width, 405);
assert.strictEqual(res.styleWidth, 405);

// Fullscreen 16:9 with devicePixelRatio 2
res = calculateCanvasSize('16:9', 720, true, 1920, 1080, 2);
almostEqual(res.styleWidth, 1920);
almostEqual(res.styleHeight, 1080);
assert.strictEqual(res.width, 3840);
assert.strictEqual(res.height, 2160);

// Fullscreen 9:16 in portrait viewport
res = calculateCanvasSize('9:16', 720, true, 1080, 1920, 1);
assert.strictEqual(res.styleWidth, 1080);
assert.strictEqual(res.styleHeight, 1920);
assert.strictEqual(res.width, 1080);
assert.strictEqual(res.height, 1920);

console.log('Aspect ratio tests passed.');
