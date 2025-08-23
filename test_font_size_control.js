const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeFontSizeControl } = require('./ui');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<h1 id="app-title" style="font-size:2.5rem"></h1>
<input type="range" id="font-size-control" value="0.8" />
</body></html>`);

global.document = dom.window.document;

const slider = document.getElementById('font-size-control');
initializeFontSizeControl({ slider, target: document.documentElement });

assert.strictEqual(
  document.documentElement.style.getPropertyValue('--global-font-size'),
  '0.8rem'
);

slider.value = '1.3';
slider.dispatchEvent(new dom.window.Event('input'));

assert.strictEqual(
  document.documentElement.style.getPropertyValue('--global-font-size'),
  '1.3rem'
);

const title = document.getElementById('app-title');
assert.strictEqual(title.style.fontSize, '2.5rem');

console.log('Prueba de control de tamaño de fuente completada');

