#!/usr/bin/env node

/**
 * Custom build script for Chrome extension
 * Builds each script file separately as IIFE to avoid import issues
 */

const { build } = require('vite');
const { resolve } = require('path');
const { copyFileSync, mkdirSync, existsSync } = require('fs');

async function buildScript(name, inputPath) {
  console.log(`Building ${name}...`);
  
  await build({
    build: {
      rollupOptions: {
        input: inputPath,
        output: {
          entryFileNames: `${name}.js`,
          dir: 'dist',
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
      outDir: 'dist',
      emptyOutDir: false,
      minify: false,
    },
  });
  
  console.log(`✓ Built ${name}.js`);
}

async function buildAll() {
  try {
    const distDir = resolve(__dirname, 'dist');
    
    // Clean dist directory
    if (existsSync(distDir)) {
      require('fs').rmSync(distDir, { recursive: true });
    }
    mkdirSync(distDir, { recursive: true });
    
    // Build each script separately
    await buildScript('background', resolve(__dirname, 'src/background.ts'));
    await buildScript('content', resolve(__dirname, 'src/content.ts'));
    await buildScript('popup', resolve(__dirname, 'src/popup.ts'));
    await buildScript('offscreen', resolve(__dirname, 'src/offscreen.ts'));
    
    // Copy static files
    console.log('\nCopying static files...');
    
    copyFileSync(
      resolve(__dirname, 'manifest.json'),
      resolve(distDir, 'manifest.json')
    );
    console.log('✓ Copied manifest.json');
    
    copyFileSync(
      resolve(__dirname, 'src/popup.html'),
      resolve(distDir, 'popup.html')
    );
    console.log('✓ Copied popup.html');
    
    copyFileSync(
      resolve(__dirname, 'src/offscreen.html'),
      resolve(distDir, 'offscreen.html')
    );
    console.log('✓ Copied offscreen.html');
    
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
    try {
      require('child_process').execSync('node create-icons.js', {
        cwd: __dirname,
        stdio: 'inherit'
      });
    } catch (error) {
      console.warn('Failed to generate icons:', error.message);
    }
    
    console.log('\n✅ Extension build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

buildAll();

