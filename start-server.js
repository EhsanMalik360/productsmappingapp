#!/usr/bin/env node

// Optimized server startup script for high-efficiency large data imports
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Determine if we're running on Render
const isRender = !!process.env.RENDER;
console.log(`Running in ${isRender ? 'Render' : 'local'} environment`);

// Determine available memory - include swap space in calculation for more accurate assessment
const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
const freeMemGB = Math.round(os.freemem() / (1024 * 1024 * 1024));
console.log(`System memory: ${freeMemGB}GB free of ${totalMemGB}GB total`);

// Calculate appropriate memory limit based on environment and workload type
let memoryLimitMB;
let isLargeImportMode = process.env.LARGE_IMPORT_MODE === 'true';

// If environment variable is not set, auto-detect based on memory
if (isRender && process.env.LARGE_IMPORT_MODE === undefined) {
  // For 4GB+ instances, default to large import mode
  isLargeImportMode = totalMemGB >= 4;
  console.log(`Auto-detected LARGE_IMPORT_MODE: ${isLargeImportMode}`);
}

if (isRender) {
  // On Render, be more precise with memory allocation
  const renderMemGB = process.env.RENDER_MEMORY_GB || totalMemGB;
  console.log(`Render instance with ${renderMemGB}GB RAM`);
  
  if (isLargeImportMode) {
    // For large imports: use more memory, but with safety margin
    memoryLimitMB = Math.floor(renderMemGB * 0.75 * 1024);
    console.log('🔄 Running in LARGE IMPORT MODE - will use more memory but apply stricter GC');
  } else {
    // For normal operation: more conservative
    memoryLimitMB = Math.floor(renderMemGB * 0.6 * 1024);
  }
  
  // Cap at reasonable limits based on available memory
  memoryLimitMB = Math.min(memoryLimitMB, renderMemGB * 0.8 * 1024);
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

// Set optimal GC and memory parameters based on workload type
if (isLargeImportMode) {
  // For high-throughput import operations:
  // - Optimize for faster garbage collection
  // - Lower semi-space size means more frequent but faster minor GCs 
  // - Enable incremental marking for better pause time distribution
  // - Optimize for throughput rather than latency
  args.unshift(
    '--optimize-for-size',
    '--max-semi-space-size=32',  // Smaller semi-space for more frequent minor GCs (MB)
    '--incremental-marking',     // Reduce GC pause times by doing work incrementally
    '--max-old-space-size=${memoryLimitMB}', // Explicitly set again for clarity
    '--optimize-for-throughput'  // Optimize for throughput rather than latency
  );
  console.log('🔧 Using optimized GC parameters for large data imports');
} else if (isRender) {
  // Standard Render production mode - balanced approach
  args.unshift(
    '--optimize-for-size',
    '--max-semi-space-size=64',
    '--incremental-marking'
  );
}

// Start server with memory limit
console.log(`Starting Node.js with args: ${args.join(' ')}`);
const serverProcess = spawn('node', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: `--max-old-space-size=${memoryLimitMB}`,
    LARGE_IMPORT_MODE: isLargeImportMode ? 'true' : 'false'
  },
  shell: true
});

// Add better error handling for process management
serverProcess.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle various termination signals
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(signal => {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down server gracefully...`);
    serverProcess.kill(signal);
    
    // Force exit if process doesn't terminate within 5 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  });
});

// Add automatic restart on out-of-memory errors
serverProcess.on('close', (code) => {
  if (code === 137) { // OOM killer
    console.error('Server terminated due to out of memory. Restarting with reduced memory limit...');
    
    // Reduce memory limit by 20% and restart
    memoryLimitMB = Math.floor(memoryLimitMB * 0.8);
    console.log(`Restarting with reduced memory limit: ${Math.round(memoryLimitMB/1024*10)/10}GB`);
    
    // Replace the current process with a new one
    const { execSync } = require('child_process');
    try {
      execSync(`LARGE_IMPORT_MODE=true NODE_OPTIONS="--max-old-space-size=${memoryLimitMB}" node ${__filename}`, {
        stdio: 'inherit'
      });
    } catch (e) {
      console.error('Failed to restart server:', e);
      process.exit(1);
    }
  } else if (code !== 0 && code !== null) {
    console.error(`Server crashed with code ${code}, check logs for details`);
    process.exit(code);
  }
});
