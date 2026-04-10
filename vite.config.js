import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
  // Serve static assets (transformers/, ort-wasm/, models/) from project-root public/ dir.
  // These assets are populated by `npm run setup` and are NOT bundled inline —
  // they are copied to dist/ and loaded at runtime via local fetch.
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Allow larger bundles (transformers.js is ~2MB)
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        // Keep everything in one chunk for single-file output
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [viteSingleFile()],
});
