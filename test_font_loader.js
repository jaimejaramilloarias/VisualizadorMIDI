const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeFontLoader } = require('./ui');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<button id="load-font">Fuente</button>
<input type="file" id="font-file" />
</body></html>`, { pretendToBeVisual: true });

global.document = dom.window.document;

// Stub FileReader
class StubFileReader {
  readAsArrayBuffer(file) {
    if (this.onload) {
      this.onload({ target: { result: 'data' } });
    }
  }
}
global.FileReader = StubFileReader;

// Stub FontFace and document.fonts
class StubFontFace {
  constructor(name, data) {
    this.family = name;
    this.data = data;
  }
  load() {
    return Promise.resolve(this);
  }
}
global.FontFace = StubFontFace;
document.fonts = { add: () => {} };

const button = document.getElementById('load-font');
const input = document.getElementById('font-file');

let clicked = false;
input.click = () => {
  clicked = true;
};

initializeFontLoader({ button, input, target: document.documentElement });

// Simulate user clicking button which triggers input click
button.dispatchEvent(new dom.window.Event('click'));
assert.strictEqual(clicked, true);

const file = new dom.window.File([''], 'MiFuente.ttf');
Object.defineProperty(input, 'files', {
  value: [file],
});
input.dispatchEvent(new dom.window.Event('change'));

assert.strictEqual(
  document.documentElement.style.fontFamily,
  '"MiFuente", sans-serif'
);

console.log('Prueba de carga de fuente local completada');
