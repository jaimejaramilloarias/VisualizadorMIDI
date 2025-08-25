const assert = require('assert');
const { JSDOM } = require('jsdom');
const { initializeDeveloperMode } = require('./ui');
const { setupHelpMessages } = require('./help');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<button id="dev-btn" data-help="Activa modo desarrollador"></button>
<div id="panel" class="hidden"></div>
<button id="play" title="Play" data-help="Reproduce la animación"></button>
</body></html>`);

global.document = dom.window.document;

const devMode = initializeDeveloperMode({
  button: document.getElementById('dev-btn'),
  panel: document.getElementById('panel'),
});

setupHelpMessages(devMode);

const helpDetail = document.querySelector('#play + .help-detail');
assert(helpDetail, 'help detail element should exist');
assert(helpDetail.classList.contains('hidden'));

document.getElementById('dev-btn').click();
assert.strictEqual(helpDetail.classList.contains('hidden'), false);

document.getElementById('dev-btn').click();
assert.strictEqual(helpDetail.classList.contains('hidden'), true);

console.log('Pruebas de mensajes de ayuda completadas');
