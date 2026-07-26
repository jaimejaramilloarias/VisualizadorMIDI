import { mkdir, rm, writeFile } from 'node:fs/promises';

const distDirectory = new URL('../dist/', import.meta.url);
const serverDirectory = new URL('../dist/server/', import.meta.url);
const entryPath = new URL('index.js', serverDirectory);

await Promise.all(
  ['assets/', 'icon.svg', 'index.html', 'manifest.webmanifest', 'og.png'].map(
    (path) => rm(new URL(path, distDirectory), { force: true, recursive: true }),
  ),
);
await mkdir(serverDirectory, { recursive: true });
await writeFile(
  entryPath,
  `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || new URL(request.url).pathname.includes(".")) {
      return response;
    }
    return env.ASSETS.fetch(
      new Request(new URL("/index.html", request.url), request),
    );
  },
};
`,
);
