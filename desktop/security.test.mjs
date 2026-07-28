import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  APP_ENTRY_URL,
  CONTENT_SECURITY_POLICY,
  isAllowedNavigation,
  resolveRendererRequest,
} from './security.mjs';

const rendererRoot = path.resolve('/opt/midi-stage/renderer');

test('resuelve la raíz, Unicode y query dentro del renderer', () => {
  assert.equal(
    resolveRendererRequest(rendererRoot, APP_ENTRY_URL),
    path.join(rendererRoot, 'index.html'),
  );
  assert.equal(
    resolveRendererRequest(
      rendererRoot,
      'midi-stage://app/demo/Melod%C3%ADa.midi?cache=1',
    ),
    path.join(rendererRoot, 'demo', 'Melodía.midi'),
  );
  assert.equal(
    resolveRendererRequest(
      rendererRoot,
      'midi-stage://app/assets/worker.js',
      'HEAD',
    ),
    path.join(rendererRoot, 'assets', 'worker.js'),
  );
});

test('rechaza métodos, hosts y credenciales no permitidos', () => {
  assert.equal(
    resolveRendererRequest(
      rendererRoot,
      'midi-stage://app/index.html',
      'POST',
    ),
    null,
  );
  assert.equal(
    resolveRendererRequest(
      rendererRoot,
      'midi-stage://otro/index.html',
    ),
    null,
  );
  assert.equal(
    resolveRendererRequest(
      rendererRoot,
      'midi-stage://usuario@app/index.html',
    ),
    null,
  );
  assert.equal(
    resolveRendererRequest(rendererRoot, 'https://example.com/'),
    null,
  );
});

test('rechaza traversal, barras de Windows, NUL y escapes rotos', () => {
  for (const requestUrl of [
    'midi-stage://app/%2e%2e/secreto.txt',
    'midi-stage://app/demo/%2E%2E/secreto.txt',
    'midi-stage://app/demo%5Csecreto.txt',
    'midi-stage://app/demo/%00secreto.txt',
    'midi-stage://app/demo/%E0%A4%A',
  ]) {
    assert.equal(
      resolveRendererRequest(rendererRoot, requestUrl),
      null,
      requestUrl,
    );
  }
});

test('limita la navegación al origen local o al servidor de desarrollo exacto', () => {
  assert.equal(isAllowedNavigation(APP_ENTRY_URL), true);
  assert.equal(
    isAllowedNavigation('midi-stage://app/otra-vista'),
    true,
  );
  assert.equal(isAllowedNavigation('https://example.com/'), false);
  assert.equal(
    isAllowedNavigation(
      'http://127.0.0.1:5173/app',
      'http://127.0.0.1:5173',
    ),
    true,
  );
  assert.equal(
    isAllowedNavigation(
      'http://127.0.0.1:5174/app',
      'http://127.0.0.1:5173',
    ),
    false,
  );
});

test('la CSP no permite código remoto, eval, objetos ni frames', () => {
  assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/u);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/u);
  assert.match(CONTENT_SECURITY_POLICY, /worker-src 'self'/u);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/u);
  assert.match(CONTENT_SECURITY_POLICY, /frame-src 'none'/u);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval/u);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /https?:/u);
});
