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

console.log('Pruebas de figuras geométricas completadas');
