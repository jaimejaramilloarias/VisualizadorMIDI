const assert = require('assert');
const {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  applyGlowEffect,
  setOpacityScale,
  setGlowStrength,
} = require('./script');

function approx(actual, expected, eps = 1e-6) {
  assert(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);
}

// Pruebas para computeOpacity
approx(computeOpacity(250, 350, 600), 0.5); // Nota cruzando el centro con escala por defecto
approx(computeOpacity(-50, 50, 600), 0); // Nota lejos del centro
approx(computeOpacity(125, 175, 600), 0.25); // Nota a mitad de distancia
setOpacityScale(0, 1);
approx(computeOpacity(250, 350, 600), 1); // Centro al 100%
approx(computeOpacity(125, 175, 600), 0.5); // Gradiente progresivo
setOpacityScale(0, 0.5);

// Pruebas para computeBumpHeight
const base = 10;
approx(computeBumpHeight(base, -0.1, 0, 1), base); // Antes de la nota
approx(computeBumpHeight(base, 0, 0, 1), 15); // En el NOTE ON
approx(computeBumpHeight(base, 0.5, 0, 1), 12.5); // Mitad del intervalo
approx(computeBumpHeight(base, 1, 0, 1), base); // En el NOTE OFF
approx(computeBumpHeight(base, 0, 0, 1, 0.8), 18); // Bump +30%

// Pruebas para computeGlowAlpha
approx(computeGlowAlpha(0, 0), 1); // Inicio del brillo
approx(computeGlowAlpha(0.1, 0), 0.5); // Mitad del efecto
approx(computeGlowAlpha(0.25, 0), 0); // Efecto terminado

// Prueba para applyGlowEffect con desenfoque solo vertical
setGlowStrength(1.5);
const glowCtx = {
  shadowBlur: 0,
  shadowColor: null,
  fillStyle: null,
  save() {},
  restore() {},
  beginPath() {},
  rect(x, y, w, h) {
    this.lastWidth = w;
    this.lastHeight = h;
  },
  fillCalled: false,
  fill() {
    this.fillCalled = true;
  },
};
applyGlowEffect(glowCtx, 'square', 0, 0, 10, 10, 0.5);
assert.strictEqual(glowCtx.lastWidth, 10, 'el glow no debe alterar el ancho');
assert.strictEqual(glowCtx.lastHeight, 15, 'el glow debe escalar solo la altura');
assert(glowCtx.shadowBlur > 0, 'shadowBlur no aplicado');
assert.strictEqual(glowCtx.fillStyle, '#ffffff');
assert(glowCtx.fillCalled, 'fill no llamado en glow');

console.log('Pruebas de efectos visuales completadas');
