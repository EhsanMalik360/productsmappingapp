#!/usr/bin/env node

// Server startup script with optimized memory settings for Render deployment
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Determine if we're running on Render
const isRender = !!process.env.RENDER;
console.log(`Running in ${isRender ? 'Render' : 'local'} environment`);

// Determine available memory
const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
const freeMemGB = Math.round(os.freemem() / (1024 * 1024 * 1024));
console.log(`System memory: ${freeMemGB}GB free of ${totalMemGB}GB total`);

// Calculate appropriate memory limit based on environment
let memoryLimitMB;

if (isRender) {
  // On Render, be more conservative with memory usage
  // For a 4GB instance, we want to use at most 2.5GB for Node.js
  const renderMemGB = process.env.RENDER_MEMORY_GB || totalMemGB;
  console.log(`Render instance with ${renderMemGB}GB RAM`);
  
  // Set memory limit to 60% of total memory to leave room for OS and other processes
  memoryLimitMB = Math.floor(renderMemGB * 0.6 * 1024);
  
  // Cap at 2.5GB to avoid OOM issues
  memoryLimitMB = Math.min(memoryLimitMB, 2560);
} else {
  // For local development, can use more memory
  const recommendedMem = Math.max(2, Math.min(totalMemGB / 2, 4));
  memoryLimitMB = Math.floor(recommendedMem * 1024);
}

console.log(`Starting server with ${Math.round(memoryLimitMB/1024*10)/10}GB memory limit (${memoryLimitMB}MB)`);

// Explicitly enable garbage collection
const args = [
  `--max-old-space-size=${memoryLimitMB}`,
  '--expose-gc',
  path.join(__dirname, 'src/server/index.js')
];

// On Render, add additional optimizations
if (isRender) {
  // Optimize for lower latency garbage collection
  args.unshift('--optimize-for-size', '--max-semi-space-size=64');
}

// Start server with memory limit
const serverProcess = spawn('node', args, {
  stdio: 'inherit',
  shell: true
});

serverProcess.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGINT');
});

// Log any crashes and restart
serverProcess.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Server crashed with code ${code}, check logs for details`);
    process.exit(code);
  }
});
