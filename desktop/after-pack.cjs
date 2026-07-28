const path = require('node:path');
const {
  flipFuses,
  getCurrentFuseWire,
  FuseVersion,
  FuseV1Options,
} = require('@electron/fuses');

exports.default = async function afterPack(context) {
  const productFilename = context.packager.appInfo.productFilename;
  let executablePath;

  if (context.electronPlatformName === 'darwin') {
    executablePath = path.join(
      context.appOutDir,
      `${productFilename}.app`,
      'Contents',
      'MacOS',
      productFilename,
    );
  } else if (context.electronPlatformName === 'win32') {
    executablePath = path.join(
      context.appOutDir,
      `${productFilename}.exe`,
    );
  } else {
    return;
  }

  const currentFuseWire = await getCurrentFuseWire(executablePath);
  const fuseConfig = {
    version: FuseVersion.V1,
    // electron-builder signs after this hook. Resetting each temporary slice
    // here would make their CodeResources differ and break Universal merging.
    resetAdHocDarwinSignature: false,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  };

  if (
    Object.prototype.hasOwnProperty.call(
      currentFuseWire,
      FuseV1Options.WasmTrapHandlers,
    )
  ) {
    fuseConfig[FuseV1Options.WasmTrapHandlers] = true;
  }

  await flipFuses(executablePath, fuseConfig);
};
