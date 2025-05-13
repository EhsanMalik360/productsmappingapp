// Optimized server startup with memory limits
import { execSync } from 'child_process';
import fs from 'fs';

// Check available memory
const mem = process.memoryUsage();
console.log('Available memory:', Math.round(mem.heapTotal / 1024 / 1024), 'MB');

// Set appropriate memory limit based on available system memory
const memoryLimit = Math.min(3072, Math.max(1024, Math.round(mem.heapTotal / 1024 / 1024)));
console.log(`Setting memory limit to ${memoryLimit}MB`);

// Enable garbage collection
const gcFlags = '--expose-gc';

// Options that help with memory usage
const v8Flags = '--optimize-for-size --max-old-space-size=' + memoryLimit + ' --gc-interval=100';

// Check if we're using the extreme optimized .env file
if (!fs.existsSync('.env') && fs.existsSync('.env.extreme')) {
  console.log('No .env file found. Copying .env.extreme to .env...');
  fs.copyFileSync('.env.extreme', '.env');
}

// Start the server with memory optimizations
const command = `node ${gcFlags} ${v8Flags} src/server/index.js`;
console.log('Starting server with command:', command);

try {
  execSync(command, { stdio: 'inherit' });
} catch (error) {
  console.error('Error starting server:', error);
  process.exit(1);
}