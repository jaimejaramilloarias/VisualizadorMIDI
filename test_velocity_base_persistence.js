const assert = require('assert');

const store = {};
global.localStorage = {
  getItem: (k) => store[k],
  setItem: (k, v) => {
    store[k] = v;
  },
};

let { setVelocityBase } = require('./script');

// Establece y persiste la velocidad base
setVelocityBase(90);

// Fuerza la recarga de módulos para simular una nueva sesión
delete require.cache[require.resolve('./script')];
delete require.cache[require.resolve('./utils.js')];
({ getVelocityBase } = require('./script'));

// Debe recuperar el valor persistido
assert.strictEqual(getVelocityBase(), 90);

console.log('Pruebas de persistencia de la velocidad base completadas');
