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
  
  // Large file processing settings
  defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || '5000'), // Adjusted default for general purpose
  productImportChunkSize: parseInt(process.env.PRODUCT_IMPORT_CHUNK_SIZE || '1000'), // Specific for product imports
  defaultBatchSize: parseInt(process.env.DEFAULT_BATCH_SIZE || '500'), // Increased from 250 to 500 rows
  maxRows: parseInt(process.env.MAX_ROWS || '1000000'), // Maximum number of rows to process in a single file
  
  // Memory management settings
  forceGCInterval: parseInt(process.env.FORCE_GC_INTERVAL || '5000'), // Run garbage collection more frequently (5s) during large uploads
  highMemoryThreshold: parseInt(process.env.HIGH_MEMORY_THRESHOLD || '1536'), // Increased from 1024MB to 1536MB
  
  // Fetch/network settings
  fetchTimeout: parseInt(process.env.FETCH_TIMEOUT || '120000'), // Increased from 60s to 120s for large operations
  retryCount: parseInt(process.env.RETRY_COUNT || '5'), // Number of retries for fetch operations
  retryDelay: parseInt(process.env.RETRY_DELAY || '3000'), // Increased from 2s to 3s
  
  // Database settings
  supabaseUrl: process.env.SUPABASE_URL || 'https://your_project_url.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || 'your_service_key_here',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  databaseTimeout: parseInt(process.env.DATABASE_TIMEOUT || '60000'), // Increased from 30s to 60s
  databasePoolSize: parseInt(process.env.DATABASE_POOL_SIZE || '30'), // Increased from 20 to 30 connections
  
  // Required fields for various data types - these can be overridden via the API
  requiredFields: {
    product: ['Title', 'Brand', 'Sale Price'], // EAN is NOT required, will be generated if missing
    supplier: ['Supplier Name', 'Cost']
  }
};

module.exports = config; 