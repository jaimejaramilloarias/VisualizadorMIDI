const assert = require('assert');
const {
  parseMIDI,
  parseMusicXML,
  assignTrackInfo,
} = require('./script.js');
const { loadMusicFile } = require('./midiLoader.js');

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

// Prueba para asignación de familia e instrumentación
function testAssignTrackInfo() {
  const tracks = [
    { name: 'Flauta', events: [] },
    { name: 'Desconocido', events: [] },
  ];
  const enriched = assignTrackInfo(tracks);
  const flute = enriched.find((t) => t.name === 'Flauta');
  assert.strictEqual(flute.family, 'Maderas de timbre "redondo"');
  assert.strictEqual(flute.shape, 'oval');
  const unknown = enriched.find((t) => t.name === 'Desconocido');
  assert.strictEqual(unknown.family, 'Desconocida');
  console.log('assignTrackInfo OK');
}

// Prueba de carga de archivo con extensión .musicxml
function testLoadMusicFileMusicXML() {
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

  global.FileReader = class {
    constructor() {
      this.onload = null;
    }
    readAsText(file) {
      if (this.onload) this.onload({ target: { result: file.content } });
    }
    readAsArrayBuffer() {}
  };

  const file = { name: 'test.musicxml', content: xml };
  return loadMusicFile(file, { parseMIDI: () => {}, parseMusicXML }).then((res) => {
    assert.strictEqual(res.tracks.length, 1);
    console.log('loadMusicFile .musicxml OK');
  });
}

// Prueba para parseMusicXML con namespace por defecto
function testParseMusicXMLNamespace() {
  const { JSDOM } = require('jsdom');
  global.DOMParser = new JSDOM().window.DOMParser;
  const xml = `
    <score-partwise version="3.1" xmlns="http://www.musicxml.org/ns/musicxml">
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
  assert.strictEqual(result.tracks[0].events[0].noteNumber, 60);
  delete global.DOMParser;
  console.log('parseMusicXML namespace OK');
}

testParseMIDI();
testParseMusicXML();
testAssignTrackInfo();
testLoadMusicFileMusicXML().catch((err) => {
  console.error(err);
  process.exit(1);
});
testParseMusicXMLNamespace();
