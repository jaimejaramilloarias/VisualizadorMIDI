const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('./index.html', 'utf-8');
const dom = new JSDOM(html);
const options = Array.from(dom.window.document.querySelectorAll('#family-select option')).map(o => o.textContent.trim());
['Custom 1', 'Custom 2', 'Custom 3', 'Custom 4', 'Custom 5'].forEach(f => {
  assert(options.includes(f), `La opción ${f} no está en el menú de familias`);
});
console.log('Pruebas del menú de familias personalizadas completadas');
