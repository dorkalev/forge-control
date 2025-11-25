#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the directory where sdlc was invoked from
const cwd = process.cwd();

// Look for .sdlc file in current directory
const sdlcConfigPath = path.join(cwd, '.sdlc');

if (!fs.existsSync(sdlcConfigPath)) {
  console.error('❌ No .sdlc configuration file found in current directory');
  console.error('💡 Create a .sdlc file with your project configuration (similar to .env format)');
  process.exit(1);
}

console.log('✅ Found .sdlc configuration at:', sdlcConfigPath);
console.log('📍 Working directory:', cwd);

// Get the path to this sdlc installation
const sdlcRoot = path.resolve(__dirname, '..');
const electronPath = path.join(sdlcRoot, 'node_modules', '.bin', 'electron');
const mainPath = path.join(sdlcRoot, 'electron', 'main.cjs');

console.log('📍 SDLC root:', sdlcRoot);

// Set environment variable to tell the app where to find the .sdlc config
process.env.SDLC_CONFIG_DIR = cwd;
process.env.SDLC_ROOT = sdlcRoot;

// Start Electron with the main.cjs file
const electronProcess = spawn(electronPath, [mainPath], {
  cwd: sdlcRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    SDLC_CONFIG_DIR: cwd,
    SDLC_ROOT: sdlcRoot
  }
});

electronProcess.on('error', (err) => {
  console.error('❌ Failed to start SDLC app:', err);
  process.exit(1);
});

electronProcess.on('exit', (code) => {
  process.exit(code || 0);
});
