// Server configuration file
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');

// Find and load the .env file from the project root
const rootDir = path.resolve(__dirname, '../..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  console.log(`Loading environment variables from ${envPath}`);
  require('dotenv').config({ path: envPath });
} else {
  console.error(`❌ No .env file found at ${envPath}`);
  // Try loading from current directory as fallback
  require('dotenv').config();
}

// Helper to check if env var is defined and not empty
const getEnvVar = (name, defaultValue) => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.warn(`⚠️ Warning: ${name} environment variable is not set or empty. Using default value.`);
    return defaultValue;
  }
  return value;
};

// Log environment variables availability without showing actual values
console.log('Environment variables check:');
console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Found' : '❌ Missing');
console.log('- SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ Found' : '❌ Missing');
console.log('- SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Found' : '❌ Missing');

// Detect system capabilities
const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
const cpuCount = os.cpus().length;
const isLargeImportMode = process.env.LARGE_IMPORT_MODE === 'true';

console.log(`System resources: ${totalMemGB}GB RAM, ${cpuCount} CPUs, Large Import Mode: ${isLargeImportMode}`);

// Dynamically calculate optimal settings based on available resources
const calculateOptimalSettings = () => {
  // Determine if we're in a resource-constrained environment
  const isResourceConstrained = totalMemGB < 4 || cpuCount < 2;
  
  // Base settings - conservative defaults
  const settings = {
    // File handling
    chunkSize: 500,       // Rows per chunk
    batchSize: 100,       // Database batch size
    maxRows: 1000000,     // Maximum rows per file
    
    // Memory management
    gcInterval: 2000,     // ms between forced GC
    highMemoryThreshold: Math.min(1024, Math.floor(totalMemGB * 1024 * 0.6)),
    
    // Network settings
    fetchTimeout: 30000,  // 30s timeout
    retryCount: 3,
    retryDelay: 1000,
    
    // Database settings
    databaseTimeout: 30000,
    databasePoolSize: 20
  };
  
  // For 4GB+ RAM systems or Large Import Mode, optimize for throughput
  if (!isResourceConstrained || isLargeImportMode) {
    // Scale up with available resources, but cautiously
    settings.chunkSize = Math.min(1000, Math.max(100, Math.floor(totalMemGB * 200)));
    settings.batchSize = Math.min(200, Math.max(50, Math.floor(totalMemGB * 40)));
    settings.databasePoolSize = Math.min(40, Math.max(20, cpuCount * 5));
    
    // More aggressive GC for large imports
    if (isLargeImportMode) {
      settings.gcInterval = 1000;  // More frequent GC
      settings.highMemoryThreshold = Math.floor(totalMemGB * 1024 * 0.75); // Higher threshold
    } else {
      settings.gcInterval = 2000;
      settings.highMemoryThreshold = Math.floor(totalMemGB * 1024 * 0.65);
    }
  } else {
    // For constrained environments, be very conservative
    settings.chunkSize = 250;
    settings.batchSize = 50;
    settings.databasePoolSize = 10;
    settings.gcInterval = 1000;
    settings.highMemoryThreshold = Math.floor(totalMemGB * 1024 * 0.5);
  }
  
  console.log('Calculated optimal settings based on system resources:');
  console.log(`- Chunk size: ${settings.chunkSize} rows`);
  console.log(`- Batch size: ${settings.batchSize} records`);
  console.log(`- Database pool: ${settings.databasePoolSize} connections`);
  console.log(`- Memory threshold: ${Math.round(settings.highMemoryThreshold/1024*10)/10}GB`);
  
  return settings;
};

// Get optimal settings based on environment
const optimalSettings = calculateOptimalSettings();

// Load environment variables with fallbacks
const config = {
  // Server settings
  serverPort: process.env.PORT || 3001,
  
  // Upload settings
  maxFileSize: process.env.MAX_FILE_SIZE || 2147483648, // 2GB max file size by default
  tempFileCleanupInterval: parseInt(process.env.TEMP_FILE_CLEANUP_INTERVAL || '3600000'), // Clean temp files every hour
  
  // Large file processing settings - DYNAMICALLY OPTIMIZED
  defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || optimalSettings.chunkSize.toString()),
  defaultBatchSize: parseInt(process.env.DEFAULT_BATCH_SIZE || optimalSettings.batchSize.toString()),
  maxRows: parseInt(process.env.MAX_ROWS || optimalSettings.maxRows.toString()),
  
  // Memory management settings - DYNAMICALLY OPTIMIZED
  forceGCInterval: parseInt(process.env.FORCE_GC_INTERVAL || optimalSettings.gcInterval.toString()),
  highMemoryThreshold: parseInt(process.env.HIGH_MEMORY_THRESHOLD || optimalSettings.highMemoryThreshold.toString()),
  
  // Resource usage tracking
  systemMemoryGB: totalMemGB,
  systemCPUs: cpuCount,
  isLargeImportMode: isLargeImportMode,
  
  // Fetch/network settings - OPTIMIZED for reliability
  fetchTimeout: parseInt(process.env.FETCH_TIMEOUT || optimalSettings.fetchTimeout.toString()),
  retryCount: parseInt(process.env.RETRY_COUNT || optimalSettings.retryCount.toString()),
  retryDelay: parseInt(process.env.RETRY_DELAY || optimalSettings.retryDelay.toString()),
  
  // Database settings - DYNAMICALLY OPTIMIZED
  supabaseUrl: process.env.SUPABASE_URL || 'https://your_project_url.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || 'your_service_key_here',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  databaseTimeout: parseInt(process.env.DATABASE_TIMEOUT || optimalSettings.databaseTimeout.toString()),
  databasePoolSize: parseInt(process.env.DATABASE_POOL_SIZE || optimalSettings.databasePoolSize.toString()),
  
  // Required fields for various data types - these can be overridden via the API
  requiredFields: {
    product: ['Title', 'Brand', 'Sale Price'], // EAN is NOT required, will be generated if missing
    supplier: ['Supplier Name', 'Cost']
  }
};

// Add some utility methods to the config
config.isHighMemoryEnvironment = () => config.systemMemoryGB >= 4;
config.getThreadCount = () => Math.max(1, Math.min(cpuCount - 1, 4)); // Leave 1 CPU for system, max 4

module.exports = config; 