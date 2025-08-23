const assert = require('assert');
const { computeOpacity, computeBumpHeight } = require('./script');

function approx(actual, expected, eps = 1e-6) {
  assert(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);
}

// Pruebas para computeOpacity
approx(computeOpacity(250, 350, 600), 1); // Nota cruzando el centro
approx(computeOpacity(-50, 50, 600), 0.05); // Nota lejos del centro
approx(computeOpacity(125, 175, 600), 0.375); // Nota a mitad de distancia

// Pruebas para computeBumpHeight
const base = 10;
approx(computeBumpHeight(base, -0.1, 0, 1), base); // Antes de la nota
approx(computeBumpHeight(base, 0, 0, 1), 15); // En el NOTE ON
approx(computeBumpHeight(base, 0.5, 0, 1), 12.5); // Mitad del intervalo
approx(computeBumpHeight(base, 1, 0, 1), base); // En el NOTE OFF

console.log('Pruebas de efectos visuales completadas');
