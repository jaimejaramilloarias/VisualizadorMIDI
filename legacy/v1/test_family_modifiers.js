const assert = require('assert');
const { getFamilyModifiers, computeNoteWidth } = require('./script');

// Modificadores de familia
function approx(actual, expected, eps = 1e-6) {
  assert(Math.abs(actual - expected) < eps, `${actual} != ${expected}`);
}

const platillos = getFamilyModifiers('Platillos');
approx(platillos.sizeFactor, 1.3);
approx(platillos.bump, 0.5);

const auxiliares = getFamilyModifiers('Auxiliares');
approx(auxiliares.bump, 0.8);

const defaultMods = getFamilyModifiers('Desconocida');
approx(defaultMods.sizeFactor, 1);

// Cálculo del ancho para figuras no alargadas
const notePlatillos = { start: 0, end: 1, shape: 'circle', family: 'Platillos' };
approx(computeNoteWidth(notePlatillos, 10, 20), 23.4);

const noteTambores = { start: 0, end: 1, shape: 'circle', family: 'Tambores' };
approx(computeNoteWidth(noteTambores, 10, 20), 18);

const sustainedDouble = { start: 0, end: 2, shape: 'circleDouble', family: 'Tambores' };
approx(computeNoteWidth(sustainedDouble, 10, 20), 18);

console.log('Pruebas de modificadores de familia completadas');
