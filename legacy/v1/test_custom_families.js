const assert = require('assert');
const { FAMILY_LIST } = require('./script.js');

['Custom 1', 'Custom 2', 'Custom 3', 'Custom 4', 'Custom 5'].forEach(f => {
  assert(
    FAMILY_LIST.includes(f),
    `La familia personalizada ${f} no está presente en FAMILY_LIST`
  );
});

console.log('Pruebas de familias personalizadas completadas');
