const assert = require('assert');
const { setSuperSampling, getSuperSampling } = require('./script');

setSuperSampling(1.5);
assert.strictEqual(getSuperSampling(), 1.5);

setSuperSampling(2.5);
assert.strictEqual(getSuperSampling(), 1.5);

console.log('Pruebas de controles de animación completadas');
