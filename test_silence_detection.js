const assert = require('assert');
const { detectTrimOffset } = require('./wavLoader.js');

const sampleRate = 44100;
const silence = new Float32Array(sampleRate / 2); // 0.5 s de silencio
const signal = new Float32Array(sampleRate / 2);
signal.fill(0.2);
const channel = new Float32Array(silence.length + signal.length);
channel.set(silence, 0);
channel.set(signal, silence.length);

const offset = detectTrimOffset(channel, sampleRate);
assert(Math.abs(offset - 0.5) < 0.01);
console.log('Silence detection tests passed');
