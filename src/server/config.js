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

// Load environment variables with fallbacks
const config = {
  // Server settings
  serverPort: process.env.PORT || 3001,
  
  // Upload settings
  maxFileSize: process.env.MAX_FILE_SIZE || 2147483648, // 2GB max file size by default
  tempFileCleanupInterval: parseInt(process.env.TEMP_FILE_CLEANUP_INTERVAL || '3600000'), // Clean temp files every hour
  
  // Large file processing settings - OPTIMIZED for memory efficiency
  defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || '2000'), // REDUCED from 10000 to 2000 rows for less memory usage
  defaultBatchSize: parseInt(process.env.DEFAULT_BATCH_SIZE || '200'), // REDUCED from 500 to 200 for database operations
  maxRows: parseInt(process.env.MAX_ROWS || '1000000'), // Maximum number of rows to process in a single file
  
  // Memory management settings - OPTIMIZED
  forceGCInterval: parseInt(process.env.FORCE_GC_INTERVAL || '2000'), // REDUCED from 5000ms to 2000ms for more frequent GC
  highMemoryThreshold: parseInt(process.env.HIGH_MEMORY_THRESHOLD || '1024'), // REDUCED from 1536MB to 1024MB to be more conservative
  
  // Fetch/network settings - OPTIMIZED for reliability
  fetchTimeout: parseInt(process.env.FETCH_TIMEOUT || '30000'), // REDUCED from 120s to 30s to prevent hanging connections
  retryCount: parseInt(process.env.RETRY_COUNT || '3'), // REDUCED from 5 to 3 for faster failure recovery
  retryDelay: parseInt(process.env.RETRY_DELAY || '1000'), // REDUCED from 3000ms to 1000ms
  
  // Database settings - OPTIMIZED
  supabaseUrl: process.env.SUPABASE_URL || 'https://your_project_url.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || 'your_service_key_here',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  databaseTimeout: parseInt(process.env.DATABASE_TIMEOUT || '30000'), // REDUCED from 60s to 30s
  databasePoolSize: parseInt(process.env.DATABASE_POOL_SIZE || '20'), // REDUCED from 30 to 20 connections
  
  // Required fields for various data types - these can be overridden via the API
  requiredFields: {
    product: ['Title', 'Brand', 'Sale Price'], // EAN is NOT required, will be generated if missing
    supplier: ['Supplier Name', 'Cost']
  }
};

module.exports = config; 