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

// Test the Supabase connection
(async () => {
  try {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.from('import_jobs').select('count').limit(1);
    
    if (error) {
      console.error('❌ Supabase connection test failed:', error);
      console.error('Please check your environment variables and network connection.');
    } else {
      console.log('✅ Successfully connected to Supabase!');
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
  const batchSize = job.batch_size || config.defaultBatchSize || 250;
  const chunkSize = config.defaultChunkSize || Math.min(5000, Math.max(1000, Math.floor(50000000 / job.file_size))); // Use config or calculate based on file size
  const totalRows = job.total_rows || 1000; // Use estimated total rows or default
  
  console.log(`Processing file in chunks. Batch size: ${batchSize}, Chunk size: ${chunkSize}, Estimated total rows: ${totalRows}`);
  console.log(`File path: ${job.file_path}`);
  console.log(`File size: ${job.file_size} bytes, Adjusted chunk size: ${chunkSize} rows`);
  
  let currentChunk = [];
  let totalProcessed = 0;
  let lastUpdateTime = Date.now();
  let lastProgressUpdate = 0;
  let lastMemoryCheck = Date.now();
  let gcInterval = null;
  let throttleDelay = 0; // Dynamic throttling delay
  let consecutiveErrors = 0; // Track consecutive chunk processing errors
  
  // Set up garbage collection interval for large files
  if (global.gc && totalRows > 10000) {
    console.log('Setting up forced garbage collection interval for large file processing');
    gcInterval = setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        console.log(`Memory usage: ${memUsageMB}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB (${Math.round(memUsage.heapUsed / memUsage.heapTotal * 100)}%)`);
        
        // Adjust throttling based on memory usage
        if (memUsageMB > (config.highMemoryThreshold || 1024)) {
          throttleDelay = Math.min(2000, throttleDelay + 500); // Increase throttling gradually
          console.log(`High memory usage detected (${memUsageMB}MB), setting throttle delay to ${throttleDelay}ms`);
        } else if (throttleDelay > 0 && memUsageMB < ((config.highMemoryThreshold || 1024) * 0.7)) {
          // If memory usage is below 70% of threshold, reduce throttling
          throttleDelay = Math.max(0, throttleDelay - 500);
          console.log(`Memory usage acceptable (${memUsageMB}MB), reducing throttle delay to ${throttleDelay}ms`);
        }
        
        global.gc();
        console.log('Forced garbage collection complete');
      } catch (err) {
        console.error('Error during garbage collection:', err);
      }
    }, config.forceGCInterval || 10000);
  }
  
  try {
    console.log('Creating read stream for file...');
    const fileStream = fs.createReadStream(job.file_path, { 
      encoding: 'utf8',
      highWaterMark: 64 * 1024 // 64KB buffer size to reduce memory usage
    });
    
    // Initial progress update to show process has started
    await updateJobProgress(job.id, 32, `Started processing data`);
    
    // Setup stream processing with error handling and backpressure management
    const csvStream = fileStream.pipe(csv({
      skipLines: 0,
      maxRows: config.maxRows || (totalRows + 1), // Limit to prevent memory issues
      strict: false // Be more forgiving with CSV format
    }));
    
    // Track failed rows for reporting
    const failedRows = [];
    
    csvStream.on('data', async (row) => {
      currentChunk.push(row);
      
      // When chunk reaches size, pause stream and process
      if (currentChunk.length >= chunkSize) {
        // Pause both streams to prevent buffer overflow
        csvStream.pause();
        fileStream.pause();
        
        console.log(`Processing chunk of ${currentChunk.length} rows...`);
        
        // Apply throttling if necessary
        if (throttleDelay > 0) {
          console.log(`Throttling processing for ${throttleDelay}ms to manage memory usage`);
          await new Promise(resolve => setTimeout(resolve, throttleDelay));
        }
        
        // Check memory usage before processing chunk
        const memoryUsage = process.memoryUsage();
        const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        console.log(`Current memory usage: ${memoryUsageMB}MB`);
        
        try {
          await processChunk(currentChunk, job, fieldMapping, results);
          totalProcessed += currentChunk.length;
          
          // Reset consecutive errors counter on success
          consecutiveErrors = 0;
          
          // Empty array without creating a new one to avoid memory leaks
          currentChunk.length = 0;
          
          // Calculate progress percentage
          const dataProcessingRange = 55; // From 35% to 90%
          const completionPercentage = Math.min(totalProcessed / totalRows, 1);
          const progress = Math.min(90, Math.floor(35 + (dataProcessingRange * completionPercentage)));
          
          // Update progress, but not too frequently (at most every 2% or 2 seconds)
          const now = Date.now();
          if (progress - lastProgressUpdate >= 2 || now - lastUpdateTime > 2000) {
            console.log(`Progress update: ${progress}% - Processed ${totalProcessed}/${totalRows} rows`);
            await updateJobProgress(job.id, progress, `Processing data... ${progress}%`);
            lastUpdateTime = now;
            lastProgressUpdate = progress;
          }
        } catch (error) {
          console.error('Error processing chunk:', error);
          consecutiveErrors++;
          
          // Record error information
          const firstRowNum = totalProcessed + 1;
          const lastRowNum = totalProcessed + currentChunk.length;
          failedRows.push({
            firstRow: firstRowNum,
            lastRow: lastRowNum,
            count: currentChunk.length,
            error: error.message || 'Unknown error'
          });
          
          // If we have multiple consecutive errors, increase throttling
          if (consecutiveErrors > 2) {
            throttleDelay = Math.min(5000, throttleDelay + 1000);
            console.log(`Multiple consecutive errors detected, increasing throttle delay to ${throttleDelay}ms`);
          }
          
          // Still count these as processed
          totalProcessed += currentChunk.length;
          
          // Update job with error information but don't fail the entire job
          await updateJobStatus(job.id, 'processing', `Error processing rows ${firstRowNum}-${lastRowNum}: ${error.message}`);
          
          // Clear the chunk so we can continue
          currentChunk.length = 0;
        }
        
        // Force garbage collection if available
        if (global.gc && (Date.now() - lastMemoryCheck > 30000)) {
          console.log('Forcing garbage collection after chunk processing');
          global.gc();
          lastMemoryCheck = Date.now();
        }
        
        // Resume both streams
        csvStream.resume();
        fileStream.resume();
      }
    });
    
    csvStream.on('end', async () => {
      // Process any remaining rows
      if (currentChunk.length > 0) {
        console.log(`Processing final chunk of ${currentChunk.length} rows...`);
        try {
          await processChunk(currentChunk, job, fieldMapping, results);
          totalProcessed += currentChunk.length;
        } catch (error) {
          console.error('Error processing final chunk:', error);
          // Record error information
          const firstRowNum = totalProcessed + 1;
          const lastRowNum = totalProcessed + currentChunk.length;
          failedRows.push({
            firstRow: firstRowNum,
            lastRow: lastRowNum,
            count: currentChunk.length,
            error: error.message || 'Unknown error'
          });
          
          // Still count these as processed
          totalProcessed += currentChunk.length;
        }
        currentChunk.length = 0; // Clear for GC
      }
      
      console.log(`File processing complete. Total rows processed: ${totalProcessed}`);
      
      // Clear the garbage collection interval if set
      if (gcInterval) {
        clearInterval(gcInterval);
        console.log('Cleared garbage collection interval');
      }
      
      // Add failed rows information to results
      results.failedGroups = failedRows;
      results.totalFailedGroups = failedRows.length;
      
      console.log('Results:', results);
      
      // Update progress to 95% - finalizing import
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
            // Ensure match statistics are properly included
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
      
      console.log('Job marked as completed');
        
      // Clean up temporary file
      fs.unlink(job.file_path, (err) => {
        if (err) console.error('Error deleting temporary file:', err);
        else console.log('Temporary file deleted');
      });
    });
    
    csvStream.on('error', async (error) => {
      console.error('Error reading CSV file:', error);
      await updateJobStatus(job.id, 'failed', `Error reading CSV file: ${error.message}`);
      
      // Clear the garbage collection interval if set
      if (gcInterval) {
        clearInterval(gcInterval);
        console.log('Cleared garbage collection interval due to error');
      }
    });
    
    // Error handling for the file stream
    fileStream.on('error', async (error) => {
      console.error('Error with file stream:', error);
      await updateJobStatus(job.id, 'failed', `Error reading file: ${error.message}`);
      
      // Clear the garbage collection interval if set
      if (gcInterval) {
        clearInterval(gcInterval);
        console.log('Cleared garbage collection interval due to error');
      }
    });
  } catch (error) {
    console.error('Error in processFileInChunks:', error);
    await updateJobStatus(job.id, 'failed', `Error processing file: ${error.message}`);
    
    // Clear the garbage collection interval if set
    if (gcInterval) {
      clearInterval(gcInterval);
      console.log('Cleared garbage collection interval due to error');
    }
  }
}

