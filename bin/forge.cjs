#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the directory where forge was invoked from
const cwd = process.cwd();

// Look for .forge file in current directory
const forgeConfigPath = path.join(cwd, '.forge');

if (!fs.existsSync(forgeConfigPath)) {
  console.error('❌ No .forge configuration file found in current directory');
  console.error('💡 Create a .forge file with your project configuration (similar to .env format)');
  process.exit(1);
}

console.log('✅ Found .forge configuration at:', forgeConfigPath);
console.log('📍 Working directory:', cwd);

// Get the path to this forge installation
const forgeRoot = path.resolve(__dirname, '..');
const electronPath = path.join(forgeRoot, 'node_modules', '.bin', 'electron');
const mainPath = path.join(forgeRoot, 'electron', 'main.cjs');

console.log('📍 Forge root:', forgeRoot);

// Set environment variable to tell the app where to find the .forge config
process.env.FORGE_CONFIG_DIR = cwd;
process.env.FORGE_ROOT = forgeRoot;

// Start Electron with the main.cjs file
const electronProcess = spawn(electronPath, [mainPath], {
  cwd: forgeRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    FORGE_CONFIG_DIR: cwd,
    FORGE_ROOT: forgeRoot
  }
});

electronProcess.on('error', (err) => {
  console.error('❌ Failed to start Forge app:', err);
  process.exit(1);
});

electronProcess.on('exit', (code) => {
  process.exit(code || 0);
});
