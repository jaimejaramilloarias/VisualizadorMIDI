const assert = require('assert');
const { drawNoteShape } = require('./script.js');

function stubCtx() {
  const ctx = {
    beginPathCalled: false,
    ellipseCalled: false,
    arcCalled: false,
    rectCalled: false,
    lineToCalled: false,
    moveToCalled: false,
    strokeCalled: false,
    fillCalled: false,
  };
  ctx.beginPath = () => {
    ctx.beginPathCalled = true;
  };
  ctx.ellipse = () => {
    ctx.ellipseCalled = true;
  };
  ctx.arc = () => {
    ctx.arcCalled = true;
  };
  ctx.rect = () => {
    ctx.rectCalled = true;
  };
  ctx.lineTo = () => {
    ctx.lineToCalled = true;
  };
  ctx.moveTo = () => {
    ctx.moveToCalled = true;
  };
  ctx.closePath = () => {};
  ctx.fill = () => {
    ctx.fillCalled = true;
  };
  ctx.stroke = () => {
    ctx.strokeCalled = true;
  };
  return ctx;
}

const shapes = [
  ['oval', 'ellipseCalled'],
  ['capsule', 'arcCalled'],
  ['circle', 'arcCalled'],
  ['square', 'rectCalled'],
  ['diamond', 'lineToCalled'],
  ['star', 'lineToCalled'],
  ['star4', 'lineToCalled'],
  ['pentagon', 'lineToCalled'],
];

shapes.forEach(([shape, expected]) => {
  const ctx = stubCtx();
  drawNoteShape(ctx, shape, 0, 0, 10, 10);
  assert(ctx[expected], `esperado ${expected} para ${shape}`);
  assert(ctx.beginPathCalled, 'beginPath no llamado');
  assert(ctx.fillCalled, 'fill no llamado');
});

// Verificación de vértices centrados y extremos alineados con NOTE ON/OFF
const diaCtx = {
  path: [],
  beginPath() {},
  moveTo(x, y) {
    this.path.push([x, y]);
  },
  lineTo(x, y) {
    this.path.push([x, y]);
  },
  closePath() {},
  fill() {},
};
drawNoteShape(diaCtx, 'diamond', 0, 0, 10, 10);
assert.strictEqual(diaCtx.path.length, 4, 'diamante con puntos incorrectos');
const [left, top, right, bottom] = diaCtx.path;
const tol = 1e-6;
assert(Math.abs(left[0]) < tol && Math.abs(left[1] - 5) < tol, 'extremo izquierdo mal posicionado');
assert(Math.abs(top[0] - 5) < tol && Math.abs(top[1]) < tol, 'vértice superior no centrado');
assert(Math.abs(right[0] - 10) < tol && Math.abs(right[1] - 5) < tol, 'extremo derecho mal posicionado');
assert(Math.abs(bottom[0] - 5) < tol && Math.abs(bottom[1] - 10) < tol, 'vértice inferior mal posicionado');

// Verificación de alineación izquierda/derecha para diamante alargado
const diaCtxWide = {
  path: [],
  beginPath() {},
  moveTo(x, y) {
    this.path.push([x, y]);
  },
  lineTo(x, y) {
    this.path.push([x, y]);
  },
  closePath() {},
  fill() {},
};
drawNoteShape(diaCtxWide, 'diamond', 0, 0, 20, 10);
const xs = diaCtxWide.path.map((p) => p[0]);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
assert.strictEqual(minX, 0, 'diamante alargado no alineado a la izquierda');
assert.strictEqual(maxX, 20, 'diamante alargado no alineado a la derecha');

console.log('Pruebas de figuras geométricas completadas');
