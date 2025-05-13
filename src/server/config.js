// Server configuration file
require('dotenv').config();
const path = require('path');
const fs = require('fs');

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

// Check if extreme optimization mode is enabled
const extremeMode = process.env.EXTREME_OPTIMIZATION === 'true';
if (extremeMode) {
  console.log('🚨 EXTREME OPTIMIZATION MODE ENABLED 🚨');
}

// Load environment variables with fallbacks
const config = {
  // Server settings
  serverPort: process.env.PORT || 3001,
  
  // Upload settings
  maxFileSize: process.env.MAX_FILE_SIZE || 2147483648, // 2GB max file size by default
  tempFileCleanupInterval: parseInt(process.env.TEMP_FILE_CLEANUP_INTERVAL || '3600000'), // Clean temp files every hour
  
  // Large file processing settings
  defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || (extremeMode ? '50' : '100')),
  defaultBatchSize: parseInt(process.env.DEFAULT_BATCH_SIZE || (extremeMode ? '10' : '20')),
  maxRows: parseInt(process.env.MAX_ROWS || (extremeMode ? '50000' : '250000')),
  
  // Memory management settings
  forceGCInterval: parseInt(process.env.FORCE_GC_INTERVAL || (extremeMode ? '1000' : '5000')),
  highMemoryThreshold: parseInt(process.env.HIGH_MEMORY_THRESHOLD || (extremeMode ? '512' : '1024')),
  concurrentProcessing: parseInt(process.env.CONCURRENT_PROCESSING || (extremeMode ? '1' : '2')),
  lowMemoryMode: process.env.LOW_MEMORY_MODE === 'true' || extremeMode,
  
  // Fetch/network settings
  fetchTimeout: parseInt(process.env.FETCH_TIMEOUT || '120000'),
  retryCount: parseInt(process.env.RETRY_COUNT || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '3000'),
  
  // Database settings
  supabaseUrl: process.env.SUPABASE_URL || 'https://wvgiaeuvyfsdhoxrjmib.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  databaseTimeout: parseInt(process.env.DATABASE_TIMEOUT || '60000'), // Increased from 30s to 60s
  databasePoolSize: parseInt(process.env.DATABASE_POOL_SIZE || '30'), // Increased from 20 to 30 connections
  
  // CSV streaming settings
  csvHighWaterMark: parseInt(process.env.CSV_HIGH_WATER_MARK || (extremeMode ? '16' : '64')) * 1024, // Buffer size in bytes
  csvObjectHighWaterMark: parseInt(process.env.CSV_OBJECT_HIGH_WATER_MARK || (extremeMode ? '50' : '100')), // Objects in memory
  
  // Required fields for various data types - these can be overridden via the API
  requiredFields: {
    product: ['Title', 'Brand', 'Sale Price'],
    supplier: ['Supplier Name', 'EAN', 'Cost']
  }
};

console.log('Config loaded:', {
  supabaseUrl: config.supabaseUrl,
  defaultChunkSize: config.defaultChunkSize,
  defaultBatchSize: config.defaultBatchSize,
  forceGCInterval: config.forceGCInterval,
  highMemoryThreshold: config.highMemoryThreshold,
  maxRows: config.maxRows,
  lowMemoryMode: config.lowMemoryMode,
  csvHighWaterMark: config.csvHighWaterMark,
  csvObjectHighWaterMark: config.csvObjectHighWaterMark
});

module.exports = config; 