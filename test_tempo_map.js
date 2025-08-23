const assert = require('assert');
const { ticksToSeconds, preprocessTempoMap } = require('./script');

const tempoMap = [
  { time: 0, microsecondsPerBeat: 500000 },
  { time: 480, microsecondsPerBeat: 250000 },
];
const timeDivision = 480;

const pre = preprocessTempoMap(tempoMap, timeDivision);
const t1 = ticksToSeconds(480, pre, timeDivision);
const t2 = ticksToSeconds(960, pre, timeDivision);
assert(Math.abs(t1 - 0.5) < 1e-6);
assert(Math.abs(t2 - 0.75) < 1e-6);

console.log('Pruebas del tempo map completadas');
