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
approx(computeBumpHeight(base, 0, 0, 1), base); // Inicio sin incremento instantáneo
approx(
  computeBumpHeight(base, 0.12, 0, 1),
  13.8134110787,
  1e-6,
); // Aumento progresivo rápido
approx(computeBumpHeight(base, 0.42, 0, 1), 16); // Pico del bump (120%)
approx(computeBumpHeight(base, 0.9, 0, 1), 10.888, 1e-3); // Decaimiento cercano al final
approx(computeBumpHeight(base, 1.2, 0, 1), base); // Regreso tras la extensión del bump
approx(computeBumpHeight(base, 0.42, 0, 1, 0.8), 19.6); // Bump incrementado

// Pruebas para computeGlowAlpha
approx(computeGlowAlpha(0, 0), 1); // Inicio del brillo
approx(computeGlowAlpha(0.1, 0), 2 / 3); // Mitad del efecto extendido
approx(computeGlowAlpha(0.3, 0), 0); // Efecto terminado

// Prueba para applyGlowEffect con desenfoque solo vertical
setGlowStrength(1.5);
const glowCtx = {
  shadowBlur: 0,
  shadowColor: null,
  fillStyle: null,
  ellipses: [],
  gradients: [],
  save() {},
  restore() {},
  beginPath() {},
  ellipse(cx, cy, rx, ry) {
    this.ellipses.push({ cx, cy, rx, ry });
  },
  rect() {},
  fillCalled: 0,
  fill() {
    this.fillCalled += 1;
  },
  createRadialGradient() {
    const stops = [];
    this.gradients.push(stops);
    return {
      addColorStop(pos, color) {
        stops.push({ pos, color });
      },
    };
  },
};
applyGlowEffect(glowCtx, 'square', 0, 0, 10, 10, 0.5);
assert(glowCtx.ellipses.length > 0, 'el glow debe dibujar un halo elíptico');
const largestGlow = glowCtx.ellipses.reduce((max, e) => Math.max(max, e.rx, e.ry), 0);
assert(largestGlow > 10, 'el resplandor debe extenderse más allá de la figura');
assert(glowCtx.shadowBlur > 0, 'shadowBlur no aplicado');
assert(glowCtx.gradients.length > 0, 'el glow debe utilizar un gradiente suave');
assert(glowCtx.fillCalled > 0, 'fill no llamado en glow');

console.log('Pruebas de efectos visuales completadas');
