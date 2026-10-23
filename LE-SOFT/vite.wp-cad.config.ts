import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: process.cwd(),
  publicDir: false,
  base: './',
  build: {
    outDir: resolve(process.cwd(), '../wordpress-plugin/le-make-sales-portal/assets/cad-viewer'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: resolve(process.cwd(), 'src/wpCadViewerEntry.ts'),
      output: {
        entryFileNames: 'cad-viewer.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
