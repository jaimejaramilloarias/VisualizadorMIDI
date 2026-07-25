const assert = require('assert');
const { JSDOM } = require('jsdom');
const { setupHelpMessages } = require('./help');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<button id="play" title="Play" data-help="Reproduce la animación"></button>
</body></html>`);

global.document = dom.window.document;

setupHelpMessages();

const tooltip = document.querySelector('.tooltip');
assert(tooltip, 'tooltip element should exist');
assert(tooltip.classList.contains('hidden'));

const playBtn = document.getElementById('play');
playBtn.dispatchEvent(new dom.window.Event('mouseenter'));
assert.strictEqual(tooltip.classList.contains('hidden'), false);
assert.strictEqual(tooltip.textContent, 'Reproduce la animación');

playBtn.dispatchEvent(new dom.window.Event('mouseleave'));
assert(tooltip.classList.contains('hidden'));

console.log('Pruebas de mensajes de ayuda completadas');

