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
  ['triangle', 'lineToCalled'],
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

// Verificación de vértice centrado y extremos alineados con NOTE ON/OFF
const triCtx = {
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
drawNoteShape(triCtx, 'triangle', 0, 0, 10, 10);
assert.strictEqual(triCtx.path.length, 3, 'triángulo con puntos incorrectos');
const [top, right, left] = triCtx.path;
const tol = 1e-6;
assert(Math.abs(top[0] - 5) < tol && Math.abs(top[1]) < tol, 'vértice superior no centrado');
assert(Math.abs(right[0] - 10) < tol && Math.abs(right[1] - 10) < tol, 'extremo derecho mal posicionado');
assert(Math.abs(left[0]) < tol && Math.abs(left[1] - 10) < tol, 'extremo izquierdo mal posicionado');

// Verificación de alineación izquierda/derecha para triángulo alargado
const triCtxWide = {
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
drawNoteShape(triCtxWide, 'triangle', 0, 0, 20, 10);
const xs = triCtxWide.path.map((p) => p[0]);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
assert.strictEqual(minX, 0, 'triángulo alargado no alineado a la izquierda');
assert.strictEqual(maxX, 20, 'triángulo alargado no alineado a la derecha');

console.log('Pruebas de figuras geométricas completadas');
