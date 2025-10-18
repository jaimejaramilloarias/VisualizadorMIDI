const assert = require('assert');
const fs = require('fs');
const exportsMap = require('./script');

assert.strictEqual('setFPSMode' in exportsMap, false);
assert.strictEqual('getFPSMode' in exportsMap, false);
assert.strictEqual('setFixedFPS' in exportsMap, false);
assert.strictEqual('setFrameWindow' in exportsMap, false);
assert.strictEqual('startFixedFPSLoop' in exportsMap, false);

const html = fs.readFileSync('index.html', 'utf8');
assert(!html.includes('toggle-fps'));

console.log('Controles manuales de FPS eliminados correctamente');
