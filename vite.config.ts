import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    format: 'es',
  },
  build: {
    // PixiJS por sí solo ronda los 600 kB minificado; se separa en su propio chunk cacheable.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'pixi', test: /node_modules[\\/](pixi\.js|@pixi|earcut|eventemitter3|parse-svg-path|ismobilejs|@xmldom|gifuct-js|tiny-lru)/ },
            { name: 'codemirror', test: /node_modules[\\/](@codemirror|@lezer|crelt|style-mod|w3c-keyname)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
