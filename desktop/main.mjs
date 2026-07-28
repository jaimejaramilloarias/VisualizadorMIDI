import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  Menu,
  net,
  protocol,
  session,
} from 'electron';
import {
  APP_ENTRY_URL,
  APP_HOST,
  APP_SCHEME,
  CONTENT_SECURITY_POLICY,
  isAllowedNavigation,
  resolveRendererRequest,
} from './security.mjs';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

app.enableSandbox();
app.setName('MIDI Stage V2');

const smokeTest = process.argv.includes('--desktop-smoke-test');
const devServerUrl = process.env.MIDI_STAGE_DEV_SERVER_URL ?? null;
let mainWindow = null;

const rendererRoot = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'renderer')
    : path.join(app.getAppPath(), 'dist', 'desktop', 'renderer');

const registerRendererProtocol = () => {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveRendererRequest(
      rendererRoot(),
      request.url,
      request.method,
    );
    if (!filePath) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
};

const secureSession = () => {
  const currentSession = session.defaultSession;

  currentSession.setPermissionCheckHandler(() => false);
  currentSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  if (!devServerUrl) {
    currentSession.webRequest.onBeforeRequest(
      {
        urls: [
          'http://*/*',
          'https://*/*',
          'ws://*/*',
          'wss://*/*',
        ],
      },
      (_details, callback) => callback({ cancel: true }),
    );
  }

  currentSession.webRequest.onHeadersReceived(
    { urls: [`${APP_SCHEME}://${APP_HOST}/*`] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
        },
      });
    },
  );
};

const installApplicationMenu = () => {
  const template = [];
  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push(
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Visualización',
      submenu: [{ role: 'togglefullscreen' }],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const runSmokeCheck = async (window) => {
  try {
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        const response = await fetch('./demo/melodia-triste.midi-stage.json');
        const demoState = await response.json();
        return {
          title: document.title,
          origin: location.origin,
          nodeProcess: typeof globalThis.process,
          nodeRequire: typeof globalThis.require,
          hasRoot: Boolean(document.querySelector('#root')),
          demoAnchors: demoState.syncAnchors?.length ?? 0
        };
      })()
    `);
    const passed =
      result.title === 'MIDI Stage V2' &&
      result.origin === `${APP_SCHEME}://${APP_HOST}` &&
      result.nodeProcess === 'undefined' &&
      result.nodeRequire === 'undefined' &&
      result.hasRoot &&
      result.demoAnchors === 120;

    console.log(`DESKTOP_SMOKE_RESULT=${JSON.stringify(result)}`);
    app.exit(passed ? 0 : 1);
  } catch (error) {
    console.error('DESKTOP_SMOKE_ERROR', error);
    app.exit(1);
  }
};

const createMainWindow = async () => {
  const window = new BrowserWindow({
    title: 'MIDI Stage V2',
    width: 1600,
    height: 1000,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    backgroundColor: '#000000',
    fullscreenable: true,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      autoplayPolicy: 'document-user-activation-required',
      backgroundThrottling: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, devServerUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.on('will-redirect', (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, devServerUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription) => {
      console.error(
        `No fue posible cargar MIDI Stage (${errorCode}): ${errorDescription}`,
      );
      if (smokeTest) app.exit(1);
    },
  );

  if (smokeTest) {
    window.webContents.once('did-finish-load', () => {
      void runSmokeCheck(window);
    });
  } else {
    window.once('ready-to-show', () => window.show());
  }

  await window.loadURL(devServerUrl ?? APP_ENTRY_URL);
  return window;
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.jaimejaramilloarias.midistage');
    registerRendererProtocol();
    secureSession();
    installApplicationMenu();
    mainWindow = await createMainWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = await createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
