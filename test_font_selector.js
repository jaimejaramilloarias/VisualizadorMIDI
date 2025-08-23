const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeFontSelector } = require('./ui');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<select id="font-select"><option value="">Fuente</option></select>
<input id="font-size" type="number" value="16" />
</body></html>`, { pretendToBeVisual: true });

global.document = dom.window.document;
global.window = dom.window;

global.navigator = {
  fonts: {
    query: async () => [{ family: 'Arial' }, { family: 'Courier New' }],
  },
};

(async () => {
  const select = document.getElementById('font-select');
  const sizeInput = document.getElementById('font-size');

  await initializeFontSelector({
    select,
    sizeInput,
    target: document.documentElement,
  });

  assert.strictEqual(select.options.length, 3);

  select.value = 'Courier New';
  select.dispatchEvent(new dom.window.Event('change'));
  assert.strictEqual(
    document.documentElement.style.fontFamily,
    '"Courier New", sans-serif'
  );

  sizeInput.value = '20';
  sizeInput.dispatchEvent(new dom.window.Event('input'));
  assert.strictEqual(
    document.documentElement.style.getPropertyValue('--global-font-size'),
    '20px'
  );

  console.log('Prueba de selector de fuente completada');
})();
