// Optimized server startup with memory limits (ES Modules version)
import { execSync } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting server with memory optimizations (ESM)...');

// Check available memory
const mem = process.memoryUsage();
console.log('Available memory:', Math.round(mem.heapTotal / 1024 / 1024), 'MB');

// Set appropriate memory limit based on available system memory
const memoryLimit = Math.min(3072, Math.max(1024, Math.round(mem.heapTotal / 1024 / 1024)));
console.log(`Setting memory limit to ${memoryLimit}MB`);

// Enable garbage collection
const gcFlags = '--expose-gc';

// Options that help with memory usage
const v8Flags = `--optimize-for-size --max-old-space-size=${memoryLimit} --gc-interval=100`;

// Set environment variable for extreme optimization
process.env.EXTREME_OPTIMIZATION = 'true';
console.log('Enabling extreme optimization mode');

// Check if we need to create a temporary .env file with optimized settings
if (!fs.existsSync('.env')) {
  console.log('No .env file found. Creating temporary .env with extreme optimization settings...');
  
  const envContent = `# EXTREME Memory optimization settings
EXTREME_OPTIMIZATION=true
DEFAULT_CHUNK_SIZE=50
DEFAULT_BATCH_SIZE=10
FORCE_GC_INTERVAL=1000
HIGH_MEMORY_THRESHOLD=512
MAX_ROWS=50000
CONCURRENT_PROCESSING=1
LOW_MEMORY_MODE=true
CSV_HIGH_WATER_MARK=16
CSV_OBJECT_HIGH_WATER_MARK=50

# Add your Supabase credentials below:
# SUPABASE_URL=your_supabase_url
# SUPABASE_SERVICE_KEY=your_service_key
# SUPABASE_ANON_KEY=your_anon_key
`;

  fs.writeFileSync('.env.temp', envContent);
  console.log('Created temporary .env.temp file with optimized settings');
  console.log('Please edit this file to add your Supabase credentials');
}

// Start the server with memory optimizations
const command = `node ${gcFlags} ${v8Flags} src/server/index.js`;
console.log('Starting server with command:', command);

try {
  execSync(command, { stdio: 'inherit', env: {...process.env, EXTREME_OPTIMIZATION: 'true'} });
} catch (error) {
  console.error('Error starting server:', error);
  process.exit(1);
}