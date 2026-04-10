import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
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
  optimizeDeps: {
    // Exclude transformers so Vite doesn't pre-bundle it (avoids WASM issues)
    exclude: ['@huggingface/transformers'],
  },
  plugins: [viteSingleFile()],
});
