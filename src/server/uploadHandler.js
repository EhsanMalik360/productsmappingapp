// Server-side file upload handler for large CSV files
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const config = require('./config');
const https = require('https');
const http = require('http');
const fetch = require('node-fetch');
const { Worker } = require('worker_threads');
const workerpool = require('workerpool');
const pool = workerpool.pool();

// Add this function at the top of the file, after imports and before the first route or function

/**
 * Fixes scientific notation in EAN codes
 * @param {string|number} value - The value to fix
 * @returns {string} The fixed string value
 */
function fixScientificNotation(value) {
  if (value === null || value === undefined) return '';
  
  const stringValue = String(value).trim();
  
  // Check if the value is in scientific notation (e.g., 8.40E+11)
  const scientificNotationRegex = /^(\d+\.\d+)e\+(\d+)$/i;
  const match = stringValue.match(scientificNotationRegex);
  
  if (match) {
    // Extract base number and exponent
    const baseNumber = parseFloat(match[1]);
    const exponent = parseInt(match[2], 10);
    
    // Calculate the actual number and convert to string
    // For example: 8.40E+11 becomes 840000000000
    const actualNumber = baseNumber * Math.pow(10, exponent);
    
    // Convert to string and remove any decimal part
    return actualNumber.toFixed(0);
  }
  
  // If not in scientific notation, just return the trimmed string
  return stringValue;
}

// Save original console methods before overriding
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

// Simple logging to file setup
const logFile = path.join(__dirname, '../server.log');

// Simple log function that writes to both console and file
const writeToLog = (...args) => {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  const logMessage = `[${timestamp}] ${message}`;
  
  // Use original console method to avoid recursion
  originalConsole.log(logMessage);
  
  // Append to log file
  try {
    fs.appendFileSync(logFile, logMessage + '\n', { flag: 'a' });
  } catch (err) {
    originalConsole.error(`Error writing to log file: ${err.message}`);
  }
};

// Override console methods to use our logger
console.log = (...args) => writeToLog(...args);
console.warn = (...args) => {
  const message = args.join(' ');
  writeToLog(`[WARN] ${message}`);
};
console.error = (...args) => {
  const message = args.join(' ');
  writeToLog(`[ERROR] ${message}`);
};

// Add initial startup log
console.log('\n==== UPLOAD HANDLER INITIALIZED ====');
console.log('Current timestamp:', new Date().toISOString());

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
console.log('Upload directory setting:', uploadDir);

try {
  if (!fs.existsSync(uploadDir)) {
    console.log(`Upload directory doesn't exist, creating it now...`);
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Created upload directory: ${uploadDir}`);
  }
  
  // Test directory write permissions
  const testFile = path.join(uploadDir, `test-${Date.now()}.txt`);
  fs.writeFileSync(testFile, 'Test file to verify upload directory permissions');
  fs.unlinkSync(testFile);
  console.log('✅ Upload directory exists and is writable');
} catch (err) {
  console.error('❌ ERROR with upload directory:', err);
  console.error('This will cause file uploads to fail. Please fix directory permissions.');
}

console.log('===============================\n');

// Setup fetch with retry functionality
const fetchWithRetry = async (url, options = {}, retries = config.retryCount, delay = config.retryDelay) => {
  try {
    console.log(`Fetching ${url} with ${retries} retries remaining...`);
    const response = await fetch(url, {
      ...options,
      agent: function(_parsedURL) {
        if (_parsedURL.protocol === 'https:') {
          return new https.Agent({ 
            keepAlive: true,
            timeout: config.fetchTimeout,
            rejectUnauthorized: false // WARNING: This accepts self-signed certificates, only use in development
          });
        } else {
          return new http.Agent({ 
            keepAlive: true,
            timeout: config.fetchTimeout
          });
        }
      },
      timeout: config.fetchTimeout
    });
    return response;
  } catch (error) {
    if (retries <= 1) {
      console.error(`Fetch failed after all retry attempts: ${error.message}`);
      throw error;
    }
    
    console.warn(`Fetch attempt failed: ${error.message}. Retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, options, retries - 1, delay * 1.5); // Exponential backoff
  }
};

// Initialize Supabase client
console.log('Setting up Supabase connection...');
const supabaseUrl = config.supabaseUrl;
const supabaseServiceKey = config.supabaseServiceKey;
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase service key exists:', !!supabaseServiceKey);

if (!supabaseServiceKey || supabaseServiceKey === 'your_service_key_here') {
  console.error('\n🚨 WARNING: Supabase service key is missing or using default placeholder value!');
  console.error('Set SUPABASE_SERVICE_KEY in your environment or .env file.\n');
}

// Define a customized createSupabaseClient function with error handling
const createSupabaseClient = () => {
  console.log('Creating Supabase client with custom options...');
  try {
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        fetch: fetchWithRetry
      }
    });
    return client;
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    
    // Create a mock client that logs errors but doesn't throw exceptions
    // This allows the server to still work for file uploads even if Supabase is down
    return {
      from: () => ({
        select: () => ({ data: null, error: new Error('Supabase connection failed') }),
        insert: () => ({ data: null, error: new Error('Supabase connection failed') }),
        update: () => ({ data: null, error: new Error('Supabase connection failed') }),
        delete: () => ({ data: null, error: new Error('Supabase connection failed') }),
        eq: () => ({ data: null, error: new Error('Supabase connection failed') }),
        single: () => ({ data: null, error: new Error('Supabase connection failed') }),
        limit: () => ({ data: null, error: new Error('Supabase connection failed') })
      })
    };
  }
};

// Create the Supabase client with custom options
const supabase = createSupabaseClient();

// Debug function to log import errors to database
async function logImportError(jobId, errorType, errorMessage, errorDetails = null, rowData = null, rowNumber = null, supplierName = null) {
  console.error(`🚨 IMPORT ERROR: ${errorType} - ${errorMessage}`);
  
  try {
    // Try to log to supplier_data_errors table
    const { error: insertError } = await supabase
      .from('supplier_data_errors')
      .insert({
        job_id: jobId,
        supplier_name: supplierName,
        error_type: errorType,
        error_message: errorMessage,
        error_details: errorDetails,
        row_data: rowData,
        row_number: rowNumber
      });
      
    if (insertError) {
      console.error('Failed to log error to database:', insertError);
    }
  } catch (e) {
    console.error('Exception trying to log error:', e);
  }
}

// Test the Supabase connection
(async () => {
  try {
    console.log('Testing Supabase connection...');
    // First, test basic connectivity
    const { data, error } = await supabase.from('import_jobs').select('count').limit(1);
    
    if (error) {
      console.error('❌ Supabase connection test failed:', error);
      console.error('Please check your environment variables and network connection.');
    } else {
      console.log('✅ Successfully connected to Supabase!');
      
      // Now test the suppliers table
      const { data: suppliersData, error: suppliersError } = await supabase
        .from('suppliers')
        .select('count');
        
      if (suppliersError) {
        console.error('❌ Suppliers table test failed:', suppliersError);
      } else {
        console.log('✅ Successfully accessed suppliers table!');
      }
      
      // Test supplier_products table
      const { data: supplierProductsData, error: supplierProductsError } = await supabase
        .from('supplier_products')
        .select('count');
        
      if (supplierProductsError) {
        console.error('❌ supplier_products table test failed:', supplierProductsError);
      } else {
        console.log('✅ Successfully accessed supplier_products table!');
      }
    }
  } catch (err) {
    console.error('❌ Error testing Supabase connection:', err);
    console.error('Full error details:', err);
    console.error('Please check your environment variables and network connection.');
  }
})();

// Add a direct network connectivity test after initialization
console.log('Testing direct network connectivity to Supabase...');
try {
  fetchWithRetry(supabaseUrl)
    .then(response => {
      console.log(`✅ Network connectivity test: Successfully reached ${supabaseUrl} (status: ${response.status})`);
    })
    .catch(error => {
      console.error(`❌ Network connectivity test failed: Cannot reach ${supabaseUrl}`, error);
      console.error('This suggests a network connectivity issue rather than an authentication problem.');
      console.error('Network error details:', error.message);
      
      // Try to diagnose if it's a DNS issue or network connectivity issue
      fetchWithRetry('https://www.google.com')
        .then(response => {
          console.log('✅ Internet connectivity test: Successfully reached google.com');
          console.log('This suggests the issue is specific to the Supabase URL, not general internet connectivity.');
        })
        .catch(err => {
          console.error('❌ Internet connectivity test also failed. This suggests a general network issue.');
        });
    });
} catch (error) {
  console.error('❌ Network connectivity test error:', error);
}

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    console.log(`Setting upload destination to: ${uploadDir}`);
    if (!fs.existsSync(uploadDir)) {
      console.log(`Upload directory doesn't exist, creating it now...`);
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`Created upload directory: ${uploadDir}`);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const filename = `${Date.now()}-${file.originalname}`;
    console.log(`Setting filename for upload: ${filename}`);
    cb(null, filename);
  }
});

// Add a pre-handler to log ALL incoming requests
const logAllRequests = (req, res, next) => {
  console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log(`Headers: ${JSON.stringify(req.headers['content-type'])}`);
  console.log(`Query params: ${JSON.stringify(req.query)}`);
  
  // Save original send method to intercept responses
  const originalSend = res.send;
  res.send = function(body) {
    console.log(`📤 Response status: ${res.statusCode}`);
    try {
      if (typeof body === 'string' && body.length < 1000) {
        console.log(`Response body: ${body}`);
      } else {
        console.log(`Response body: [${typeof body}] (too large to log)`);
      }
    } catch (e) {
      console.error('Could not log response body', e);
    }
    
    // Call original send method
    return originalSend.apply(this, arguments);
  };
  
  next();
};

const upload = multer({ 
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB max file size
  },
  fileFilter: (req, file, cb) => {
    console.log('FILE UPLOAD REQUEST RECEIVED:', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size || 'unknown (size not available yet)'
    });
    
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      console.error(`Rejected file: ${file.originalname} - not a CSV file`);
      return cb(new Error('Only CSV files are allowed'));
    }
    
    console.log(`Accepted file: ${file.originalname}`);
    cb(null, true);
  }
});

const router = express.Router();

// Apply request logging middleware
router.use(logAllRequests);

// Helper function to normalize column names
const normalizeColumnName = (name) => {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

// Submit supplier import job endpoint
router.post('/api/upload/supplier', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse match column mapping if provided
    let matchColumnMapping = null;
    if (req.body.matchColumnMapping) {
      try {
        matchColumnMapping = JSON.parse(req.body.matchColumnMapping);
        console.log('Custom match column mapping provided:', matchColumnMapping);
      } catch (e) {
        console.error('Error parsing matchColumnMapping:', e);
      }
    }

    // Create import job in database
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        file_name: req.file.originalname,
        file_size: req.file.size,
        file_path: req.file.path,
        status: 'pending',
        type: 'supplier',
        user_id: req.user?.id || null,
        field_mapping: req.body.fieldMapping ? JSON.parse(req.body.fieldMapping) : null,
        match_options: req.body.matchOptions ? JSON.parse(req.body.matchOptions) : null,
        match_column_mapping: matchColumnMapping,
        batch_size: req.body.batchSize ? parseInt(req.body.batchSize) : 100
      })
      .select()
      .single();

    if (jobError) {
      return res.status(500).json({ error: 'Failed to create import job', details: jobError });
    }

    // Start processing in background
    processImportJob(job.id);

    // Return job ID to client for tracking
    return res.status(200).json({ 
      success: true, 
      message: 'File uploaded and processing started',
      jobId: job.id
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'File upload failed', details: error.message });
  }
});

