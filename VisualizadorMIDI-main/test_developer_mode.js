const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeDeveloperMode } = require('./ui');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<button id="dev-btn"></button>
<div id="panel" class="hidden"></div>
</body></html>`);

global.document = dom.window.document;

const { isActive } = initializeDeveloperMode({
  button: document.getElementById('dev-btn'),
  panel: document.getElementById('panel'),
});

document.getElementById('dev-btn').click();
assert.strictEqual(isActive(), true);
assert.strictEqual(
  document.getElementById('panel').classList.contains('hidden'),
  false
);

document.getElementById('dev-btn').click();
assert.strictEqual(isActive(), false);
assert.strictEqual(
  document.getElementById('panel').classList.contains('hidden'),
  true
);

console.log('Pruebas de modo desarrollador completadas');
