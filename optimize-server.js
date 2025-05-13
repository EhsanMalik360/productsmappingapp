// Optimized server startup with npm run server
const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 Starting server with memory optimizations via npm run server...');

// Check available memory
const mem = process.memoryUsage();
console.log('Available memory:', Math.round(mem.heapTotal / 1024 / 1024), 'MB');

// Set environment variables for optimization
process.env.EXTREME_OPTIMIZATION = 'true';
process.env.DEFAULT_CHUNK_SIZE = '50';
process.env.DEFAULT_BATCH_SIZE = '10';
process.env.FORCE_GC_INTERVAL = '1000';
process.env.HIGH_MEMORY_THRESHOLD = '512';
process.env.MAX_ROWS = '50000';
process.env.CONCURRENT_PROCESSING = '1';
process.env.LOW_MEMORY_MODE = 'true';
process.env.CSV_HIGH_WATER_MARK = '16';
process.env.CSV_OBJECT_HIGH_WATER_MARK = '50';

console.log('Enabling extreme optimization mode with the following settings:');
console.log('- DEFAULT_CHUNK_SIZE:', process.env.DEFAULT_CHUNK_SIZE);
console.log('- DEFAULT_BATCH_SIZE:', process.env.DEFAULT_BATCH_SIZE);
console.log('- MAX_ROWS:', process.env.MAX_ROWS);
console.log('- LOW_MEMORY_MODE:', process.env.LOW_MEMORY_MODE);

// Create a temporary .env file with optimized settings if needed
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

  fs.writeFileSync('.env.opt', envContent);
  console.log('Created temporary .env.opt file with optimized settings');
  console.log('Please add your Supabase credentials to this file if needed');
}

// Start the server using npm run server with optimized environment
console.log('Starting server with npm run server...');

try {
  execSync('npm run server', { 
    stdio: 'inherit', 
    env: {
      ...process.env,
      EXTREME_OPTIMIZATION: 'true',
      NODE_OPTIONS: '--expose-gc --optimize-for-size --max-old-space-size=2048 --gc-interval=100'
    }
  });
} catch (error) {
  console.error('Error starting server:', error);
  process.exit(1);
} 