const assert = require('assert');
const { setVisibleSeconds, getVisibleSeconds } = require('./script');

setVisibleSeconds(8);
assert.strictEqual(getVisibleSeconds(), 8);
setVisibleSeconds(3.5);
assert.strictEqual(getVisibleSeconds(), 3.5);

console.log('Pruebas de segundos visibles completadas');
