const assert = require('assert');
const { drawNoteShape } = require('./script.js');

function stubCtx() {
  const ctx = {
    beginPathCalled: false,
    operations: new Set(),
    strokeCalled: false,
    fillCalled: false,
    fillRule: 'nonzero',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    miterLimit: 2,
  };
  ctx.beginPath = () => {
    ctx.beginPathCalled = true;
  };
  ctx.save = () => {
    ctx.operations.add('save');
  };
  ctx.restore = () => {
    ctx.operations.add('restore');
  };
  ctx.translate = () => {
    ctx.operations.add('translate');
  };
  ctx.rotate = () => {
    ctx.operations.add('rotate');
  };
  ctx.moveTo = () => {
    ctx.operations.add('moveTo');
  };
  ctx.lineTo = () => {
    ctx.operations.add('lineTo');
  };
  ctx.bezierCurveTo = () => {
    ctx.operations.add('bezierCurveTo');
  };
  ctx.quadraticCurveTo = () => {
    ctx.operations.add('quadraticCurveTo');
  };
  ctx.ellipse = () => {
    ctx.operations.add('ellipse');
  };
  ctx.rect = () => {
    ctx.operations.add('rect');
  };
  ctx.arc = () => {
    ctx.operations.add('arc');
  };
  ctx.closePath = () => {};
  ctx.fill = (rule) => {
    ctx.fillCalled = true;
    ctx.fillRule = rule || 'nonzero';
  };
  ctx.stroke = () => {
    ctx.strokeCalled = true;
  };
  return ctx;
}

const shapeExpectations = [
  ['circle', ['ellipse']],
  ['circleDouble', ['ellipse'], 'skip'],
  ['square', ['rect']],
  ['squareDouble', ['rect'], 'skip'],
  ['roundedSquare', ['quadraticCurveTo']],
  ['roundedSquareDouble', ['quadraticCurveTo'], 'skip'],
  ['diamond', ['moveTo', 'lineTo']],
  ['diamondDouble', ['moveTo', 'lineTo'], 'skip'],
  ['hexagon', ['moveTo', 'lineTo']],
  ['hexagonDouble', ['moveTo', 'lineTo'], 'skip'],
  ['fourPointStar', ['moveTo', 'lineTo']],
  ['fourPointStarDouble', ['moveTo', 'lineTo'], 'skip'],
  ['sixPointStar', ['rect']],
  ['sixPointStarDouble', ['rect'], 'skip'],
  ['triangle', ['lineTo']],
  ['triangleDouble', ['lineTo'], 'skip'],
];

shapeExpectations.forEach(([shape, requiredOps, expectedFillRule]) => {
  const ctx = stubCtx();
  drawNoteShape(ctx, shape, 0, 0, 12, 10);
  assert(ctx.beginPathCalled, `beginPath no llamado para ${shape}`);
  assert(ctx.fillCalled, `fill no llamado para ${shape}`);
  requiredOps.forEach((op) => {
    assert(ctx.operations.has(op), `se esperaba operación ${op} en ${shape}`);
  });
  if (expectedFillRule === 'evenodd') {
    assert.strictEqual(ctx.fillRule, 'evenodd', `se esperaba relleno evenodd en ${shape}`);
  } else if (expectedFillRule === 'nonzero') {
    assert.strictEqual(ctx.fillRule, 'nonzero', `se esperaba relleno nonzero en ${shape}`);
  } else if (expectedFillRule !== 'skip') {
    assert.notStrictEqual(ctx.fillRule, 'evenodd', `relleno evenodd inesperado en ${shape}`);
  }
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

// Verificación de alineación izquierda para figuras dobles extendidas
const circleDoubleCtx = {
  ellipses: [],
  fillStyle: '#fff',
  beginPath() {},
  ellipse(cx, cy, rx, ry) {
    this.ellipses.push({ cx, rx });
  },
  fill() {},
};
drawNoteShape(circleDoubleCtx, 'circleDouble', 0, 0, 20, 10);
assert(circleDoubleCtx.ellipses.length > 0, 'no se dibujó la capa principal del círculo doble');
const firstEllipse = circleDoubleCtx.ellipses[0];
assert.strictEqual(
  Math.round((firstEllipse.cx - firstEllipse.rx) * 1e6) / 1e6,
  0,
  'círculo doble no alineado a la izquierda',
);

const squareDoubleCtx = {
  rects: [],
  fillStyle: '#fff',
  beginPath() {},
  rect(x, y, width, height) {
    this.rects.push({ x, width });
  },
  fill() {},
};
drawNoteShape(squareDoubleCtx, 'squareDouble', 0, 0, 20, 10);
assert(squareDoubleCtx.rects.length > 0, 'no se dibujó la capa principal del cuadrado doble');
assert.strictEqual(squareDoubleCtx.rects[0].x, 0, 'cuadrado doble no alineado a la izquierda');

const triangleDoubleCtx = {
  path: [],
  fillStyle: '#fff',
  beginPath() {
    this.path = [];
  },
  moveTo(x, y) {
    this.path.push([x, y]);
  },
  lineTo(x, y) {
    this.path.push([x, y]);
  },
  closePath() {},
  fill() {
    if (this.path.length && typeof this.firstMinX === 'undefined') {
      const xsTriangle = this.path.map((p) => p[0]);
      this.firstMinX = Math.min(...xsTriangle);
    }
  },
};
drawNoteShape(triangleDoubleCtx, 'triangleDouble', 0, 0, 20, 10);
assert.strictEqual(triangleDoubleCtx.firstMinX, 0, 'triángulo doble no alineado a la izquierda');

// Verificación del grosor dinámico del contorno
const strokeCtx = stubCtx();
drawNoteShape(strokeCtx, 'circle', 0, 0, 40, 10, true);
assert(strokeCtx.strokeCalled, 'stroke no llamado para contorno');
assert(strokeCtx.lineWidth > 1.35, 'grosor de contorno insuficiente');
assert.strictEqual(strokeCtx.lineJoin, 'round', 'lineJoin incorrecto para figura suave');
assert.strictEqual(strokeCtx.lineCap, 'round', 'lineCap incorrecto para figura suave');
assert.strictEqual(strokeCtx.miterLimit, 4, 'miterLimit inesperado en figura suave');

const starStrokeCtx = stubCtx();
drawNoteShape(starStrokeCtx, 'fourPointStar', 0, 0, 40, 20, true);
assert.strictEqual(starStrokeCtx.lineJoin, 'miter', 'lineJoin incorrecto para figura angulosa');
assert.strictEqual(starStrokeCtx.miterLimit, 6, 'miterLimit incorrecto para estrella');
assert.strictEqual(starStrokeCtx.lineCap, 'butt', 'lineCap incorrecto para estrella');

console.log('Pruebas de figuras geométricas completadas');
