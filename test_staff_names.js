const assert = require('assert');
const { parseMusicXML } = require('./script.js');
const { JSDOM } = require('jsdom');

function testParseMusicXMLStaffNames() {
  global.DOMParser = new JSDOM().window.DOMParser;
  const xml = `
    <score-partwise version="3.1">
      <part-list>
        <score-part id="P1">
          <part-name>Ensemble</part-name>
        </score-part>
      </part-list>
      <part id="P1">
        <measure number="1">
          <attributes>
            <divisions>1</divisions>
            <staff-details number="1">
              <staff-name>Flauta</staff-name>
            </staff-details>
            <staff-details number="2">
              <staff-name>Trompeta</staff-name>
            </staff-details>
          </attributes>
          <note>
            <pitch>
              <step>C</step>
              <octave>4</octave>
            </pitch>
            <duration>1</duration>
            <staff>1</staff>
          </note>
          <note>
            <pitch>
              <step>D</step>
              <octave>4</octave>
            </pitch>
            <duration>1</duration>
            <staff>2</staff>
          </note>
        </measure>
      </part>
    </score-partwise>`;
  const result = parseMusicXML(xml);
  delete global.DOMParser;
  assert.strictEqual(result.tracks.length, 2);
  const flauta = result.tracks.find((t) => t.instrument === 'Flauta');
  const trompeta = result.tracks.find((t) => t.instrument === 'Trompeta');
  assert(flauta);
  assert(trompeta);
  assert.strictEqual(flauta.family, 'Maderas de timbre "redondo"');
  assert.strictEqual(trompeta.family, 'Metales');
  console.log('parseMusicXML staff names OK');
}

testParseMusicXMLStaffNames();

