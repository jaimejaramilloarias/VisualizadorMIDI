import { mkdir, writeFile } from 'node:fs/promises';

const serverDirectory = new URL('../dist/server/', import.meta.url);
const entryPath = new URL('index.js', serverDirectory);

await mkdir(serverDirectory, { recursive: true });
await writeFile(
  entryPath,
  `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || new URL(request.url).pathname.includes(".")) {
      return response;
    }
    return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
  },
};
`,
);
