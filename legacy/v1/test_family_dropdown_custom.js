const assert = require('assert');
const fs = require('fs');
const script = fs.readFileSync('./script.js', 'utf-8');
const requiredFamilies = ['Custom 1', 'Custom 2', 'Custom 3', 'Custom 4', 'Custom 5'];

requiredFamilies.forEach((family) => {
  assert(
    script.includes(`'${family}':`),
    `La familia ${family} no tiene un valor predeterminado en FAMILY_DEFAULTS`,
  );
  assert(
    script.includes(`'${family}',`),
    `La familia ${family} no está incluida en FAMILY_LIST`,
  );
});

console.log('Pruebas del catálogo de familias personalizadas completadas');
