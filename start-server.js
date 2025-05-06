#!/usr/bin/env node

// Server startup script with memory settings
const { spawn } = require('child_process');
const path = require('path');

// Determine memory limit based on available system resources
const os = require('os');
const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
const recommendedMem = Math.max(4, Math.min(totalMemGB / 2, 8)); // Between 4GB and 8GB

console.log(`Starting server with ${recommendedMem}GB memory limit`);

// Start server with memory limit
const serverProcess = spawn('node', [
  `--max-old-space-size=${recommendedMem * 1024}`, // Convert GB to MB
  path.join(__dirname, 'src/server/index.js')
], {
  stdio: 'inherit',
  shell: true
});

serverProcess.on('error', (err) => {
  console.error('Failed to start server:', err);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGINT');
});
