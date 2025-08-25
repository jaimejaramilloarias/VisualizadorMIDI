const assert = require('assert');
const { setAudioOffset, getAudioOffset } = require('./script');

assert.strictEqual(getAudioOffset(), 0);
setAudioOffset(120);
assert.strictEqual(getAudioOffset(), 120);
setAudioOffset(-50);
assert.strictEqual(getAudioOffset(), -50);
console.log('Pruebas de audio offset completadas');