// Submit product import job endpoint
router.post('/api/upload/product', upload.single('file'), async (req, res) => {
  console.log('\n⭐⭐⭐ PRODUCT UPLOAD ENDPOINT CALLED ⭐⭐⭐');
  console.log('Request received at:', new Date().toISOString());
  
  try {
    console.log('=== PRODUCT UPLOAD RECEIVED ===');
    console.log('Request headers:', req.headers);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Content-Length:', req.headers['content-length']);
    console.log('Request body keys:', Object.keys(req.body));
    
    // Check if this is a multipart request
    if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
      console.error('ERROR: Request is not multipart/form-data - detected:', req.headers['content-type']);
      return res.status(400).json({ error: 'Request must be multipart/form-data' });
    }
    
    if (!req.file) {
      console.error('ERROR: No file in request. req.file is undefined or null');
      console.log('Request body:', req.body);
      console.log('Files in request:', req.files);
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File details:', {
      filename: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      mimetype: req.file.mimetype
    });
    console.log('Form data:', {
      batchSize: req.body.batchSize,
      hasFieldMapping: !!req.body.fieldMapping
    });
    
    // Create import job in database
    console.log('Creating import job in database...');
    try {
      // Test Supabase connection before insert
      const connectionTest = await supabase.from('import_jobs').select('count').limit(1);
      if (connectionTest.error) {
        console.error('Supabase connection error during insert:', connectionTest.error);
        throw new Error(`Supabase connection failed: ${connectionTest.error.message}`);
      }
      
      // Proceed with insert if connection is good
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          file_name: req.file.originalname,
          file_size: req.file.size,
          file_path: req.file.path,
          status: 'pending',
          type: 'product',
          user_id: req.user?.id || null,
          field_mapping: req.body.fieldMapping ? JSON.parse(req.body.fieldMapping) : null,
          batch_size: req.body.batchSize ? parseInt(req.body.batchSize) : 100
        })
        .select()
        .single();

      if (jobError) {
        console.error('ERROR creating import job:', jobError);
        return res.status(500).json({ error: 'Failed to create import job', details: jobError });
      }

      console.log('Job created successfully:', {
        jobId: job.id,
        status: job.status
      });

      // Start processing in background
      console.log('Starting background processing...');
      processProductImportJob(job.id);
      console.log('Background processing initiated');

      // Return job ID to client for tracking
      console.log('Sending success response to client');
      return res.status(200).json({ 
        success: true, 
        message: 'File uploaded and processing started',
        jobId: job.id
      });
    } catch (dbError) {
      console.error('Database operation error:', dbError);
      
      // Save the file path so we can still process it
      const tempFilePath = req.file.path;
      
      // Return more detailed error response
      return res.status(500).json({ 
        error: 'Failed to create import job in database', 
        details: {
          message: dbError.message,
          suggestion: 'Check your Supabase connection and credentials'
        } 
      });
    }
  } catch (error) {
    console.error('Product upload error:', error);
    return res.status(500).json({ error: 'File upload failed', details: error.message });
  }
});

// Get job status endpoint
router.get('/api/upload/status/:jobId', async (req, res) => {
  // Handle client disconnects gracefully
  req.on('close', () => {
    console.log(`Client disconnected during job status check for job: ${req.params.jobId}`);
  });
  
  try {
    console.log(`Checking status for job: ${req.params.jobId}`);
    
    // Set CORS headers explicitly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma, X-Requested-With');
    
    // If this is a preflight request, return immediately
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    // Add short caching to avoid database overload on frequent polling
    res.setHeader('Cache-Control', 'private, max-age=1'); // 1 second cache
    
    // Validate job ID
    if (!req.params.jobId || typeof req.params.jobId !== 'string' || req.params.jobId.length < 5) {
      console.error('Invalid job ID format:', req.params.jobId);
      return res.status(400).json({
        error: 'Invalid job ID format',
        status: 'error'
      });
    }
    
    // Extend timeout for large files
    const timeoutMs = 15000; // 15 seconds
    
    // Create a promise with timeout to avoid hanging requests
    const dbQueryPromise = new Promise(async (resolve, reject) => {
      try {
        console.log(`Querying database for job: ${req.params.jobId}`);
        const { data: job, error } = await supabase
          .from('import_jobs')
          .select('id, status, progress, status_message, results')
          .eq('id', req.params.jobId)
          .single();
        
        if (error) {
          console.error(`ERROR: Job query failed - ${req.params.jobId}`, error);
          reject(new Error(`Database error: ${error.message}`));
          return;
        }
        
        if (!job) {
          console.error(`ERROR: Job not found - ${req.params.jobId}`);
          reject(new Error('Job not found'));
          return;
        }
        
        resolve(job);
      } catch (err) {
        console.error('Database query error:', err);
        reject(err);
      }
    });
    
    // Add timeout to the database query
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Database query timeout'));
      }, timeoutMs);
    });
    
    // Race between the DB query and timeout
    const job = await Promise.race([dbQueryPromise, timeoutPromise])
      .catch(error => {
        if (error.message === 'Database query timeout') {
          console.error(`Query timeout for job ${req.params.jobId}`);
          // Return a partial job object with status "processing" to allow client to continue polling
          return {
            id: req.params.jobId,
            status: 'processing',
            progress: 50, // Default progress
            status_message: 'Job is still processing but status check timed out. Try again later.',
            results: null
          };
        }
        throw error;
      });
    
    if (!job) {
      console.error(`Job data is null or undefined for job ID: ${req.params.jobId}`);
      return res.status(404).json({ 
        error: 'Job not found or data is null',
        status: 'error'
      });
    }
    
    // Handle large results object - truncate if necessary
    let safeResults = job.results;
    if (job.results && typeof job.results === 'object') {
      try {
        const resultsJson = JSON.stringify(job.results);
        if (resultsJson.length > 50000) {
          console.warn(`Large results object (${resultsJson.length} chars) detected for job ${req.params.jobId}, truncating`);
          // Create a safe summary of results
          safeResults = {
            totalRecords: job.results.totalRecords,
            successfulImports: job.results.successfulImports,
            failedImports: job.results.failedImports,
            suppliersAdded: job.results.suppliersAdded,
            matchStats: job.results.matchStats ? {
              totalMatched: job.results.matchStats.totalMatched,
              byMethod: job.results.matchStats.byMethod
            } : null,
            note: "Results truncated due to large size. See server logs for full details."
          };
        }
      } catch (jsonError) {
        console.error('Error stringifying results:', jsonError);
        safeResults = {
          error: 'Could not process results data',
          note: 'Results may be too large or contain circular references'
        };
      }
    }
    
    console.log(`Job status: ${job.status}, Progress: ${job.progress}%`);
    
    // Return appropriate status based on job status
    let statusCode = 200;
    if (job.status === 'failed') {
      statusCode = 500;
    } else if (job.status === 'pending') {
      statusCode = 202; // Accepted but processing not complete
    }
    
    return res.status(statusCode).json({ 
      status: job.status,
      progress: job.progress,
      message: job.status_message,
      results: safeResults
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    // Return a more descriptive error response
    const errorMessage = error.message || 'Failed to get job status';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    
    return res.status(statusCode).json({ 
      error: errorMessage,
      status: 'error',
      jobId: req.params.jobId // Include the job ID in the error for debugging
    });
  }
});

// Health check endpoint
router.get('/api/health', (req, res) => {
  console.log('Health check requested');
  return res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    serverInfo: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      version: process.version
    }
  });
});

// Add a simple test endpoint for file uploads
router.post('/api/upload/test', upload.single('testFile'), async (req, res) => {
  console.log('\n📋 TEST UPLOAD ENDPOINT CALLED 📋');
  try {
    if (!req.file) {
      console.log('No file received in test upload');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    console.log('Test file received:', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });
    
    // Delete the test file to avoid filling up storage
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting test file:', err);
      else console.log('Test file deleted');
    });
    
    return res.status(200).json({ 
      success: true, 
      message: 'Test file upload successful',
      fileDetails: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Test upload error:', error);
    return res.status(500).json({ success: false, error: 'Test file upload failed', details: error.message });
  }
});

