import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        popup: resolve(__dirname, 'src/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        dir: 'dist',
        format: 'iife',
        // Bundle each entry point with all dependencies
        manualChunks: undefined,
      },
      // Disable code splitting - each file should be self-contained
      preserveEntrySignatures: 'strict',
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    // Important: don't create separate chunks
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    {
      name: 'copy-extension-files',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        
        // Copy manifest
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(distDir, 'manifest.json')
        );
        
        // Copy popup HTML
        copyFileSync(
          resolve(__dirname, 'src/popup.html'),
          resolve(distDir, 'popup.html')
        );
        
        // Copy SQL.js WASM file
        try {
          const wasmSource = resolve(__dirname, '../../node_modules/.pnpm/sql.js@1.13.0/node_modules/sql.js/dist/sql-wasm.wasm');
          const wasmDest = resolve(distDir, 'sql-wasm.wasm');
          copyFileSync(wasmSource, wasmDest);
          console.log('✓ Copied sql-wasm.wasm');
        } catch (error) {
          console.warn('Failed to copy WASM file:', error.message);
        }
        
        // Generate icons
        const { execSync } = require('child_process');
        try {
          execSync('node create-icons.js', { cwd: __dirname, stdio: 'inherit' });
        } catch (error) {
          console.warn('Failed to generate icons:', error.message);
        }
        
        console.log('✓ Extension files copied to dist/');
      },
    },
  ],
});
