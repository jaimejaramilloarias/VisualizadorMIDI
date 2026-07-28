import path from 'node:path';

export const APP_SCHEME = 'midi-stage';
export const APP_HOST = 'app';
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/`;

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

const splitRawPath = (requestUrl) => {
  const schemeSeparator = requestUrl.indexOf('://');
  if (schemeSeparator < 0) return null;
  const pathStart = requestUrl.indexOf('/', schemeSeparator + 3);
  if (pathStart < 0) return '/';
  return requestUrl.slice(pathStart).split(/[?#]/u, 1)[0] || '/';
};

const decodePath = (rawPath) => {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
};

export const resolveRendererRequest = (
  rendererRoot,
  requestUrl,
  method = 'GET',
) => {
  if (method !== 'GET' && method !== 'HEAD') return null;

  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== `${APP_SCHEME}:` ||
    parsed.host !== APP_HOST ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }

  const rawPath = splitRawPath(requestUrl);
  const decodedPath = rawPath ? decodePath(rawPath) : null;
  if (
    !decodedPath ||
    decodedPath.includes('\0') ||
    decodedPath.includes('\\')
  ) {
    return null;
  }

  const segments = decodedPath.split('/');
  if (segments.some((segment) => segment === '..')) return null;

  const pathname =
    decodedPath === '/' || decodedPath === ''
      ? '/index.html'
      : decodedPath;
  const candidate = path.resolve(rendererRoot, `.${pathname}`);
  const relative = path.relative(rendererRoot, candidate);
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  return candidate;
};

export const isAllowedNavigation = (targetUrl, devServerUrl = null) => {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  if (
    parsed.protocol === `${APP_SCHEME}:` &&
    parsed.host === APP_HOST &&
    !parsed.username &&
    !parsed.password
  ) {
    return true;
  }

  if (!devServerUrl) return false;
  try {
    return parsed.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
};
