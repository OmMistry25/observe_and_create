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
        format: 'es', // ES modules work fine for extensions
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false, // Easier debugging
  },
  plugins: [
    {
      name: 'copy-extension-files',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        
        // Ensure dist directory exists
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

