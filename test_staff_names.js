const assert = require('assert');
const { parseMIDI, assignTrackInfo } = require('./script.js');

function testParseMIDITrackNames() {
  const header = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x01,
    0x00, 0x02,
    0x00, 0x60,
  ];

  const track1Events = [
    0x00, 0xff, 0x03, 0x06, 0x46, 0x6c, 0x61, 0x75, 0x74, 0x61,
    0x00, 0x90, 0x3c, 0x40,
    0x60, 0x80, 0x3c, 0x40,
    0x00, 0xff, 0x2f, 0x00,
  ];
  const track2Events = [
    0x00, 0xff, 0x03, 0x08, 0x54, 0x72, 0x6f, 0x6d, 0x70, 0x65, 0x74, 0x61,
    0x00, 0x90, 0x3e, 0x40,
    0x60, 0x80, 0x3e, 0x40,
    0x00, 0xff, 0x2f, 0x00,
  ];

  const track1Length = track1Events.length;
  const track2Length = track2Events.length;
  const track1Header = [
    0x4d, 0x54, 0x72, 0x6b,
    (track1Length >> 24) & 0xff,
    (track1Length >> 16) & 0xff,
    (track1Length >> 8) & 0xff,
    track1Length & 0xff,
  ];
  const track2Header = [
    0x4d, 0x54, 0x72, 0x6b,
    (track2Length >> 24) & 0xff,
    (track2Length >> 16) & 0xff,
    (track2Length >> 8) & 0xff,
    track2Length & 0xff,
  ];

  const bytes = new Uint8Array([
    ...header,
    ...track1Header,
    ...track1Events,
    ...track2Header,
    ...track2Events,
  ]);

  const midi = parseMIDI(bytes.buffer);
  const tracks = assignTrackInfo(midi.tracks);
  assert.strictEqual(tracks.length, 2);
  const flauta = tracks.find((t) => t.name === 'Flauta');
  const trompeta = tracks.find((t) => t.name === 'Trompeta');
  assert(flauta);
  assert(trompeta);
  assert.strictEqual(flauta.family, 'Maderas de timbre "redondo"');
  assert.strictEqual(trompeta.family, 'Metales');
  console.log('parseMIDI track names OK');
}

testParseMIDITrackNames();
