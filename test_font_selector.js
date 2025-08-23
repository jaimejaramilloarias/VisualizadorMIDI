const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeFontSelector } = require('./ui');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<select id="font-select">
  <option value="">Fuente</option>
  <option value="Arial">Arial</option>
</select>
</body></html>`, { pretendToBeVisual: true });

global.document = dom.window.document;

const select = document.getElementById('font-select');

initializeFontSelector({ select, target: document.documentElement });

select.value = 'Arial';
select.dispatchEvent(new dom.window.Event('change'));

assert.strictEqual(document.documentElement.style.fontFamily, '"Arial", sans-serif');

console.log('Prueba de selector de fuente completada');
