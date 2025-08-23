const assert = require('assert');
const { parseMIDI, parseMusicXML } = require('./script.js');

// Prueba para parseMIDI con un archivo mínimo en memoria
function testParseMIDI() {
  const header = [
    0x4d, 0x54, 0x68, 0x64, // 'MThd'
    0x00, 0x00, 0x00, 0x06, // length
    0x00, 0x00, // format 0
    0x00, 0x01, // one track
    0x00, 0x60, // division
  ];
  const trackEvents = [
    0x00, 0xff, 0x03, 0x04, 0x74, 0x65, 0x73, 0x74, // track name 'test'
    0x00, 0x90, 0x3c, 0x40, // note on C4
    0x60, 0x80, 0x3c, 0x40, // note off after 96 ticks
    0x00, 0xff, 0x2f, 0x00, // end of track
  ];
  const trackLength = trackEvents.length;
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
  ];
  const bytes = new Uint8Array([...header, ...trackHeader, ...trackEvents]);
  const midi = parseMIDI(bytes.buffer);
  assert.strictEqual(midi.tracks.length, 1);
  assert.strictEqual(midi.tracks[0].name, 'test');
  const note = midi.tracks[0].events.find((e) => e.type === 'note');
  assert(note);
  assert.strictEqual(note.noteNumber, 60);
  assert.strictEqual(note.duration, 96);
  console.log('parseMIDI OK');
}

// Prueba básica para parseMusicXML
function testParseMusicXML() {
  const xml = `
    <score-partwise version="3.1">
      <part-list>
        <score-part id="P1">
          <part-name>Piano</part-name>
        </score-part>
      </part-list>
      <part id="P1">
        <measure number="1">
          <attributes>
            <divisions>1</divisions>
          </attributes>
          <note>
            <pitch>
              <step>C</step>
              <octave>4</octave>
            </pitch>
            <duration>1</duration>
          </note>
        </measure>
      </part>
    </score-partwise>`;
  const result = parseMusicXML(xml);
  assert.strictEqual(result.tracks.length, 1);
  const note = result.tracks[0].events[0];
  assert.strictEqual(note.noteNumber, 60);
  console.log('parseMusicXML OK');
}

testParseMIDI();
testParseMusicXML();