// Process a chunk of supplier CSV data
async function processChunk(chunk, job, fieldMapping, results) {
  try {
    console.log(`Processing chunk with ${chunk.length} rows...`);
    console.log('First row example:', JSON.stringify(chunk[0]));
    
    // Map the data according to field mapping
    console.log('Mapping CSV data with field mapping...');
    const mappedData = await mapSupplierData(chunk, fieldMapping);
    
    console.log(`Mapping complete. Got ${mappedData.data?.length || 0} mapped records`);
    if (mappedData.warnings && mappedData.warnings.currencyWarning) {
      console.warn('⚠️ Currency warning detected:', mappedData.warnings.message);
    }
    
    // Process the mapped data in smaller batches for database operations
    const batchSize = job.batch_size || 100;
    
    // Process the supplier data with the chosen match options
    console.log('Starting supplier data import with options:', job.match_options || {
      useEan: true,
      useMpn: true,
      useName: false,
      priority: ['ean', 'mpn', 'name']
    });
    
    if (job.match_column_mapping) {
      console.log('Using custom match columns:', job.match_column_mapping);
    }
    
    const importResults = await importSupplierData(
      mappedData.data,
      job.match_options || {
        useEan: true,
        useMpn: true,
        useName: false,
        priority: ['ean', 'mpn', 'name']
      },
      null, // No progress callback needed here
      batchSize,
      job.match_column_mapping // Pass the custom match column mapping
    );
    
    // Update results
    results.totalRecords += chunk.length;
    results.successfulImports += importResults.processedCount || 0;
    results.failedImports += (chunk.length - (importResults.processedCount || 0));
    results.suppliersAdded += importResults.supplierCount || 0;
    
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
    
    // Update match statistics from the import results
    if (importResults.matchStats) {
      results.matchStats.totalMatched = (results.matchStats.totalMatched || 0) + (importResults.matchStats.totalMatched || 0);
      
      // Update match method counts
      if (importResults.matchStats.byMethod) {
        results.matchStats.byMethod.ean = (results.matchStats.byMethod.ean || 0) + (importResults.matchStats.byMethod.ean || 0);
        results.matchStats.byMethod.mpn = (results.matchStats.byMethod.mpn || 0) + (importResults.matchStats.byMethod.mpn || 0);
        results.matchStats.byMethod.name = (results.matchStats.byMethod.name || 0) + (importResults.matchStats.byMethod.name || 0);
      }
    }
    
    console.log('Chunk processing complete. Updated results:', results);
    
    // Help garbage collection by explicitly clearing large objects
    chunk.length = 0;
    if (mappedData.data) mappedData.data.length = 0;
    
    // Force garbage collection if available
    if (global.gc) {
      console.log('Forcing garbage collection after chunk processing');
      global.gc();
    }
    
    return results;
  } catch (error) {
    console.error('Error processing chunk:', error);
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
          ean: row[fieldMapping['EAN']]?.trim() || '',
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
          ean: row[fieldMapping['EAN']]?.trim() || '',
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

// Import supplier data function (reference to existing function)
async function importSupplierData(mappedData, matchOptions, progressCallback, batchSize, matchColumns) {
  try {
    console.log(`Importing ${mappedData.length} supplier records with batch size ${batchSize}`);
    console.log('Match options:', JSON.stringify(matchOptions));
    
    // Log custom match columns if provided
    if (matchColumns) {
      console.log('Custom match columns will be used for matching:', JSON.stringify(matchColumns));
    }
    
    if (!mappedData || mappedData.length === 0) {
      console.warn('No supplier data to import');
      throw new Error('No supplier data to import');
    }

    // Group data by supplier to reduce the number of upsert operations
    console.log(`Grouping ${mappedData.length} rows by supplier name`);
    
    const supplierGroups = mappedData.reduce((acc, row) => {
      const { supplier_name, custom_attributes, ...productData } = row;
      
      // Skip rows with empty supplier name
      if (!supplier_name || supplier_name.trim() === '') {
        console.warn('Found row with empty supplier_name');
        return acc;
      }
      
      if (!acc[supplier_name]) {
        acc[supplier_name] = {
          name: supplier_name,
          custom_attributes: custom_attributes || {},
          products: []
        };
      }
      acc[supplier_name].products.push(productData);
      return acc;
    }, {});
    
    console.log(`Grouped into ${Object.keys(supplierGroups).length} unique suppliers`);

    const results = [];
    let processedCount = 0;
    const batchErrors = [];

    // Get custom attributes
    const { data: customAttributes, error: customAttrError } = await supabase
      .from('custom_attributes')
      .select('*')
      .eq('for_type', 'supplier');
      
    if (customAttrError) {
      console.error('Error fetching supplier custom attributes:', customAttrError);
      throw customAttrError;
    }

    // Prepare supplier records for upsert
    const supplierNames = Object.keys(supplierGroups);
    console.log(`Found ${supplierNames.length} unique suppliers to upsert`);
    
    const supplierUpsertData = supplierNames.map(name => {
      const supplierData = supplierGroups[name];
      const customAttrs = supplierData.custom_attributes || {};
      
      const supplierRecord = { 
        name,
        is_matched: false // Initialize all suppliers as unmatched
      };
      
      // Map custom attributes if any
      if (customAttrs) {
        if (customAttrs['EAN']) supplierRecord.custom_ean = customAttrs['EAN'];
        if (customAttrs['MPN']) supplierRecord.custom_mpn = customAttrs['MPN'];
        if (customAttrs['Brand']) supplierRecord.custom_brand = customAttrs['Brand'];
      }
      
      return supplierRecord;
    });
    
    // Upsert all suppliers in a single operation
    const { data: upsertedSuppliers, error: suppliersError } = await supabase
      .from('suppliers')
      .upsert(supplierUpsertData, { 
        onConflict: 'name',
        ignoreDuplicates: false 
      })
      .select('id,name');
      
    if (suppliersError) {
      console.error('Error upserting suppliers:', suppliersError);
      throw suppliersError;
    }
    
    if (!upsertedSuppliers) {
      console.error('Failed to upsert suppliers: no data returned');
      throw new Error('Failed to upsert suppliers');
    }
    
    console.log(`Successfully upserted ${upsertedSuppliers.length} suppliers`);
    console.log('First few suppliers:', upsertedSuppliers.slice(0, 3).map(s => ({ id: s.id, name: s.name })));

    // Create lookup for supplier IDs
    const supplierIdsByName = {};
    upsertedSuppliers.forEach(s => {
      supplierIdsByName[s.name] = s.id;
    });
    
    // Collect product identifiers for matching
    const eans = new Set();
    const mpns = new Set();
    const productNames = new Set();
    
    console.log('Collecting product identifiers for matching...');
    
    for (const supplierData of Object.values(supplierGroups)) {
      supplierData.products.forEach(p => {
        // Use custom match columns if provided, otherwise use standard fields
        const eanValue = matchColumns?.ean ? p[matchColumns.ean] : p.ean;
        const mpnValue = matchColumns?.mpn ? p[matchColumns.mpn] : p.mpn;
        const nameValue = matchColumns?.name ? p[matchColumns.name] : p.product_name;
        
        if (matchOptions.useEan && eanValue) {
          eans.add(eanValue);
          console.log(`Added EAN for matching: ${eanValue}`);
        }
        if (matchOptions.useMpn && mpnValue) {
          mpns.add(mpnValue);
          console.log(`Added MPN for matching: ${mpnValue}`);
        }
        if (matchOptions.useName && nameValue) {
          productNames.add(nameValue);
          console.log(`Added product name for matching: ${nameValue}`);
        }
      });
    }
    
    console.log(`Collected ${eans.size} unique EANs, ${mpns.size} unique MPNs, and ${productNames.size} unique product names for matching`);
    
    // Build filters for product queries
    let filters = [];
    
    if (matchOptions.useEan && eans.size > 0) {
      const eanChunks = chunkArray(Array.from(eans), 500);
      for (const chunk of eanChunks) {
        filters.push(`ean.in.(${chunk.map(ean => `"${ean}"`).join(',')})`);
      }
    }
    
    if (matchOptions.useMpn && mpns.size > 0) {
      const mpnChunks = chunkArray(Array.from(mpns), 500);
      for (const chunk of mpnChunks) {
        filters.push(`mpn.in.(${chunk.map(mpn => `"${mpn}"`).join(',')})`);
        filters.push(`custom_mpn.in.(${chunk.map(mpn => `"${mpn}"`).join(',')})`);
      }
    }
    
    if (matchOptions.useName && productNames.size > 0) {
      const nameChunks = chunkArray(Array.from(productNames), 500);
      for (const chunk of nameChunks) {
        filters.push(`title.ilike.any.(${chunk.map(name => `"%${name}%"`).join(',')})`);
      }
    }
    
    console.log(`Built ${filters.length} filter chunks for product queries`);
    
    // Debug the first filter if available
    if (filters.length > 0) {
      console.log('First filter chunk example:', filters[0]);
    }
    
    // Fetch products for matching
    let allProducts = [];
    
    // Check if we have any filters to apply
    if (filters.length === 0) {
      console.warn('No filters available for product matching. This will result in no matches.');
    } else {
      console.log('Fetching products for matching...');
      const productQueries = filters.map(f => 
        supabase
          .from('products')
          .select('id, ean, mpn, title, custom_mpn')
          .or(f)
      );
      
      console.log(`Executing ${productQueries.length} product queries...`);
      const productResults = await Promise.all(productQueries);
      
      for (const result of productResults) {
        if (result.error) {
          console.error('Error in product query:', result.error);
          throw result.error;
        }
        if (result.data) {
          console.log(`Query returned ${result.data.length} products`);
          const newProducts = result.data.filter(newProduct => 
            !allProducts.some(existingProduct => existingProduct.id === newProduct.id)
          );
          allProducts = [...allProducts, ...newProducts];
        }
      }
    }
    
    console.log(`Fetched a total of ${allProducts.length} products for matching`);
    
    // Debug: Show sample of products if available
    if (allProducts.length > 0) {
      console.log('First few products for matching:', allProducts.slice(0, 3).map(p => ({ 
        id: p.id, 
        ean: p.ean, 
        mpn: p.mpn, 
        title: p.title 
      })));
    }
    
    // Create product lookup maps
    const productsByEan = {};
    const productsByMpn = {};
    const productsByName = {};
    
    // Helper function to normalize MPNs for consistent matching
    const normalizeMpn = (mpn) => {
      if (!mpn) return '';
      // First convert to string, lowercase, and trim whitespace
      let normalized = mpn.toString().toLowerCase().trim();
      // Remove all non-alphanumeric characters
      normalized = normalized.replace(/[^a-z0-9]/g, '');
      return normalized;
    };
    
    // Advanced MPN matching - tries multiple normalization techniques
    const matchMpn = (supplierMpn, productMpns) => {
      if (!supplierMpn) return null;
      
      // Try multiple normalization techniques
      const supplierNormalized = normalizeMpn(supplierMpn);
      
      // 1. Direct lookup with our standard normalization
      if (productMpns[supplierNormalized]) {
        return {
          product: productMpns[supplierNormalized],
          method: 'exact',
          normalizedMpn: supplierNormalized
        };
      }
      
      // 2. Try removing leading zeros (common variation)
      const noLeadingZeros = supplierNormalized.replace(/^0+/, '');
      if (noLeadingZeros !== supplierNormalized && productMpns[noLeadingZeros]) {
        return {
          product: productMpns[noLeadingZeros],
          method: 'no-leading-zeros',
          normalizedMpn: noLeadingZeros
        };
      }
      
      // 3. Try partial matching (contained within or contains)
      for (const [key, product] of Object.entries(productMpns)) {
        // Skip very short MPNs for partial matching to avoid false positives
        if (supplierNormalized.length < 4 || key.length < 4) continue;
        
        if (key.includes(supplierNormalized) || supplierNormalized.includes(key)) {
          return {
            product,
            method: 'partial',
            normalizedMpn: key
          };
        }
      }
      
      // No match found
      return null;
    };
    
    console.log(`Building product lookup maps for ${allProducts.length} products...`);
    allProducts.forEach(product => {
      if (product.ean) {
        productsByEan[product.ean] = product;
      }
      
      // Use normalized MPNs for lookup
      if (product.mpn) {
        const normalizedMpn = normalizeMpn(product.mpn);
        if (normalizedMpn) {
          console.log(`Adding product to MPN lookup: "${product.mpn}" → "${normalizedMpn}"`);
          productsByMpn[normalizedMpn] = product;
        }
      }
      
      if (product.custom_mpn) {
        const normalizedCustomMpn = normalizeMpn(product.custom_mpn);
        if (normalizedCustomMpn) {
          console.log(`Adding product to MPN lookup: "${product.custom_mpn}" → "${normalizedCustomMpn}"`);
          productsByMpn[normalizedCustomMpn] = product;
        }
      }
      
      if (product.title) {
        productsByName[product.title.toLowerCase()] = product;
      }
    });
    
    console.log(`Created lookup maps: ${Object.keys(productsByEan).length} EANs, ${Object.keys(productsByMpn).length} MPNs, ${Object.keys(productsByName).length} titles`);
    
    // Debug: Log all the MPNs in our lookup
    console.log('MPN lookup keys (first 20):', Object.keys(productsByMpn).slice(0, 20));
    
    // Call diagnostic function AFTER allProducts is populated
    debugMpnMatching(supplierGroups, allProducts);
    
    // Match supplier products to existing products
    console.log(`Processing supplier products for ${Object.keys(supplierGroups).length} suppliers`);
    
    const allSupplierProducts = [];
    const unmatchedSupplierData = [];
    const suppliersWithMatches = new Set();
    
    // Generate placeholder EAN helper function
    const generatePlaceholderEan = (supplierId, productName, mpn) => {
      const idPart = supplierId.substring(0, 8);
      const namePart = productName ? productName.substring(0, 5).replace(/\W/g, '') : 'item';
      const mpnPart = mpn ? mpn.substring(0, 5).replace(/\W/g, '') : 'nompn';
      const timestamp = Date.now().toString().substring(6);
      return `SUP${idPart}${namePart}${mpnPart}${timestamp}`.substring(0, 30);
    };
    
    // Statistics for different match methods
    const matchMethodStats = {
      ean: 0,
      mpn: 0,
      name: 0,
      none: 0
    };
    
    // Process each supplier and their products
    for (const [supplierName, supplierData] of Object.entries(supplierGroups)) {
      const supplierId = supplierIdsByName[supplierName];
      
      if (!supplierId) {
        console.error(`No supplier ID found for supplier name: "${supplierName}"`);
        continue;
      }
      
      console.log(`Processing supplier: ${supplierName} (ID: ${supplierId}) with ${supplierData.products.length} products`);
      
      const matchedProducts = [];
      const matchedSupplierProductIndices = new Set();
      
      // Match by priority
      for (const method of matchOptions.priority) {
        // Skip methods that are disabled
        if (
          (method === 'ean' && !matchOptions.useEan) ||
          (method === 'mpn' && !matchOptions.useMpn) ||
          (method === 'name' && !matchOptions.useName)
        ) {
          console.log(`Skipping disabled match method: ${method}`);
          continue;
        }
        
        console.log(`Trying to match products using method: ${method}`);
        
        // Match supplier products to products
        supplierData.products.forEach((supplierProduct, index) => {
          if (matchedSupplierProductIndices.has(index)) {
            return; // Skip already matched products
          }
          
          let match = null;
          
          if (method === 'ean' && matchOptions.useEan) {
            // Use custom EAN column if provided
            const eanValue = matchColumns?.ean ? supplierProduct[matchColumns.ean] : supplierProduct.ean;
            if (eanValue) {
              match = productsByEan[eanValue];
              if (match) {
                console.log(`Matched by EAN: ${eanValue} -> Product ID: ${match.id}`);
              }
            }
          } else if (method === 'mpn' && matchOptions.useMpn) {
            // Use custom MPN column if provided
            const mpnValue = matchColumns?.mpn ? supplierProduct[matchColumns.mpn] : supplierProduct.mpn;
            if (mpnValue) {
              console.log(`Trying to match MPN: "${mpnValue}"`);
              
              // Use our advanced MPN matcher
              const matchResult = matchMpn(mpnValue, productsByMpn);
              
              if (matchResult) {
                match = matchResult.product;
                console.log(`✅ MATCHED by MPN: "${mpnValue}" → "${matchResult.normalizedMpn}" (${matchResult.method} match)`);
                console.log(`  Product ID: ${match.id}, Title: "${match.title}"`);
                console.log(`  Original product MPNs: mpn="${match.mpn}", custom_mpn="${match.custom_mpn}"`);
              } else {
                // No match found with any method
                console.log(`❌ No match found for MPN: "${mpnValue}"`);
              }
            }
          } else if (method === 'name' && matchOptions.useName) {
            // Use custom product name column if provided
            const nameValue = matchColumns?.name ? supplierProduct[matchColumns.name] : supplierProduct.product_name;
            if (nameValue) {
              // For name matching, try case-insensitive exact match first
              match = productsByName[nameValue.toLowerCase()];
              
              // If no exact match, try to find a product with a similar name
              if (!match && allProducts.length > 0) {
                const productName = nameValue.toLowerCase();
                const possibleMatches = allProducts.filter(p => 
                  p.title && p.title.toLowerCase().includes(productName)
                );
                
                if (possibleMatches.length > 0) {
                  match = possibleMatches[0];
                  console.log(`Matched by partial name: "${nameValue}" -> Product: "${match.title}" (ID: ${match.id})`);
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
            matchedSupplierProductIndices.add(index);
            suppliersWithMatches.add(supplierId);
            matchMethodStats[method]++;
            
            // Update product MPN if matched by MPN but custom_mpn is empty
            if (method === 'mpn' && supplierProduct.mpn && !match.custom_mpn) {
              void supabase
                .from('products')
                .update({ 
                  custom_mpn: supplierProduct.mpn,
                  mpn: supplierProduct.mpn,
                  updated_at: new Date().toISOString() 
                })
                .eq('id', match.id);
            }
          }
        });
      }
      
      console.log(`Matched ${matchedProducts.length} out of ${supplierData.products.length} products for supplier ${supplierName}`);
      
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
      
      console.log(`Created ${supplierProductsForThisSupplier.length} supplier-product records for supplier ${supplierName}`);
      allSupplierProducts.push(...supplierProductsForThisSupplier);
      
      // Handle unmatched supplier products
      const unmatchedProducts = [];
      supplierData.products.forEach((supplierProduct, index) => {
        if (!matchedSupplierProductIndices.has(index)) {
          matchMethodStats.none++;
          const ean = supplierProduct.ean && supplierProduct.ean.trim() !== '' 
            ? supplierProduct.ean 
            : generatePlaceholderEan(supplierId, supplierProduct.product_name, supplierProduct.mpn);
            
          unmatchedProducts.push({
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
      
      console.log(`Found ${unmatchedProducts.length} unmatched products for supplier ${supplierName}`);
      unmatchedSupplierData.push(...unmatchedProducts);
      
      // Report progress
      if (progressCallback) {
        progressCallback(processedCount, mappedData.length);
      }
    }
    
    // Update is_matched flag for suppliers with matches
    if (suppliersWithMatches.size > 0) {
      console.log(`Updating is_matched flag for ${suppliersWithMatches.size} suppliers`);
      const { error: matchUpdateError } = await supabase
        .from('suppliers')
        .update({ is_matched: true })
        .in('id', Array.from(suppliersWithMatches));
      
      if (matchUpdateError) {
        console.error('Error updating supplier match status:', matchUpdateError);
      }
    }
    
    // Process unmatched products by supplier ID
    const unmatchedBySupplierId = {};
    
    unmatchedSupplierData.forEach(item => {
      const supplierId = item.supplier_id;
      if (!unmatchedBySupplierId[supplierId]) {
        unmatchedBySupplierId[supplierId] = [];
      }
      unmatchedBySupplierId[supplierId].push(item);
    });
    
    console.log(`Processing ${unmatchedSupplierData.length} unmatched supplier products for ${Object.keys(unmatchedBySupplierId).length} suppliers`);
    
    // Insert unmatched products
    for (const [supplierId, supplierProducts] of Object.entries(unmatchedBySupplierId)) {
      for (let i = 0; i < supplierProducts.length; i += batchSize) {
        const batch = supplierProducts.slice(i, i + batchSize);
        
        if (batch.length > 0) {
          try {
            const validBatch = batch;
            
            if (validBatch.length === 0) {
              continue;
            }
            
            // Get EANs to check
            const eansToCheck = validBatch.map(item => item.ean);
            
            // Delete any previous unmatched entries
            if (eansToCheck.length > 0) {
              try {
                await supabase
                  .from('supplier_products')
                  .delete()
                  .eq('supplier_id', supplierId)
                  .is('product_id', null)
                  .in('ean', eansToCheck);
              } catch (deleteError) {
                console.error('Error deleting existing unmatched supplier products:', deleteError);
              }
            }
            
            // Insert new unmatched records
            console.log(`Inserting ${validBatch.length} unmatched supplier products for supplier ${supplierId}`);
            const { data: insertedUnmatched, error: unmatchedError } = await supabase
              .from('supplier_products')
              .insert(validBatch)
              .select();
              
            if (unmatchedError) {
              console.error('Error inserting unmatched supplier products batch:', unmatchedError);
              batchErrors.push(unmatchedError);
            } else if (insertedUnmatched) {
              console.log(`Successfully inserted ${insertedUnmatched.length} unmatched supplier products`);
              processedCount += insertedUnmatched.length;
            }
          } catch (err) {
            console.error('Exception processing unmatched supplier products batch:', err);
            batchErrors.push(err);
          }
        }
      }
    }
    
    // Process matched products in batches
    console.log(`Processing ${allSupplierProducts.length} matched supplier products in batches`);
    for (let i = 0; i < allSupplierProducts.length; i += batchSize) {
      const batch = allSupplierProducts.slice(i, i + batchSize);
            
      if (batch.length > 0) {
        try {
          const validBatch = batch.filter(item => 
            item.supplier_id && 
            item.product_id && 
            item.ean && 
            item.ean.trim() !== ''
          );
          
          if (validBatch.length === 0) {
            continue;
          }
          
          console.log(`Upserting ${validBatch.length} matched supplier products (batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allSupplierProducts.length/batchSize)})`);
          const { data: insertedData, error: relationError } = await supabase
            .from('supplier_products')
            .upsert(validBatch, {
              onConflict: 'supplier_id,product_id',
              ignoreDuplicates: false
            })
            .select();

          if (relationError) {
            console.error('Error upserting supplier products batch:', relationError);
            batchErrors.push(relationError);
          } else if (insertedData) {
            console.log(`Successfully upserted ${insertedData.length} supplier-product relationships`);
            results.push(...insertedData);
            processedCount += insertedData.length;
          }
        } catch (err) {
          console.error('Exception processing supplier products batch:', err);
          batchErrors.push(err);
        }
      }
    }
    
    // Handle errors
    if (batchErrors.length > 0 && processedCount > 0) {
      console.warn(`Completed import with ${batchErrors.length} batch errors, but processed ${processedCount} records successfully.`);
    } else if (batchErrors.length > 0) {
      throw batchErrors[0];
    }

    // Final results and statistics
    const totalMatched = allSupplierProducts.length;
    const totalUnmatched = unmatchedSupplierData.length;
    const totalProcessed = totalMatched + totalUnmatched;
    
    console.log('============ IMPORT SUMMARY ============');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Total matched: ${totalMatched}`);
    console.log(`Total unmatched: ${totalUnmatched}`);
    console.log(`Match by EAN: ${matchMethodStats.ean}`);
    console.log(`Match by MPN: ${matchMethodStats.mpn}`);
    console.log(`Match by Name: ${matchMethodStats.name}`);
    console.log(`Unmatched count: ${matchMethodStats.none}`);
    console.log('=======================================');
    
    // Enhance the final results to ensure match statistics are included
    const finalResults = {
      processedCount: totalProcessed,
      supplierCount: Object.keys(supplierGroups).length,
      totalRecords: totalProcessed,
      successfulImports: totalProcessed,
      failedImports: 0,
      suppliersAdded: Object.keys(supplierGroups).length,
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
    
    console.log('Returning final results to client:', finalResults);
    return finalResults;
  } catch (error) {
    console.error('Error importing supplier data:', error);
    throw error;
  }
}

// Helper function to chunk arrays for DB operations
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Import product data function
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