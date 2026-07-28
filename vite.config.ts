import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const desktopBuild = mode === 'desktop';

  return {
    plugins: [react()],
    build: {
      target: 'es2022',
      sourcemap: !desktopBuild,
      outDir: desktopBuild
        ? 'dist/desktop/renderer'
        : 'dist/client',
    },
    worker: {
      format: 'es',
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      coverage: {
        reporter: ['text', 'html'],
      },
    },
  };
});