// Process the supplier import job asynchronously with improved progress tracking
async function processImportJob(jobId) {
  try {
    console.log(`\n⭐⭐⭐ PROCESSING SUPPLIER IMPORT JOB ${jobId} ⭐⭐⭐`);
    // Update job status to processing
    await supabase
      .from('import_jobs')
      .update({
        status: 'processing',
        status_message: 'Starting file processing',
        progress: 5 // Start at 5% to show immediate feedback
      })
      .eq('id', jobId);

    console.log('Updated job status to processing');

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError) {
      console.error('Error fetching job:', jobError);
      return;
    }

    console.log('Retrieved job details:', {
      id: job.id,
      fileName: job.file_name,
      fileSize: job.file_size,
      filePath: job.file_path,
      status: job.status,
      batchSize: job.batch_size,
      hasFieldMapping: !!job.field_mapping
    });

    // Verify file exists
    if (!fs.existsSync(job.file_path)) {
      console.error(`ERROR: File not found at path: ${job.file_path}`);
      throw new Error(`File not found at path: ${job.file_path}`);
    }
    console.log(`Confirmed file exists at: ${job.file_path}`);
    await updateJobProgress(jobId, 10, 'File found, preparing for processing');

    // Get field mapping from job or auto-map if not provided
    let fieldMapping = job.field_mapping;
    console.log('Field mapping from job:', fieldMapping);
    
    // Prepare for streaming through the CSV file
    const results = {
      totalRecords: 0,
      successfulImports: 0,
      failedImports: 0,
      suppliersAdded: 0
    };
    
    // Read CSV file header first to get column names for auto-mapping
    console.log(`Opening CSV file for header reading: ${job.file_path}`);
    await updateJobProgress(jobId, 15, 'Reading CSV headers');
    
    const headerStream = fs.createReadStream(job.file_path, { encoding: 'utf8' });
    let headers = [];
    
    headerStream
      .pipe(csv({ skipLines: 0, maxRows: 1 }))
      .on('headers', async (csvHeaders) => {
        headers = csvHeaders;
        console.log('CSV headers detected:', headers);
        headerStream.destroy(); // Close the stream once we have headers
        await updateJobProgress(jobId, 20, 'CSV headers detected');
        
        // If no field mapping provided, auto-map based on headers
        if (!fieldMapping) {
          console.log('No field mapping provided, auto-mapping columns...');
          fieldMapping = await autoMapSupplierColumns(headers);
          console.log('Auto-mapped supplier fields:', fieldMapping);
          
          // Update job with auto-mapped field mapping
          await supabase
            .from('import_jobs')
            .update({
              field_mapping: fieldMapping,
              status_message: 'Auto-mapped columns, starting data processing'
            })
            .eq('id', jobId);
          
          console.log('Updated job with auto-mapped field mapping');
          await updateJobProgress(jobId, 25, 'Fields mapped, starting data processing');
        } else {
          await updateJobProgress(jobId, 25, 'Using provided field mapping');
        }
        
        // Estimate total rows for better progress tracking
        const fileBuffer = fs.readFileSync(job.file_path, 'utf8');
        const totalRows = fileBuffer.split('\n').length - 1; // Subtract header row
        console.log(`Estimated ${totalRows} rows in file`);
        
        // Update job with row count
        await supabase
          .from('import_jobs')
          .update({
            total_rows: totalRows
          })
          .eq('id', jobId);
        
        // Now process the file with streaming in chunks
        console.log('Starting to process file in chunks...');
        await updateJobProgress(jobId, 30, 'Processing data in chunks');
        await processFileInChunks(job, fieldMapping, results);
      })
      .on('error', async (error) => {
        console.error('Error reading CSV headers:', error);
        await updateJobStatus(jobId, 'failed', `Error reading CSV headers: ${error.message}`);
        throw error;
      });
  } catch (error) {
    console.error('Error in processImportJob:', error);
    
    // Update job status to failed
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        status_message: `Processing failed: ${error.message}`,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

// Process the product import job asynchronously
async function processProductImportJob(jobId) {
  try {
    console.log(`Starting product import processing for job: ${jobId}`);
    // Update job status to processing
    await supabase
      .from('import_jobs')
      .update({
        status: 'processing',
        status_message: 'Starting product file processing',
        progress: 0
      })
      .eq('id', jobId);

    console.log('Job status updated to processing');

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError) {
      console.error('Error fetching job:', jobError);
      return;
    }

    console.log('Job details retrieved:', {
      fileSize: job.file_size,
      batchSize: job.batch_size,
      hasFieldMapping: !!job.field_mapping
    });

    // Get field mapping from job or auto-map if not provided
    let fieldMapping = job.field_mapping;
    
    // Prepare for streaming through the CSV file
    const results = {
      totalRecords: 0,
      successfulImports: 0,
      failedImports: 0
    };
    
    // Verify file exists
    if (!fs.existsSync(job.file_path)) {
      throw new Error(`File not found at path: ${job.file_path}`);
    }
    
    console.log(`Reading CSV file: ${job.file_path}`);
    
    // Read CSV file header first to get column names for auto-mapping
    const headerStream = fs.createReadStream(job.file_path, { encoding: 'utf8' });
    let headers = [];
    
    headerStream
      .pipe(csv({ skipLines: 0, maxRows: 1 }))
      .on('headers', async (csvHeaders) => {
        headers = csvHeaders;
        console.log('CSV headers detected:', headers);
        headerStream.destroy(); // Close the stream once we have headers
        
        // If no field mapping provided, auto-map based on headers
        if (!fieldMapping) {
          console.log('No field mapping provided, auto-mapping columns...');
          fieldMapping = await autoMapProductColumns(headers);
          console.log('Auto-mapped fields:', fieldMapping);
          
          // Update job with auto-mapped field mapping
          await supabase
            .from('import_jobs')
            .update({
              field_mapping: fieldMapping,
              status_message: 'Auto-mapped product columns, starting data processing'
            })
            .eq('id', jobId);
        } else {
          console.log('Using provided field mapping:', fieldMapping);
        }
        
        // Now process the file with streaming in chunks
        console.log('Beginning file processing in chunks...');
        processProductFileInChunks(job, fieldMapping, results);
      })
      .on('error', (error) => {
        console.error('Error reading CSV headers:', error);
        throw error;
      });
  } catch (error) {
    console.error('Error in processProductImportJob:', error);
    
    // Update job status to failed
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        status_message: `Processing failed: ${error.message}`,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

// Process the supplier file in manageable chunks using streaming with better progress reporting
async function processFileInChunks(job, fieldMapping, results) {
  // Use much smaller batch size for large files
  const fileSizeMB = job.file_size / (1024 * 1024);
  const batchSize = fileSizeMB > 50 ? 50 : (job.batch_size || config.defaultBatchSize || 200);
  
  // Dynamically calculate chunk size based on file size - smaller chunks for larger files
  const chunkSize = Math.min(
    500, 
    Math.max(100, Math.floor(10000000 / Math.max(job.file_size, 1000000)))
  );
  
  const totalRows = job.total_rows || 1000;
  
  console.log(`Processing file in chunks. Batch size: ${batchSize}, Chunk size: ${chunkSize}, Estimated total rows: ${totalRows}`);
  console.log(`File path: ${job.file_path}`);
  console.log(`File size: ${job.file_size} bytes (${fileSizeMB.toFixed(2)}MB), Adjusted chunk size: ${chunkSize} rows`);
  
  let currentChunk = [];
  let totalProcessed = 0;
  let lastUpdateTime = Date.now();
  let lastProgressUpdate = 0;
  let lastMemoryCheck = Date.now();
  let gcInterval = null;
  let throttleDelay = 0; // Dynamic throttling delay
  let consecutiveErrors = 0;
  
  // Track memory usage and adjust processing accordingly
  const memoryMonitor = setInterval(() => {
        const memUsage = process.memoryUsage();
        const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    console.log(`Memory usage: ${memUsageMB}MB / ${heapTotalMB}MB (${Math.round(memUsage.heapUsed / memUsage.heapTotal * 100)}%)`);
    
    // More aggressive memory management
    const memThreshold = config.highMemoryThreshold || 1024;
    if (memUsageMB > memThreshold * 0.7) {
      throttleDelay = Math.min(5000, throttleDelay + 1000);
          console.log(`High memory usage detected (${memUsageMB}MB), setting throttle delay to ${throttleDelay}ms`);
        
      // Force garbage collection more aggressively
      if (global.gc) {
        console.log('Forcing garbage collection due to high memory usage');
        global.gc();
      }
    } else if (throttleDelay > 0 && memUsageMB < memThreshold * 0.5) {
      throttleDelay = Math.max(0, throttleDelay - 500);
      console.log(`Memory usage acceptable (${memUsageMB}MB), reducing throttle delay to ${throttleDelay}ms`);
  }
  }, 1000); // Check every second
  
  const failedRows = [];
  
  return new Promise((resolve, reject) => {
  try {
      // Create file stream with smaller buffer
    const fileStream = fs.createReadStream(job.file_path, { 
      encoding: 'utf8',
        highWaterMark: 16 * 1024 // 16KB buffer size to reduce memory usage
      });
      
      // Report initial progress
      updateJobProgress(job.id, 32, `Started processing data`);
      
      // Use a transform stream to process data in controlled manner
      const processor = new (require('stream').Transform)({
        objectMode: true,
        highWaterMark: 1, // Process one object at a time for better memory control
        transform: async function(row, encoding, callback) {
          try {
            // Add row to current chunk
      currentChunk.push(row);
      
            // Process chunk when it reaches desired size
      if (currentChunk.length >= chunkSize) {
              // Pause the stream to prevent more data from flowing in
              processor.pause();
        
        // Apply throttling if necessary
        if (throttleDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, throttleDelay));
        }
              
              try {
                const chunkToProcess = [...currentChunk]; // Create a copy
                currentChunk = []; // Clear original immediately to help GC
                
                // Determine if we should use worker-based processing
                const useWorkers = config.isLargeImportMode && 
                                  config.isHighMemoryEnvironment() && 
                                  chunkToProcess.length > 500 &&
                                  fileSizeMB > 10;

                if (useWorkers) {
                  console.log(`Using worker-based parallel processing for ${chunkToProcess.length} rows`);
                  await processChunkWithWorkers(chunkToProcess, job, fieldMapping, results);
                } else {
                  console.log(`Using standard sequential processing for ${chunkToProcess.length} rows`);
                  await processChunk(chunkToProcess, job, fieldMapping, results);
                }
                
                totalProcessed += chunkToProcess.length;
          consecutiveErrors = 0;
          
                // Help garbage collection
                chunkToProcess.length = 0;
          
                // Calculate progress
                const dataProcessingRange = 55;
          const completionPercentage = Math.min(totalProcessed / totalRows, 1);
          const progress = Math.min(90, Math.floor(35 + (dataProcessingRange * completionPercentage)));
          
                // Update progress less frequently
          const now = Date.now();
                if (progress - lastProgressUpdate >= 5 || now - lastUpdateTime > 5000) {
            await updateJobProgress(job.id, progress, `Processing data... ${progress}%`);
            lastUpdateTime = now;
            lastProgressUpdate = progress;
          }
                
                // Force garbage collection periodically
                if (global.gc && (now - lastMemoryCheck > 10000)) {
                  global.gc();
                  lastMemoryCheck = now;
                }
        } catch (error) {
          console.error('Error processing chunk:', error);
          consecutiveErrors++;
          
                // Record failure but continue processing
          failedRows.push({
                  firstRow: totalProcessed + 1,
                  lastRow: totalProcessed + chunkSize,
                  count: chunkSize,
            error: error.message || 'Unknown error'
          });
          
                totalProcessed += chunkSize;
                
                if (consecutiveErrors > 3) {
                  // More aggressive throttling with consecutive errors
                  throttleDelay = Math.min(10000, throttleDelay + 2000);
                  console.log(`Multiple errors detected, increasing throttle to ${throttleDelay}ms`);
                }
              }
              
              // Resume processing
              processor.resume();
            }
            
            callback();
          } catch (err) {
            callback(err);
          }
        },
        flush: async function(callback) {
          try {
            // Process remaining rows
      if (currentChunk.length > 0) {
        console.log(`Processing final chunk of ${currentChunk.length} rows...`);
          await processChunk(currentChunk, job, fieldMapping, results);
          totalProcessed += currentChunk.length;
              currentChunk = [];
            }
            
            callback();
          } catch (err) {
            callback(err);
          }
        }
      });
      
      // Set up the pipeline with proper error handling
      fileStream
        .pipe(csv({
          skipLines: 0,
          maxRows: config.maxRows || (totalRows + 1),
          strict: false
        }))
        .pipe(processor)
        .on('error', (error) => {
          console.error('Error in processing pipeline:', error);
          clearInterval(memoryMonitor);
          reject(error);
        })
        .on('finish', async () => {
      console.log(`File processing complete. Total rows processed: ${totalProcessed}`);
          clearInterval(memoryMonitor);
      
      // Add failed rows information to results
      results.failedGroups = failedRows;
      results.totalFailedGroups = failedRows.length;
      
          // Clean up any lingering resources
          if (global.gc) {
            global.gc();
          }
      
          // Update job progress
      await updateJobProgress(job.id, 95, 'Finalizing import');
      
      // Update job as completed
      await supabase
        .from('import_jobs')
        .update({
          status: 'completed',
          status_message: failedRows.length > 0 
            ? `Import completed with ${failedRows.length} error groups. See logs for details.` 
            : 'Import completed successfully',
          progress: 100,
          results: {
            totalRecords: results.totalRecords,
            successfulImports: results.successfulImports,
            failedImports: results.failedImports,
            suppliersAdded: results.suppliersAdded,
            matchStats: {
              totalMatched: results.matchStats?.totalMatched || 0,
              byMethod: {
                ean: results.matchStats?.byMethod?.ean || 0,
                mpn: results.matchStats?.byMethod?.mpn || 0,
                name: results.matchStats?.byMethod?.name || 0
              }
            }
          },
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
        
      // Clean up temporary file
      fs.unlink(job.file_path, (err) => {
        if (err) console.error('Error deleting temporary file:', err);
        else console.log('Temporary file deleted');
      });
          
          resolve();
        });
        
      // Handle stream errors
      fileStream.on('error', (error) => {
        console.error('Error with file stream:', error);
        clearInterval(memoryMonitor);
        reject(error);
      });
    } catch (error) {
      console.error('Error in processFileInChunks:', error);
      clearInterval(memoryMonitor);
      reject(error);
    }
  });
}

// Process the product file in manageable chunks using streaming with better progress reporting
async function processProductFileInChunks(job, fieldMapping, results) {
  const batchSize = job.batch_size || 100;
  const chunkSize = 5000; // Process 5000 rows at a time in memory
  const totalRows = job.total_rows || 1000; // Use estimated total rows or default
  
  console.log(`Processing product file in chunks. Batch size: ${batchSize}, Chunk size: ${chunkSize}, Estimated total rows: ${totalRows}`);
  console.log(`File path: ${job.file_path}`);
  
  let currentChunk = [];
  let totalProcessed = 0;
  let lastUpdateTime = Date.now();
  
  try {
    console.log('Creating read stream for product file...');
    const fileStream = fs.createReadStream(job.file_path, { encoding: 'utf8' });
    
    // Initial progress update to show process has started
    await updateJobProgress(job.id, 32, `Started processing data`);
    
    fileStream
      .pipe(csv())
      .on('data', async (row) => {
        currentChunk.push(row);
        
        // When chunk reaches size, pause stream and process
        if (currentChunk.length >= chunkSize) {
          fileStream.pause();
          console.log(`Processing product chunk of ${currentChunk.length} rows...`);
          
          try {
            await processProductChunk(currentChunk, job, fieldMapping, results);
            totalProcessed += currentChunk.length;
            currentChunk = [];
            
            // Calculate progress as a percentage between 35% (start) and 90% (end of data processing)
            // This leaves room for remaining 10% for finalizing
            const dataProcessingRange = 55; // From 35% to 90%
            const completionPercentage = Math.min(totalProcessed / totalRows, 1);
            const progress = Math.min(90, Math.floor(35 + (dataProcessingRange * completionPercentage)));
            
            // Update progress every 2 seconds or after processing large chunks
            const now = Date.now();
            if (now - lastUpdateTime > 2000) {
              console.log(`Progress update: ${progress}% - Processed ${totalProcessed}/${totalRows} rows`);
              await updateJobProgress(job.id, progress, `Processing data... ${progress}%`);
              lastUpdateTime = now;
            }
  } catch (error) {
            console.error('Error processing product chunk:', error);
          }
          
          fileStream.resume();
        }
      })
      .on('end', async () => {
        // Process any remaining rows
        if (currentChunk.length > 0) {
          console.log(`Processing final product chunk of ${currentChunk.length} rows...`);
          await processProductChunk(currentChunk, job, fieldMapping, results);
          totalProcessed += currentChunk.length;
        }
        
        console.log(`Product file processing complete. Total rows processed: ${totalProcessed}`);
        console.log('Results:', results);
        
        // Update progress to 95% - finalizing import
        await updateJobProgress(job.id, 95, 'Finalizing import');
        
        // Update job as completed
        await supabase
          .from('import_jobs')
          .update({
            status: 'completed',
            status_message: 'Import completed successfully',
            progress: 100,
            results: results,
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
        
        console.log('Product import job marked as completed');
          
        // Clean up temporary file
        fs.unlink(job.file_path, (err) => {
          if (err) console.error('Error deleting temporary file:', err);
          else console.log('Temporary file deleted');
        });
      })
      .on('error', async (error) => {
        console.error('Error reading product CSV file:', error);
        await updateJobStatus(job.id, 'failed', `Error reading CSV file: ${error.message}`);
      });
  } catch (error) {
    console.error('Error in processProductFileInChunks:', error);
    await updateJobStatus(job.id, 'failed', `Error processing product file: ${error.message}`);
  }
}

// Process a chunk of supplier CSV data
async function processChunk(chunk, job, fieldMapping, results) {
  try {
    console.log(`Processing chunk with ${chunk.length} rows...`);
    
    // Only process necessary fields, discard the rest
    const slimChunk = chunk.map(row => {
      const slimRow = {};
      // Only keep fields we need based on fieldMapping
      Object.values(fieldMapping).forEach(columnName => {
        if (columnName && row[columnName] !== undefined) {
          slimRow[columnName] = row[columnName];
        }
      });
      return slimRow;
    });
    
    // Map the data according to field mapping - using the slimmed down data
    console.log('Mapping CSV data with field mapping...');
    const mappedData = await mapSupplierData(slimChunk, fieldMapping);
    
    // Process in smaller batches for database operations
    const batchSize = Math.min(job.batch_size || 50, 50); // Cap batch size at 50 for better efficiency
    
    // Clear chunk references to help garbage collection
    chunk.length = 0;
    slimChunk.length = 0;
    
    // Check if we actually have data to process
    if (!mappedData.data || mappedData.data.length === 0) {
      console.log('No valid data to process after mapping');
      return results;
    }
    
    console.log(`Processing ${mappedData.data.length} mapped records`);
    
    // Process the supplier data with the chosen match options
    const matchOptions = job.match_options || {
      useEan: true,
      useMpn: true,
      useName: false,
      priority: ['ean', 'mpn', 'name']
    };
    
    // Split data into smaller sub-batches for processing
    const dataLength = mappedData.data.length;
    const subBatchSize = Math.min(batchSize, 50); // Use even smaller batches for large imports
    const batches = [];
    
    for (let i = 0; i < dataLength; i += subBatchSize) {
      batches.push(mappedData.data.slice(i, i + subBatchSize));
    }
    
    console.log(`Split data into ${batches.length} sub-batches of max ${subBatchSize} records`);
    
    // Process each batch sequentially with delays between to prevent memory spikes
    let processedCount = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing sub-batch ${i+1}/${batches.length} with ${batch.length} records`);
      
      try {
        const batchResults = await importSupplierData(
          batch,
          matchOptions,
      null, // No progress callback needed here
          subBatchSize,
          job.match_column_mapping,
          job.id
        );
        
        // Update batch results
        results.totalRecords = (results.totalRecords || 0) + batch.length;
        results.successfulImports = (results.successfulImports || 0) + (batchResults.processedCount || 0);
        results.failedImports = (results.failedImports || 0) + (batch.length - (batchResults.processedCount || 0));
        results.suppliersAdded = (results.suppliersAdded || 0) + (batchResults.supplierCount || 0);
    
    // Make sure we capture match statistics
    if (!results.matchStats) {
      results.matchStats = {
        totalMatched: 0,
        byMethod: {
          ean: 0,
          mpn: 0,
          name: 0
        }
      };
    }
    
        // Update match statistics from the batch results
        if (batchResults.matchStats) {
          results.matchStats.totalMatched = (results.matchStats.totalMatched || 0) + 
            (batchResults.matchStats.totalMatched || 0);
          
          if (batchResults.matchStats.byMethod) {
            results.matchStats.byMethod.ean = (results.matchStats.byMethod.ean || 0) + 
              (batchResults.matchStats.byMethod.ean || 0);
            results.matchStats.byMethod.mpn = (results.matchStats.byMethod.mpn || 0) + 
              (batchResults.matchStats.byMethod.mpn || 0);
            results.matchStats.byMethod.name = (results.matchStats.byMethod.name || 0) + 
              (batchResults.matchStats.byMethod.name || 0);
          }
        }
        
        processedCount += batch.length;
        
        // Clear batch data
        batch.length = 0;
        
        // Add a small delay between batches to allow GC to run
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
    
    // Force garbage collection if available
    if (global.gc) {
            global.gc();
          }
        }
      } catch (error) {
        console.error(`Error processing sub-batch ${i+1}:`, error);
        // Continue with next batch instead of failing the entire process
      }
    }
    
    // Clear any remaining references
    mappedData.data = null;
    batches.length = 0;
    
    console.log(`Processed ${processedCount} records across ${batches.length} sub-batches`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    return results;
  } catch (error) {
    console.error('Error processing chunk:', error);
    
    // Ensure references are cleared even on error
    chunk.length = 0;
    
    throw error;
  }
}

// Map supplier data function (simplified version that works with chunks)
async function mapSupplierData(csvData, fieldMapping) {
  try {
    console.log(`Mapping ${csvData.length} supplier rows with field mapping:`, fieldMapping);
    
    // Get all custom attributes to map them
    console.log('Fetching supplier custom attributes...');
    const { data: customAttributes, error } = await supabase
      .from('custom_attributes')
      .select('*')
      .eq('for_type', 'supplier');
      
    if (error) {
      console.error('Error fetching custom attributes:', error);
      throw error;
    }
    
    console.log(`Found ${customAttributes?.length || 0} custom attributes`);
    
    const mappedData = [];
    let hasCurrencyWarning = false;
    
    // Process cost value helper function
    const processCostValue = (value) => {
      if (!value) return { cost: 0, currencyWarning: false };
      
      // Check for currency symbols
      const hasCurrencySymbol = /[$€£¥]/.test(value);
      const hasNonUsdCurrency = /[€£¥]/.test(value);
      
      // Remove all non-numeric characters except decimal point
      const numericValue = value.replace(/[^0-9.]/g, '');
      const cost = parseFloat(numericValue) || 0;
      
      return { 
        cost, 
        currencyWarning: hasNonUsdCurrency 
      };
    };
    
    console.log('Processing CSV rows...');
    for (const row of csvData) {
      try {
        // Process cost with currency check
        const costResult = processCostValue(row[fieldMapping['Cost']]);
        if (costResult.currencyWarning) {
          hasCurrencyWarning = true;
        }
        
        const supplierData = {
          supplier_name: row[fieldMapping['Supplier Name']]?.trim() || '',
          ean: fixScientificNotation(row[fieldMapping['EAN']]),
          mpn: row[fieldMapping['MPN']]?.trim() || '',
          product_name: row[fieldMapping['Product Name']]?.trim() || '',
          cost: costResult.cost,
          moq: parseInt(row[fieldMapping['MOQ']]) || 1,
          lead_time: row[fieldMapping['Lead Time']]?.trim() || '3 days',
          payment_terms: row[fieldMapping['Payment Terms']]?.trim() || 'Net 30',
          custom_attributes: {}
        };
        
        // Map any custom attributes found in the CSV
        if (customAttributes) {
          customAttributes.forEach(attr => {
            if (fieldMapping[attr.name] && row[fieldMapping[attr.name]]) {
              if (!supplierData.custom_attributes) {
                supplierData.custom_attributes = {};
              }
              
              let value = row[fieldMapping[attr.name]];
              
              // Convert value based on attribute type
              switch (attr.type) {
                case 'Number':
                  value = parseFloat(value) || 0;
                  break;
                case 'Date':
                  // Attempt to parse as date, keep as string
                  break;
                case 'Yes/No':
                  value = value.toLowerCase() === 'yes' || 
                         value.toLowerCase() === 'true' || 
                         value === '1';
                  break;
                default:
                  // Keep as string for text and selection
                  value = value.trim();
              }
              
              supplierData.custom_attributes[attr.name] = value;
            } else if (attr.required) {
              // For required attributes, use default value if available
              if (!supplierData.custom_attributes) {
                supplierData.custom_attributes = {};
              }
              supplierData.custom_attributes[attr.name] = attr.default_value;
            }
          });
        }
        
        // Validate supplier data
        if (!supplierData.supplier_name) {
          console.warn('Skipping supplier data: Supplier name is required');
          continue;
        }
        
        mappedData.push(supplierData);
      } catch (error) {
        console.warn(`Skipping invalid supplier data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log(`Mapping complete. ${mappedData.length} valid suppliers of ${csvData.length} total`);
    if (mappedData.length > 0) {
      console.log('First mapped record example:', JSON.stringify(mappedData[0]));
    }
    
    return {
      data: mappedData,
      warnings: {
        currencyWarning: hasCurrencyWarning,
        message: hasCurrencyWarning ? 'Non-USD currency symbols detected. Please convert all prices to USD before uploading.' : ''
      }
    };
  } catch (error) {
    console.error('Error mapping supplier data:', error);
    throw error;
  }
}

// Auto-map supplier columns function
async function autoMapSupplierColumns(csvHeaders) {
  const fieldMappings = {
    'Supplier Name': ['supplier_name', 'supplier', 'vendor_name', 'vendor', 'company_name', 'company'],
    'EAN': ['ean', 'barcode', 'upc', 'product_id', 'sku', 'asin', 'gtin'],
    'MPN': ['mpn', 'manufacturer_part_number', 'part_number', 'part_no', 'manufacturer_number'],
    'Product Name': ['product_name', 'title', 'item_name', 'product_title', 'product', 'item'],
    'Cost': ['cost', 'unit_cost', 'price', 'supplier_cost', 'wholesale_price'],
    'MOQ': ['moq', 'minimum_order_quantity', 'min_order', 'minimum_qty'],
    'Lead Time': ['lead_time', 'leadtime', 'delivery_time', 'processing_time'],
    'Payment Terms': ['payment_terms', 'terms', 'payment', 'payment_conditions']
  };

  // Get custom attributes from database
  const { data: customAttributes, error } = await supabase
    .from('custom_attributes')
    .select('*')
    .eq('for_type', 'supplier');
  
  if (!error && customAttributes) {
    // Add custom attributes to field mappings
    customAttributes.forEach(attr => {
      const normalizedName = normalizeColumnName(attr.name);
      fieldMappings[attr.name] = [normalizedName, ...normalizedName.split('_')];
    });
  }

  const mapping = {};
  const usedColumns = new Set();

  // First pass: exact matches
  csvHeaders.forEach(header => {
    const normalizedHeader = normalizeColumnName(header);
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (possibleMatches.includes(normalizedHeader) && !usedColumns.has(header)) {
        mapping[systemField] = header;
        usedColumns.add(header);
        break;
      }
    }
  });

  // Second pass: partial matches
  csvHeaders.forEach(header => {
    if (usedColumns.has(header)) return;

    const normalizedHeader = normalizeColumnName(header);
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (!mapping[systemField]) {
        const matchFound = possibleMatches.some(match => 
          normalizedHeader.includes(match) || match.includes(normalizedHeader)
        );
        
        if (matchFound) {
          mapping[systemField] = header;
          usedColumns.add(header);
          break;
        }
      }
    }
  });

  return mapping;
}

// Auto-map product columns function
async function autoMapProductColumns(csvHeaders) {
  const fieldMappings = {
    'Title': ['title', 'product_name', 'name', 'product_title'],
    'EAN': ['ean', 'barcode', 'upc', 'product_id', 'sku'],
    'Brand': ['brand', 'manufacturer', 'vendor'],
    'Sale Price': ['sale_price', 'price', 'selling_price', 'retail_price'],
    'Units Sold': ['units_sold', 'quantity_sold', 'sales_quantity', 'sold'],
    'Amazon Fee': ['amazon_fee', 'fee', 'fba_fee', 'marketplace_fee'],
    'Buy Box Price': ['buy_box_price', 'buybox_price', 'competitive_price', 'market_price'],
    'Category': ['category', 'product_category', 'department', 'product_type'],
    'Rating': ['rating', 'product_rating', 'avg_rating', 'average_rating'],
    'Review Count': ['review_count', 'reviews', 'number_of_reviews', 'total_reviews']
  };

  // Get custom attributes from database
  const { data: customAttributes, error } = await supabase
    .from('custom_attributes')
    .select('*')
    .eq('for_type', 'product');
  
  if (!error && customAttributes) {
    // Add custom attributes to field mappings
    customAttributes.forEach(attr => {
      const normalizedName = normalizeColumnName(attr.name);
      fieldMappings[attr.name] = [normalizedName, ...normalizedName.split('_')];
    });
  }

  const mapping = {};
  const usedColumns = new Set();

  // First pass: exact matches
  csvHeaders.forEach(header => {
    const normalizedHeader = normalizeColumnName(header);
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (possibleMatches.includes(normalizedHeader) && !usedColumns.has(header)) {
        mapping[systemField] = header;
        usedColumns.add(header);
        break;
      }
    }
  });

  // Second pass: partial matches
  csvHeaders.forEach(header => {
    if (usedColumns.has(header)) return;

    const normalizedHeader = normalizeColumnName(header);
    for (const [systemField, possibleMatches] of Object.entries(fieldMappings)) {
      if (!mapping[systemField]) {
        const matchFound = possibleMatches.some(match => 
          normalizedHeader.includes(match) || match.includes(normalizedHeader)
        );
        
        if (matchFound) {
          mapping[systemField] = header;
          usedColumns.add(header);
          break;
        }
      }
    }
  });

  console.log('Auto-mapped columns:', mapping);
  return mapping;
}

// Map product data function
async function mapProductData(csvData, fieldMapping, requiredFields = ['Title', 'Brand', 'Sale Price']) {
  try {
    console.log(`Mapping ${csvData.length} product rows with field mapping:`, fieldMapping);
    console.log('Using required fields:', requiredFields);
    
    // Get all custom attributes to map them
    const { data: customAttributes, error } = await supabase
      .from('custom_attributes')
      .select('*')
      .eq('for_type', 'product');
      
    if (error) {
      console.error('Error fetching custom attributes:', error);
      throw error;
    }
    
    const mappedData = [];
    
    for (const row of csvData) {
      try {
        const productData = {
          title: row[fieldMapping['Title']]?.trim() || '',
          ean: fixScientificNotation(row[fieldMapping['EAN']]),
          brand: row[fieldMapping['Brand']]?.trim() || '',
          sale_price: parseFloat(row[fieldMapping['Sale Price']]) || 0,
          amazon_fee: parseFloat(row[fieldMapping['Amazon Fee']]) || 0,
          buy_box_price: parseFloat(row[fieldMapping['Buy Box Price']]) || 0,
          units_sold: parseInt(row[fieldMapping['Units Sold']]) || 0,
          category: row[fieldMapping['Category']]?.trim() || null,
          rating: row[fieldMapping['Rating']] ? parseFloat(row[fieldMapping['Rating']]) : null,
          review_count: row[fieldMapping['Review Count']] ? parseInt(row[fieldMapping['Review Count']]) : null,
          custom_attributes: {}
        };
        
        // Map any custom attributes found in the CSV
        if (customAttributes) {
          customAttributes.forEach(attr => {
            if (fieldMapping[attr.name] && row[fieldMapping[attr.name]]) {
              if (!productData.custom_attributes) {
                productData.custom_attributes = {};
              }
              
              let value = row[fieldMapping[attr.name]];
              
              // Convert value based on attribute type
              switch (attr.type) {
                case 'Number':
                  value = parseFloat(value) || 0;
                  break;
                case 'Date':
                  // Attempt to parse as date, keep as string
                  break;
                case 'Yes/No':
                  value = value.toLowerCase() === 'yes' || 
                         value.toLowerCase() === 'true' || 
                         value === '1';
                  break;
                default:
                  // Keep as string for text and selection
                  value = value.trim();
              }
              
              productData.custom_attributes[attr.name] = value;
            } else if (attr.required) {
              // For required attributes, use default value if available
              if (!productData.custom_attributes) {
                productData.custom_attributes = {};
              }
              productData.custom_attributes[attr.name] = attr.default_value;
            }
          });
        }
        
        // Validate product data using required fields from config
        let skipProduct = false;
        
        // Check each required field
        for (const requiredField of requiredFields) {
          // Map system field names to data properties
          let fieldProperty;
          switch (requiredField) {
            case 'Title':
              fieldProperty = 'title';
              break;
            case 'Brand':
              fieldProperty = 'brand';
              break;
            case 'Sale Price':
              fieldProperty = 'sale_price';
              break;
            case 'EAN':
              fieldProperty = 'ean';
              break;
            default:
              // For custom fields, check in custom attributes
              fieldProperty = requiredField.toLowerCase().replace(/\s+/g, '_');
          }
          
          // Check if the field has a value
          if (!productData[fieldProperty] && 
              (productData[fieldProperty] !== 0 || fieldProperty !== 'sale_price')) {
            console.warn(`Skipping product data: ${requiredField} is required`);
            skipProduct = true;
            break;
          }
        }
        
        if (skipProduct) {
          continue;
        }
        
        // If EAN is not provided, generate a placeholder
        if (!productData.ean || productData.ean.trim() === '') {
          // Generate a placeholder EAN based on brand and title
          const brandPart = productData.brand ? productData.brand.substring(0, 5).replace(/\W/g, '') : 'brand';
          const titlePart = productData.title ? productData.title.substring(0, 10).replace(/\W/g, '') : 'title';
          const timestamp = Date.now().toString().substring(6);
          productData.ean = `GEN${brandPart}${titlePart}${timestamp}`.substring(0, 30);
          console.log(`Generated placeholder EAN for product: ${productData.title} -> ${productData.ean}`);
        }
        
        mappedData.push(productData);
      } catch (error) {
        console.warn(`Skipping invalid product data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log(`Mapping complete. ${mappedData.length} valid products of ${csvData.length} total`);
    return mappedData;
  } catch (error) {
    console.error('Error mapping product data:', error);
    throw error;
  }
}

// Import supplier data function with optimized database operations
async function importSupplierData(mappedData, matchOptions, progressCallback, batchSize, matchColumns, jobId) {
  try {
    console.log(`Starting import of ${mappedData.length} supplier records with batch size ${batchSize}`);
    
    if (!mappedData || mappedData.length === 0) {
      console.warn('No supplier data to import');
      return { 
        processedCount: 0, 
        supplierCount: 0,
        matchStats: { totalMatched: 0, byMethod: { ean: 0, mpn: 0, name: 0 } }
      };
    }

    // Group data by supplier to reduce database operations
    const supplierGroups = {};
    for (const row of mappedData) {
      const { supplier_name, custom_attributes, ...productData } = row;
      
      // Skip rows with empty supplier name
      if (!supplier_name || supplier_name.trim() === '') {
        continue;
      }
      
      if (!supplierGroups[supplier_name]) {
        supplierGroups[supplier_name] = {
          name: supplier_name,
          custom_attributes: custom_attributes || {},
          products: []
        };
      }
      supplierGroups[supplier_name].products.push(productData);
    }
    
    console.log(`Grouped into ${Object.keys(supplierGroups).length} unique suppliers`);

    // Prepare for tracking results
    const results = [];
    let processedCount = 0;
    const supplierNames = Object.keys(supplierGroups);
    
    // Prepare supplier records for upsert
    const supplierUpsertData = supplierNames.map(name => {
      const supplierData = supplierGroups[name];
      const customAttrs = supplierData.custom_attributes || {};
      
      return { 
        name,
        is_matched: false,
        custom_ean: customAttrs['EAN'] || null,
        custom_mpn: customAttrs['MPN'] || null,
        custom_brand: customAttrs['Brand'] || null
      };
    });
    
    if (supplierUpsertData.length === 0) {
      console.warn('No suppliers to upsert');
      return { 
        processedCount: 0, 
        supplierCount: 0,
        matchStats: { totalMatched: 0, byMethod: { ean: 0, mpn: 0, name: 0 } }
      };
    }
    
    // Upsert suppliers more efficiently - in smaller batches if needed
    let supplierIdsByName = {};
    const supplierBatchSize = 50;
    
    for (let i = 0; i < supplierUpsertData.length; i += supplierBatchSize) {
      const batch = supplierUpsertData.slice(i, i + supplierBatchSize);
      try {
        const { data: upsertedSuppliers, error: suppliersError } = await supabase
          .from('suppliers')
          .upsert(batch, { 
            onConflict: 'name',
            ignoreDuplicates: false 
          })
          .select('id,name');
          
        if (suppliersError) {
          console.error('Error upserting suppliers batch:', suppliersError);
          if (jobId) {
            await logImportError(
              jobId,
              'SUPPLIER_UPSERT',
              `Error upserting suppliers batch: ${suppliersError.message}`,
              { error: suppliersError },
              null,
              null
            );
          }
          // Continue with next batch instead of failing everything
        } else if (upsertedSuppliers) {
          // Add to our supplier ID lookup
          upsertedSuppliers.forEach(s => {
            supplierIdsByName[s.name] = s.id;
          });
        }
      } catch (error) {
        console.error('Exception upserting suppliers batch:', error);
        // Continue with next batch
      }
    }
    
    // If no supplier IDs were found, exit early
    if (Object.keys(supplierIdsByName).length === 0) {
      console.error('Failed to upsert any suppliers');
      return { 
        processedCount: 0, 
        supplierCount: 0,
        matchStats: { totalMatched: 0, byMethod: { ean: 0, mpn: 0, name: 0 } }
      };
    }
    
    // Get suppliers we successfully upserted
    const validSupplierNames = Object.keys(supplierIdsByName);
    console.log(`Retrieved ${validSupplierNames.length} valid supplier IDs`);
    
    // Prepare for product matching - collect only needed identifiers
      const eans = new Set();
      const mpns = new Set();
      const productNames = new Set();
      
    // For tracking match methods
    const matchMethodStats = {
      ean: 0,
      mpn: 0,
      name: 0,
      none: 0
    };
    
    // Only collect identifiers for valid suppliers
    for (const supplierName of validSupplierNames) {
      const supplierData = supplierGroups[supplierName];
      if (!supplierData || !supplierData.products) continue;
      
      for (const p of supplierData.products) {
          // Use custom match columns if provided, otherwise use standard fields
          const eanValue = matchColumns?.ean ? p[matchColumns.ean] : p.ean;
          const mpnValue = matchColumns?.mpn ? p[matchColumns.mpn] : p.mpn;
          const nameValue = matchColumns?.name ? p[matchColumns.name] : p.product_name;
          
          if (matchOptions.useEan && eanValue) {
            eans.add(eanValue);
          }
          if (matchOptions.useMpn && mpnValue) {
            mpns.add(mpnValue);
          }
          if (matchOptions.useName && nameValue) {
            productNames.add(nameValue);
        }
      }
    }
    
    // Fetch products in smaller, optimized batches
    let allProducts = [];
    const maxIdsPerQuery = 100; // Smaller batches for better memory usage
    
    // Helper to fetch products with a specific field filter
    const fetchProductsWithFilter = async (fieldName, values, operator = 'in') => {
      if (values.size === 0) return [];
      
      const valueArray = Array.from(values);
      const products = [];
      
      // Process in smaller batches
      for (let i = 0; i < valueArray.length; i += maxIdsPerQuery) {
        const batchValues = valueArray.slice(i, i + maxIdsPerQuery);
        
        try {
          let query = supabase
            .from('products')
            .select('id, ean, mpn, title, custom_mpn');
            
          if (operator === 'in') {
            query = query.in(fieldName, batchValues);
          } else if (operator === 'ilike-any') {
            const ilikeFilters = batchValues.map(v => `%${v}%`);
            query = query.or(`${fieldName}.ilike.any.(${ilikeFilters.join(',')})`);
          }
          
          const { data, error } = await query;
          
          if (error) {
            console.error(`Error fetching products by ${fieldName}:`, error);
          } else if (data) {
            products.push(...data);
          }
          
          // Small delay to prevent overwhelming database
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          console.error(`Error in batch query for ${fieldName}:`, err);
        }
      }
      
      return products;
    };
    
    // Fetch products by different identifiers in parallel
    const [eanProducts, mpnProducts, nameProducts] = await Promise.all([
      matchOptions.useEan ? fetchProductsWithFilter('ean', eans) : [],
      matchOptions.useMpn ? fetchProductsWithFilter('mpn', mpns) : [], 
      matchOptions.useName ? fetchProductsWithFilter('title', productNames, 'ilike-any') : []
    ]);
    
    // Merge products (removing duplicates)
    const productMap = new Map();
    
    // Add products to map by ID to remove duplicates
    const addProductsToMap = (products) => {
      for (const product of products) {
        productMap.set(product.id, product);
      }
    };
    
    addProductsToMap(eanProducts);
    addProductsToMap(mpnProducts);
    addProductsToMap(nameProducts);
    
    // Convert map to array
    allProducts = Array.from(productMap.values());
    
    console.log(`Fetched a total of ${allProducts.length} distinct products for matching`);
    
    // Build lookup maps
      const productsByEan = {};
      const productsByMpn = {};
      const productsByName = {};
      
      // Helper function to normalize MPNs for consistent matching
      const normalizeMpn = (mpn) => {
        if (!mpn) return '';
        let normalized = mpn.toString().toLowerCase().trim();
        normalized = normalized.replace(/[^a-z0-9]/g, '');
        return normalized;
      };
      
    // Build efficient lookup structures
      allProducts.forEach(product => {
        if (product.ean) {
          productsByEan[product.ean] = product;
        }
        
        if (product.mpn) {
          const normalizedMpn = normalizeMpn(product.mpn);
          if (normalizedMpn) {
            productsByMpn[normalizedMpn] = product;
          }
        }
        
        if (product.custom_mpn) {
          const normalizedCustomMpn = normalizeMpn(product.custom_mpn);
          if (normalizedCustomMpn) {
            productsByMpn[normalizedCustomMpn] = product;
          }
        }
        
        if (product.title) {
          productsByName[product.title.toLowerCase()] = product;
        }
      });
      
    // Process each supplier's products
      const allSupplierProducts = [];
      const unmatchedSupplierData = [];
      const suppliersWithMatches = new Set();
      
      // Generate placeholder EAN helper function
      const generatePlaceholderEan = (supplierId, productName, mpn) => {
      const idPart = supplierId.substring(0, 6);
      const namePart = productName ? productName.substring(0, 3).replace(/\W/g, '') : 'x';
      const mpnPart = mpn ? mpn.substring(0, 3).replace(/\W/g, '') : 'x';
      const timestamp = Date.now().toString().substring(8);
      return `SP${idPart}${namePart}${mpnPart}${timestamp}`.substring(0, 20);
    };
    
    // Advanced MPN matching
    const matchMpn = (supplierMpn, productMpns) => {
      if (!supplierMpn) return null;
      
      const supplierNormalized = normalizeMpn(supplierMpn);
      if (!supplierNormalized) return null;
      
      // Direct lookup with standard normalization
      if (productMpns[supplierNormalized]) {
        return {
          product: productMpns[supplierNormalized],
          method: 'exact'
        };
      }
      
      // Try removing leading zeros
      const noLeadingZeros = supplierNormalized.replace(/^0+/, '');
      if (noLeadingZeros !== supplierNormalized && productMpns[noLeadingZeros]) {
        return {
          product: productMpns[noLeadingZeros],
          method: 'no-leading-zeros'
        };
      }
      
      // Try partial matching for longer MPNs only
      if (supplierNormalized.length >= 5) {
        for (const [key, product] of Object.entries(productMpns)) {
          if (key.length >= 5 && (key.includes(supplierNormalized) || supplierNormalized.includes(key))) {
            return {
              product,
              method: 'partial'
            };
          }
        }
      }
      
      return null;
    };
    
    // Process each valid supplier
    for (const supplierName of validSupplierNames) {
        const supplierId = supplierIdsByName[supplierName];
      const supplierData = supplierGroups[supplierName];
        
      if (!supplierId || !supplierData || !supplierData.products || supplierData.products.length === 0) {
          continue;
        }
        
        const matchedProducts = [];
      const matchedIndices = new Set();
        
        // Match by priority
        for (const method of matchOptions.priority) {
          if (
            (method === 'ean' && !matchOptions.useEan) ||
            (method === 'mpn' && !matchOptions.useMpn) ||
            (method === 'name' && !matchOptions.useName)
          ) {
            continue;
          }
          
        // Match supplier products
          supplierData.products.forEach((supplierProduct, index) => {
          if (matchedIndices.has(index)) return;
            
            let match = null;
            
            if (method === 'ean' && matchOptions.useEan) {
              const eanValue = matchColumns?.ean ? supplierProduct[matchColumns.ean] : supplierProduct.ean;
            if (eanValue && productsByEan[eanValue]) {
                match = productsByEan[eanValue];
                if (match) {
                matchedProducts.push({
                  supplierProduct,
                  product: match,
                  matchMethod: method
                });
                matchedIndices.add(index);
                suppliersWithMatches.add(supplierId);
                matchMethodStats[method]++;
                }
              }
            } else if (method === 'mpn' && matchOptions.useMpn) {
              const mpnValue = matchColumns?.mpn ? supplierProduct[matchColumns.mpn] : supplierProduct.mpn;
              if (mpnValue) {
                const matchResult = matchMpn(mpnValue, productsByMpn);
                if (matchResult) {
                matchedProducts.push({
                  supplierProduct,
                  product: matchResult.product,
                  matchMethod: method
                });
                matchedIndices.add(index);
                suppliersWithMatches.add(supplierId);
                matchMethodStats[method]++;
                }
              }
            } else if (method === 'name' && matchOptions.useName) {
              const nameValue = matchColumns?.name ? supplierProduct[matchColumns.name] : supplierProduct.product_name;
              if (nameValue) {
              const lowerName = nameValue.toLowerCase();
              match = productsByName[lowerName];
              
              if (!match) {
                // Try to find partial match for longer names only
                if (lowerName.length > 5) {
                  for (const [key, product] of Object.entries(productsByName)) {
                    if (key.length > 5 && (key.includes(lowerName) || lowerName.includes(key))) {
                      match = product;
                      break;
                  }
                }
              }
            }
            
            if (match) {
              matchedProducts.push({
                supplierProduct,
                product: match,
                matchMethod: method
              });
                matchedIndices.add(index);
              suppliersWithMatches.add(supplierId);
              matchMethodStats[method]++;
              }
              }
            }
          });
        }
        
        // Create supplier-product records for matches
        const supplierProductsForThisSupplier = matchedProducts.map(match => {
          const ean = match.supplierProduct.ean && match.supplierProduct.ean.trim() !== '' 
            ? match.supplierProduct.ean 
            : match.product.ean || generatePlaceholderEan(supplierId, match.supplierProduct.product_name, match.supplierProduct.mpn);

          return {
            supplier_id: supplierId,
            product_id: match.product.id,
            ean: ean,
            cost: match.supplierProduct.cost,
            moq: match.supplierProduct.moq || 1,
            lead_time: match.supplierProduct.lead_time || '3 days',
            payment_terms: match.supplierProduct.payment_terms || 'Net 30',
            match_method: match.matchMethod,
            updated_at: new Date().toISOString()
          };
        });
        
        allSupplierProducts.push(...supplierProductsForThisSupplier);
        
        // Handle unmatched supplier products
        supplierData.products.forEach((supplierProduct, index) => {
        if (!matchedIndices.has(index)) {
            matchMethodStats.none++;
            const ean = supplierProduct.ean && supplierProduct.ean.trim() !== '' 
              ? supplierProduct.ean 
              : generatePlaceholderEan(supplierId, supplierProduct.product_name, supplierProduct.mpn);
              
          unmatchedSupplierData.push({
              supplier_id: supplierId,
              product_id: null,
              ean: ean,
              cost: supplierProduct.cost,
              moq: supplierProduct.moq || 1,
              lead_time: supplierProduct.lead_time || '3 days',
              payment_terms: supplierProduct.payment_terms || 'Net 30',
            match_method: 'none',
              product_name: supplierProduct.product_name || '',
              mpn: supplierProduct.mpn || '',
              updated_at: new Date().toISOString()
            });
          }
        });
    }
    
    // Update is_matched flag for suppliers with matches - in a single operation
      if (suppliersWithMatches.size > 0) {
      await supabase
          .from('suppliers')
          .update({ is_matched: true })
          .in('id', Array.from(suppliersWithMatches));
    }
    
    // Process database operations in small batches
    const dbBatchSize = Math.min(50, batchSize);
    
    // First handle the matched supplier products
    let matchedSuccessCount = 0;
    for (let i = 0; i < allSupplierProducts.length; i += dbBatchSize) {
      const batch = allSupplierProducts.slice(i, i + dbBatchSize).filter(item => 
        item.supplier_id && item.product_id && item.ean && item.ean.trim() !== ''
      );
      
      if (batch.length === 0) continue;
      
      try {
        const { data: insertedData, error: relationError } = await supabase
          .from('supplier_products')
          .upsert(batch, {
            onConflict: 'supplier_id,product_id',
            ignoreDuplicates: false
          })
          .select();

        if (!relationError && insertedData) {
          matchedSuccessCount += insertedData.length;
          results.push(...insertedData);
          processedCount += insertedData.length;
        }
      } catch (error) {
        console.error('Error upserting supplier products batch:', error);
        // Continue with next batch
      }
      
      // Add a small delay between batches
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Handle unmatched records by supplier ID to minimize operations
    const unmatchedBySupplierId = {};
    unmatchedSupplierData.forEach(item => {
      if (!unmatchedBySupplierId[item.supplier_id]) {
        unmatchedBySupplierId[item.supplier_id] = [];
      }
      unmatchedBySupplierId[item.supplier_id].push(item);
    });
    
    // Process unmatched products by supplier
    let unmatchedSuccessCount = 0;
    for (const supplierId of Object.keys(unmatchedBySupplierId)) {
      const supplierProducts = unmatchedBySupplierId[supplierId];
      
      // Process in smaller batches
      for (let i = 0; i < supplierProducts.length; i += dbBatchSize) {
        const batch = supplierProducts.slice(i, i + dbBatchSize).filter(item => 
          item.supplier_id && item.ean && item.ean.trim() !== ''
        );
        
        if (batch.length === 0) continue;
        
        try {
          // Delete existing unmatched entries for these EANs
          const eansToCheck = batch.map(item => item.ean);
          await supabase
                    .from('supplier_products')
                    .delete()
                    .eq('supplier_id', supplierId)
                    .is('product_id', null)
                    .in('ean', eansToCheck);
              
              // Insert new unmatched records
                const { data: insertedUnmatched, error: unmatchedError } = await supabase
                  .from('supplier_products')
            .insert(batch)
                  .select();

          if (!unmatchedError && insertedUnmatched) {
            unmatchedSuccessCount += insertedUnmatched.length;
                  processedCount += insertedUnmatched.length;
          }
        } catch (error) {
          console.error('Error inserting unmatched supplier products batch:', error);
          // Continue with next batch
        }
        
        // Add a small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      }

      // Final results and statistics
    const totalMatched = matchedSuccessCount;
    const totalUnmatched = unmatchedSuccessCount;
      const totalProcessed = totalMatched + totalUnmatched;
      
    console.log('======== IMPORT SUMMARY ========');
      console.log(`Total processed: ${totalProcessed}`);
      console.log(`Total matched: ${totalMatched}`);
      console.log(`Total unmatched: ${totalUnmatched}`);
      console.log(`Match by EAN: ${matchMethodStats.ean}`);
      console.log(`Match by MPN: ${matchMethodStats.mpn}`);
      console.log(`Match by Name: ${matchMethodStats.name}`);
      console.log(`Unmatched count: ${matchMethodStats.none}`);
    console.log('===============================');
      
    return {
        processedCount: totalProcessed,
        supplierCount: Object.keys(supplierGroups).length,
        matchStats: {
          totalMatched: totalMatched,
          byMethod: {
            ean: matchMethodStats.ean,
            mpn: matchMethodStats.mpn,
            name: matchMethodStats.name
          },
          unmatchedCount: totalUnmatched
        }
      };
    } catch (error) {
      console.error('Error importing supplier data:', error);
    return {
      processedCount: 0,
      supplierCount: 0,
      error: error.message,
      matchStats: {
        totalMatched: 0,
        byMethod: { ean: 0, mpn: 0, name: 0 }
      }
    };
  }
}

// Import product data function (reference to existing function)
async function importProductData(mappedData, progressCallback, batchSize) {
  try {
    console.log(`Importing ${mappedData.length} products with batch size ${batchSize}`);
    
    if (!mappedData || mappedData.length === 0) {
      throw new Error('No product data to import');
    }

    const results = [];
    
    // Process products in batches
    for (let i = 0; i < mappedData.length; i += batchSize) {
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(mappedData.length/batchSize)}`);
      const batch = mappedData.slice(i, i + batchSize).map(product => {
        const { custom_attributes, ...productData } = product;
        
        // Build the product record with both standard fields and custom fields
        const productRecord = {
          ...productData,
          updated_at: new Date().toISOString()
        };
        
        // If we have custom attributes, add them directly to the product record
        if (custom_attributes) {
          // Map known custom attributes to their respective columns
          if (custom_attributes['Title'] !== undefined) productRecord.custom_title = custom_attributes['Title'];
          if (custom_attributes['EAN'] !== undefined) productRecord.custom_ean = custom_attributes['EAN'];
          if (custom_attributes['MPN'] !== undefined) {
            productRecord.custom_mpn = custom_attributes['MPN'];
            // Also store in the regular mpn column
            productRecord.mpn = custom_attributes['MPN'];
          }
          if (custom_attributes['Units Sold in 30 days'] !== undefined) 
            productRecord.custom_units_sold_in_30_days = custom_attributes['Units Sold in 30 days'];
          if (custom_attributes['FBA Fee'] !== undefined) 
            productRecord.custom_fba_fee = parseFloat(custom_attributes['FBA Fee']) || 0;
        }
        
        return productRecord;
      });
      
      console.log(`Sending batch of ${batch.length} products to database`);
      
      // Determine which products have real EANs vs generated ones
      const productsWithRealEans = batch.filter(p => !p.ean.startsWith('GEN'));
      const productsWithGeneratedEans = batch.filter(p => p.ean.startsWith('GEN'));
      
      let successfulInserts = [];
      
      // First, upsert products with real EANs
      if (productsWithRealEans.length > 0) {
        console.log(`Upserting ${productsWithRealEans.length} products with real EANs`);
        const { data: insertedWithEan, error: eanError } = await supabase
          .from('products')
          .upsert(productsWithRealEans, {
            onConflict: 'ean',
            ignoreDuplicates: false
          })
          .select();
          
        if (eanError) {
          console.error('Database error upserting products with real EANs:', eanError);
        } else if (insertedWithEan) {
          console.log(`Successfully upserted ${insertedWithEan.length} products with real EANs`);
          successfulInserts.push(...insertedWithEan);
        }
      }
      
      // Then, handle products with generated EANs - try to match by title and brand
      if (productsWithGeneratedEans.length > 0) {
        console.log(`Processing ${productsWithGeneratedEans.length} products with generated EANs`);
        
        for (const product of productsWithGeneratedEans) {
          try {
            // First check if a similar product already exists by title and brand
            const { data: existingProducts, error: searchError } = await supabase
              .from('products')
              .select('*')
              .ilike('title', `%${product.title.substring(0, Math.min(product.title.length, 20))}%`)
              .eq('brand', product.brand)
              .limit(1);
              
            if (searchError) {
              console.error('Error searching for existing product:', searchError);
              continue;
            }
            
            if (existingProducts && existingProducts.length > 0) {
              // Found an existing product, update it
              console.log(`Found existing product match for "${product.title}" - updating`);
              const existingId = existingProducts[0].id;
              
              const { data: updated, error: updateError } = await supabase
                .from('products')
                .update({
                  ...product,
                  ean: existingProducts[0].ean // Keep the original EAN
                })
                .eq('id', existingId)
                .select();
                
              if (updateError) {
                console.error('Error updating existing product:', updateError);
              } else if (updated) {
                console.log(`Updated existing product with ID ${existingId}`);
                successfulInserts.push(...updated);
              }
            } else {
              // No match found, insert as new
              console.log(`No existing product found for "${product.title}" - inserting as new`);
              const { data: inserted, error: insertError } = await supabase
                .from('products')
                .insert(product)
                .select();
                
              if (insertError) {
                console.error('Error inserting new product:', insertError);
              } else if (inserted) {
                console.log(`Inserted new product with generated EAN: ${product.ean}`);
                successfulInserts.push(...inserted);
              }
            }
          } catch (productError) {
            console.error(`Error processing product with generated EAN: ${product.title}`, productError);
          }
        }
      }
      
      results.push(...successfulInserts);
      
      // Add a small delay between batches
      if (i + batchSize < mappedData.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`Import complete. Processed ${results.length} products successfully`);
    return {
      results,
      processedCount: results.length
    };
  } catch (error) {
    console.error('Error importing product data:', error);
    throw error;
  }
}

// Process the product file in manageable chunks using streaming with better progress reporting
async function processProductFileInChunks(job, fieldMapping, results) {
  const batchSize = job.batch_size || 100;
  const chunkSize = 5000; // Process 5000 rows at a time in memory
  const totalRows = job.total_rows || 1000; // Use estimated total rows or default
  
  console.log(`Processing product file in chunks. Batch size: ${batchSize}, Chunk size: ${chunkSize}, Estimated total rows: ${totalRows}`);
  console.log(`File path: ${job.file_path}`);
  
  let currentChunk = [];
  let totalProcessed = 0;
  let lastUpdateTime = Date.now();
  
  try {
    console.log('Creating read stream for product file...');
    const fileStream = fs.createReadStream(job.file_path, { encoding: 'utf8' });
    
    // Initial progress update to show process has started
    await updateJobProgress(job.id, 32, `Started processing data`);
    
    fileStream
      .pipe(csv())
      .on('data', async (row) => {
        currentChunk.push(row);
        
        // When chunk reaches size, pause stream and process
        if (currentChunk.length >= chunkSize) {
          fileStream.pause();
          console.log(`Processing product chunk of ${currentChunk.length} rows...`);
          
          try {
            await processProductChunk(currentChunk, job, fieldMapping, results);
            totalProcessed += currentChunk.length;
            currentChunk = [];
            
            // Calculate progress as a percentage between 35% (start) and 90% (end of data processing)
            // This leaves room for remaining 10% for finalizing
            const dataProcessingRange = 55; // From 35% to 90%
            const completionPercentage = Math.min(totalProcessed / totalRows, 1);
            const progress = Math.min(90, Math.floor(35 + (dataProcessingRange * completionPercentage)));
            
            // Update progress every 2 seconds or after processing large chunks
            const now = Date.now();
            if (now - lastUpdateTime > 2000) {
              console.log(`Progress update: ${progress}% - Processed ${totalProcessed}/${totalRows} rows`);
              await updateJobProgress(job.id, progress, `Processing data... ${progress}%`);
              lastUpdateTime = now;
            }
          } catch (error) {
            console.error('Error processing product chunk:', error);
          }
          
          fileStream.resume();
        }
      })
      .on('end', async () => {
        // Process any remaining rows
        if (currentChunk.length > 0) {
          console.log(`Processing final product chunk of ${currentChunk.length} rows...`);
          await processProductChunk(currentChunk, job, fieldMapping, results);
          totalProcessed += currentChunk.length;
        }
        
        console.log(`Product file processing complete. Total rows processed: ${totalProcessed}`);
        console.log('Results:', results);
        
        // Update progress to 95% - finalizing import
        await updateJobProgress(job.id, 95, 'Finalizing import');
        
        // Update job as completed
        await supabase
          .from('import_jobs')
          .update({
            status: 'completed',
            status_message: 'Import completed successfully',
            progress: 100,
            results: results,
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);
        
        console.log('Product import job marked as completed');
          
        // Clean up temporary file
        fs.unlink(job.file_path, (err) => {
          if (err) console.error('Error deleting temporary file:', err);
          else console.log('Temporary file deleted');
        });
      })
      .on('error', async (error) => {
        console.error('Error reading product CSV file:', error);
        await updateJobStatus(job.id, 'failed', `Error reading CSV file: ${error.message}`);
      });
  } catch (error) {
    console.error('Error in processProductFileInChunks:', error);
    await updateJobStatus(job.id, 'failed', `Error processing product file: ${error.message}`);
  }
}

// Process a chunk of product CSV data
async function processProductChunk(chunk, job, fieldMapping, results) {
  try {
    console.log(`Processing ${chunk.length} product rows with field mapping:`, fieldMapping);
    
    // Get required fields from config
    const requiredFields = config.requiredFields?.product || ['Title', 'Brand', 'Sale Price'];
    console.log('Required product fields from config:', requiredFields);
    
    // Map the data according to field mapping
    const mappedData = await mapProductData(chunk, fieldMapping, requiredFields);
    console.log(`Mapped ${mappedData.length} products successfully`);
    
    // Process the mapped data in smaller batches for database operations
    const batchSize = job.batch_size || 100;
    
    // Process the product data
    console.log(`Importing products with batch size: ${batchSize}`);
    const importResults = await importProductData(
      mappedData,
      null, // No progress callback needed here
      batchSize
    );
    
    console.log('Import results:', importResults);
    
    // Update results
    results.totalRecords += chunk.length;
    results.successfulImports += importResults.processedCount || 0;
    results.failedImports += (chunk.length - (importResults.processedCount || 0));
    
    console.log('Chunk processing complete. Updated results:', results);
    return results;
  } catch (error) {
    console.error('Error processing product chunk:', error);
    throw error;
  }
}

// Update job progress with more realistic values
async function updateJobProgress(jobId, progress, message) {
  try {
    // Ensure progress never decreases from previous value
    const { data: currentJob } = await supabase
      .from('import_jobs')
      .select('progress')
      .eq('id', jobId)
      .single();
    
    // Only update if new progress is higher than current progress
    const newProgress = currentJob && currentJob.progress ? Math.max(currentJob.progress, progress) : progress;
    
    await supabase
      .from('import_jobs')
      .update({
        progress: newProgress,
        status_message: message
      })
      .eq('id', jobId);
      
    console.log(`Updated job ${jobId} progress: ${newProgress}%, message: ${message}`);
  } catch (error) {
    console.error('Error updating job progress:', error);
  }
}

// Helper function to update job status
async function updateJobStatus(jobId, status, message) {
  try {
    await supabase
      .from('import_jobs')
      .update({
        status: status,
        status_message: message,
        completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null
      })
      .eq('id', jobId);
  } catch (error) {
    console.error('Error updating job status:', error);
  }
}

// Export the router and necessary functions for use in other files
module.exports = router;

// Also export utility functions for use in other modules
module.exports.importSupplierData = importSupplierData;
module.exports.importProductData = importProductData;
module.exports.autoMapSupplierColumns = autoMapSupplierColumns;
module.exports.autoMapProductColumns = autoMapProductColumns;
module.exports.mapSupplierData = mapSupplierData;
module.exports.mapProductData = mapProductData; 

// Add a new function to handle improved job status checking with retries
async function checkJobStatusWithRetry(jobId, maxRetries = 3, retryDelay = 2000) {
  console.log(`Checking status for job ${jobId} with retry mechanism`);
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      console.log(`Status check attempt ${retries + 1}/${maxRetries + 1} for job ${jobId}`);
      
      const response = await fetch(`${API_URL}/api/upload/status/${jobId}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 15000 // 15 second timeout
      });
      
      // Log any non-200 status
      if (!response.ok) {
        console.warn(`Job status check returned non-200 status: ${response.status} for job ${jobId}`);
        
        // For 404, the job doesn't exist anymore
        if (response.status === 404) {
          throw new Error('Job not found or has been deleted');
        }
        
        // For 5xx errors, retry after delay
        if (response.status >= 500) {
          console.error(`Server error (${response.status}) when checking job status. Retrying...`);
          retries++;
          
          if (retries <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          } else {
            // If we've exhausted retries, throw an error
            throw new Error(`Server error (${response.status}) after ${maxRetries} retries`);
          }
        }
      }
      
      // Get response as text first to debug potential JSON parsing issues
      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error('Failed to parse job status response as JSON:', error);
        console.error('Raw response:', responseText);
        throw new Error('Invalid JSON response from server');
      }
      
      // Successfully got and parsed the response
      return data;
      
    } catch (error) {
      console.error(`Error checking job ${jobId} status (attempt ${retries + 1}/${maxRetries + 1}):`, error);
      
      // Only retry for network or connection errors
      if (error.name === 'TypeError' || error.name === 'FetchError' || 
          error.message.includes('NetworkError') || error.message.includes('network')) {
        retries++;
        if (retries <= maxRetries) {
          console.log(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
      
      // Re-throw the error for non-retryable errors or if we've exhausted retries
      throw error;
    }
  }
  
  // This should never be reached due to the throw in the loop,
  // but just in case, throw a generic error
  throw new Error(`Failed to check job status after ${maxRetries} retries`);
}

// Add diagnostic debugging to log MPNs from both sides for comparison
const debugMpnMatching = (supplierData, allProducts) => {
  try {
    console.log('\n=================== MPN MATCHING DIAGNOSTIC ===================');
    
    // Count and list supplier MPNs
    const supplierMpns = [];
    let supplierMpnCount = 0;
    
    for (const [_, supplierGroup] of Object.entries(supplierData)) {
      if (supplierGroup.products) {
        for (const product of supplierGroup.products) {
          if (product.mpn) {
            supplierMpnCount++;
            supplierMpns.push({
              original: product.mpn,
              normalized: normalizeMpn(product.mpn)
            });
          }
        }
      }
    }
    
    // Count and list product MPNs
    const productMpns = [];
    let productMpnCount = 0;
    
    for (const product of allProducts) {
      if (product.mpn) {
        productMpnCount++;
        productMpns.push({
          id: product.id,
          original: product.mpn,
          normalized: normalizeMpn(product.mpn)
        });
      }
      if (product.custom_mpn) {
        productMpnCount++;
        productMpns.push({
          id: product.id,
          original: product.custom_mpn,
          normalized: normalizeMpn(product.custom_mpn)
        });
      }
    }
    
    console.log(`Supplier MPNs: ${supplierMpnCount}`);
    console.log(`Product MPNs: ${productMpnCount}`);
    
    // Print sample MPNs from both sides
    console.log('\nSample supplier MPNs:');
    supplierMpns.slice(0, 20).forEach(mpn => {
      console.log(`  "${mpn.original}" → "${mpn.normalized}"`);
    });
    
    console.log('\nSample product MPNs:');
    productMpns.slice(0, 20).forEach(mpn => {
      console.log(`  ID ${mpn.id}: "${mpn.original}" → "${mpn.normalized}"`);
    });
    
    // Check for potential matches
    console.log('\nPotential matches:');
    let potentialMatchCount = 0;
    
    for (const supplierMpn of supplierMpns.slice(0, 50)) { // Limit to first 50 for performance
      for (const productMpn of productMpns) {
        if (supplierMpn.normalized === productMpn.normalized) {
          console.log(`  EXACT: Supplier "${supplierMpn.original}" matches Product ID ${productMpn.id}: "${productMpn.original}"`);
          potentialMatchCount++;
        } else if (supplierMpn.normalized.includes(productMpn.normalized) || 
                  productMpn.normalized.includes(supplierMpn.normalized)) {
          if (supplierMpn.normalized.length > 3 && productMpn.normalized.length > 3) {
            console.log(`  PARTIAL: Supplier "${supplierMpn.original}" may match Product ID ${productMpn.id}: "${productMpn.original}"`);
            potentialMatchCount++;
          }
        }
      }
    }
    
    console.log(`\nFound ${potentialMatchCount} potential matches`);
    console.log('=================== END DIAGNOSTIC ===================\n');
  } catch (error) {
    console.error('Error in MPN diagnostic:', error);
  }
};

// Call diagnostic function before processing
// debugMpnMatching(supplierGroups, allProducts);

// Add a logs viewing endpoint
router.get('/api/logs', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]; // Default to today
    const level = req.query.level?.toUpperCase(); // Optional filter by log level
    const lines = req.query.lines ? parseInt(req.query.lines) : 1000; // Default to 1000 lines
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    const logFile = path.join(logDir, `server-${date}.log`);
    
    if (!fs.existsSync(logFile)) {
      return res.status(404).json({ error: 'Log file not found', availableFiles: fs.readdirSync(logDir) });
    }
    
    // Read the log file
    let logContent = fs.readFileSync(logFile, 'utf8');
    
    // Split into lines
    let logLines = logContent.split('\n').filter(line => line.trim() !== '');
    
    // Filter by level if specified
    if (level) {
      logLines = logLines.filter(line => line.includes(`[${level}]`));
    }
    
    // Get the last N lines
    logLines = logLines.slice(-lines);
    
    return res.status(200).json({ 
      date,
      filteredByLevel: level || 'ALL',
      lines: logLines.length,
      logs: logLines
    });
  } catch (error) {
    console.error('Error retrieving logs:', error);
    return res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Add an endpoint to list available log files
router.get('/api/logs/files', (req, res) => {
  try {
    const logFiles = fs.readdirSync(logDir)
      .filter(file => file.startsWith('server-') && file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        return {
          date: file.replace('server-', '').replace('.log', ''),
          filename: file,
          size: stats.size,
          created: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first
      
    return res.status(200).json({ 
      files: logFiles,
      count: logFiles.length
    });
  } catch (error) {
    console.error('Error listing log files:', error);
    return res.status(500).json({ error: 'Failed to list log files' });
  }
});

// Worker-based processing for large imports using worker threads
async function processChunkWithWorkers(chunk, job, fieldMapping, results) {
  try {
    console.log(`Processing chunk with ${chunk.length} rows using worker threads...`);
    
    // Only keep necessary data in memory
    const slimChunk = chunk.map(row => {
      const slimRow = {};
      Object.values(fieldMapping).forEach(columnName => {
        if (columnName && row[columnName] !== undefined) {
          slimRow[columnName] = row[columnName];
        }
      });
      return slimRow;
    });
    
    // Create processing function for worker pool
    async function processDataInWorker(data) {
      // First map the data
      const { slimmedData, fieldMap } = data;
      
      // Simple mapper that doesn't require database access
      function mapSupplierDataNoDb(data, fieldMapping) {
        const mappedData = [];
        
        for (const row of data) {
          try {
            // Process cost value
            let cost = 0;
            const costValue = row[fieldMapping['Cost']];
            if (costValue) {
              // Remove all non-numeric characters except decimal point
              const numericValue = costValue.replace(/[^0-9.]/g, '');
              cost = parseFloat(numericValue) || 0;
            }
            
            const supplierData = {
              supplier_name: row[fieldMapping['Supplier Name']]?.trim() || '',
              ean: row[fieldMapping['EAN']]?.trim() || '',
              mpn: row[fieldMapping['MPN']]?.trim() || '',
              product_name: row[fieldMapping['Product Name']]?.trim() || '',
              cost: cost,
              moq: parseInt(row[fieldMapping['MOQ']]) || 1,
              lead_time: row[fieldMapping['Lead Time']]?.trim() || '3 days',
              payment_terms: row[fieldMapping['Payment Terms']]?.trim() || 'Net 30',
              custom_attributes: {}
            };
            
            // Validate supplier data
            if (!supplierData.supplier_name) {
              continue;
            }
            
            mappedData.push(supplierData);
          } catch (error) {
            // Skip invalid entries
          }
        }
        
        return mappedData;
      }
      
      // Process the data
      return mapSupplierDataNoDb(slimmedData, fieldMap);
    }
    
    // Determine optimal split based on CPUs
    const workerCount = Math.min(config.getThreadCount(), chunk.length > 1000 ? 4 : 2);
    const chunkSize = Math.ceil(slimChunk.length / workerCount);
    
    console.log(`Using ${workerCount} workers with ${chunkSize} rows per worker`);
    
    // Split data for workers
    const tasks = [];
    for (let i = 0; i < workerCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, slimChunk.length);
      if (start < end) {
        tasks.push(pool.exec(processDataInWorker, [{
          slimmedData: slimChunk.slice(start, end),
          fieldMap: fieldMapping
        }]));
      }
    }
    
    // Wait for all workers to complete
    const workerResults = await Promise.all(tasks);
    
    // Combine results from all workers
    let mappedData = [];
    for (const result of workerResults) {
      mappedData = mappedData.concat(result);
    }
    
    // Clear original data to help GC
    chunk.length = 0;
    slimChunk.length = 0;
    
    console.log(`Worker processing complete. Mapped ${mappedData.length} records`);
    
    // Continue with database operations as before
    if (mappedData.length === 0) {
      console.log('No valid data to process after mapping');
      return results;
    }
    
    // Process the supplier data with the chosen match options
    const matchOptions = job.match_options || {
      useEan: true,
      useMpn: true,
      useName: false,
      priority: ['ean', 'mpn', 'name']
    };
    
    // Split data into smaller sub-batches for sequential DB processing
    const batchSize = Math.min(job.batch_size || 50, 50);
    const batches = [];
    
    for (let i = 0; i < mappedData.length; i += batchSize) {
      batches.push(mappedData.slice(i, i + batchSize));
    }
    
    // Process each batch with the database
    let processedCount = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const batchResults = await importSupplierData(
          batch,
          matchOptions,
          null,
          batchSize,
          job.match_column_mapping,
          job.id
        );
        
        // Update results
        results.totalRecords = (results.totalRecords || 0) + batch.length;
        results.successfulImports = (results.successfulImports || 0) + (batchResults.processedCount || 0);
        results.failedImports = (results.failedImports || 0) + (batch.length - (batchResults.processedCount || 0));
        results.suppliersAdded = (results.suppliersAdded || 0) + (batchResults.supplierCount || 0);
        
        // Handle match statistics
        if (!results.matchStats) {
          results.matchStats = {
            totalMatched: 0,
            byMethod: {
              ean: 0,
              mpn: 0,
              name: 0
            }
          };
        }
        
        if (batchResults.matchStats) {
          results.matchStats.totalMatched = (results.matchStats.totalMatched || 0) + 
            (batchResults.matchStats.totalMatched || 0);
          
          if (batchResults.matchStats.byMethod) {
            results.matchStats.byMethod.ean = (results.matchStats.byMethod.ean || 0) + 
              (batchResults.matchStats.byMethod.ean || 0);
            results.matchStats.byMethod.mpn = (results.matchStats.byMethod.mpn || 0) + 
              (batchResults.matchStats.byMethod.mpn || 0);
            results.matchStats.byMethod.name = (results.matchStats.byMethod.name || 0) + 
              (batchResults.matchStats.byMethod.name || 0);
          }
        }
        
        processedCount += batch.length;
        batch.length = 0;
        
        // Small delay between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (global.gc) global.gc();
        }
      } catch (error) {
        console.error(`Error processing batch ${i+1}:`, error);
        // Continue with next batch
      }
    }
    
    // Clean up 
    mappedData = null;
    batches.length = 0;
    
    if (global.gc) global.gc();
    
    return results;
  } catch (error) {
    console.error('Error in worker-based processing:', error);
    chunk.length = 0;
    throw error;
  }
}