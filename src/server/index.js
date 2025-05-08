// Main server file for handling large file uploads
const express = require('express');
const cors = require('cors');
const uploadHandler = require('./uploadHandler');
const path = require('path');
const config = require('./config');
const fs = require('fs');
const multer = require('multer');
const logger = require('morgan');
const { createWriteStream } = require('fs');
const bodyParser = require('body-parser');
const cluster = require('cluster');
const os = require('os');

// Log available memory
const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
const freeMemGB = Math.round(os.freemem() / (1024 * 1024 * 1024));
console.log(`System memory: ${freeMemGB}GB free of ${totalMemGB}GB total`);

// Check for --max-old-space-size flag
const nodeArgs = process.execArgv.join(' ');
const hasMemoryFlag = nodeArgs.includes('--max-old-space-size');
if (!hasMemoryFlag) {
  console.warn('\n⚠️ WARNING: Running without --max-old-space-size flag may cause memory issues with large files');
  console.warn('For large files (100k+ rows), start the server with:');
  console.warn('node --max-old-space-size=4096 src/server/index.js\n');
}

// Create start script in project root
const startScriptPath = path.join(__dirname, '../../start-server.js');
if (!fs.existsSync(startScriptPath)) {
  console.log('Creating server start script with memory settings...');
  const scriptContent = `#!/usr/bin/env node

// Server startup script with memory settings
const { spawn } = require('child_process');
const path = require('path');

// Determine memory limit based on available system resources
const os = require('os');
const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
const recommendedMem = Math.max(4, Math.min(totalMemGB / 2, 8)); // Between 4GB and 8GB

console.log(\`Starting server with \${recommendedMem}GB memory limit\`);

// Start server with memory limit
const serverProcess = spawn('node', [
  \`--max-old-space-size=\${recommendedMem * 1024}\`, // Convert GB to MB
  path.join(__dirname, 'src/server/index.js')
], {
  stdio: 'inherit',
  shell: true
});

serverProcess.on('error', (err) => {
  console.error('Failed to start server:', err);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGINT');
});
`;
  
  fs.writeFileSync(startScriptPath, scriptContent);
  fs.chmodSync(startScriptPath, '755'); // Make executable
  console.log(`Created start script at ${startScriptPath}`);
}

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Initialize the upload directory
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads with larger limits
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: config.maxFileSize || 2 * 1024 * 1024 * 1024, // Use config or default to 2GB
    files: 1 // Only allow one file at a time
  }
});

// Create log directory if it doesn't exist
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create a write stream for logs
const logStream = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });

// Override console.log and console.error to write to file as well
const originalLog = console.log;
const originalError = console.error;

console.log = function() {
  const args = Array.from(arguments);
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${args.join(' ')}`;
  
  // Write to file
  logStream.write(logMessage + '\n');
  
  // Also log to console
  originalLog.apply(console, arguments);
};

console.error = function() {
  const args = Array.from(arguments);
  const timestamp = new Date().toISOString();
  const logMessage = `[ERROR ${timestamp}] ${args.join(' ')}`;
  
  // Write to file
  logStream.write(logMessage + '\n');
  
  // Also log to console
  originalError.apply(console, arguments);
};

// Log startup
console.log('=== SERVER STARTING ===');

// Create Express app
const app = express();
const PORT = config.serverPort;

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Cache-Control', 
    'Pragma', 
    'X-Requested-With'
  ],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400 // 24 hours
};

// Increase limits for JSON and URL-encoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

// Set higher timeout for long requests
app.use((req, res, next) => {
  // Set timeout to 10 minutes for large file operations
  req.setTimeout(600000); // 10 minutes
  res.setTimeout(600000); // 10 minutes
  next();
});

// Add a pre-handler to log ALL incoming requests
app.use((req, res, next) => {
  console.log(`\n📥 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
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
      console.log('Could not log response body');
    }
    
    // Call original send method
    return originalSend.apply(this, arguments);
  };
  
  next();
});

// CORS middleware
app.use(cors(corsOptions));

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Setup routes
const router = express.Router();

// Static files for the React app (in production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../dist')));
}

// Mount the uploadHandler routes first for priority
console.log('Mounting uploadHandler routes...');
app.use('/', uploadHandler);

// API routes exposed through router
// Add API health check endpoint
router.get('/api/health', (req, res) => {
  // Include memory usage stats
  const memoryUsage = process.memoryUsage();
  
  res.json({ 
    status: 'ok',
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)) + ' MB',
      rss: Math.round(memoryUsage.rss / (1024 * 1024)) + ' MB'
    },
    system: {
      freeMem: Math.round(os.freemem() / (1024 * 1024)) + ' MB',
      totalMem: Math.round(os.totalmem() / (1024 * 1024)) + ' MB',
      uptime: Math.round(os.uptime() / 60) + ' minutes'
    },
    configuration: {
      chunkSize: config.defaultChunkSize || 'default',
      batchSize: config.defaultBatchSize || 'default',
      maxFileSize: (config.maxFileSize / (1024 * 1024)) + ' MB' || 'default'
    }
  });
});

// Route to expose server configuration
router.get('/api/config', (req, res) => {
  // Filter out sensitive information
  const safeConfig = {
    serverPort: config.serverPort,
    uploadSettings: {
      maxFileSize: config.maxFileSize,
      tempFileCleanupInterval: config.tempFileCleanupInterval
    },
    largeFileSettings: {
      defaultChunkSize: config.defaultChunkSize,
      defaultBatchSize: config.defaultBatchSize,
      maxRows: config.maxRows
    },
    requiredFields: config.requiredFields
  };
  
  res.json(safeConfig);
});

// Add a route to expose all routes for documentation/debugging
router.get('/api/routes', (req, res) => {
  const routes = [];
  
  // Get all routes from the router stack
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // It's a route handler
      const path = middleware.route.path;
      const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());
      routes.push({ path, methods });
    } else if (middleware.name === 'router') {
      // It's a mounted router
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods).map(m => m.toUpperCase());
          routes.push({ path, methods });
        }
      });
    }
  });
  
  res.json({ routes });
});

// Mount our additional router
app.use('/', router);

// Add test upload page route
app.get('/test-upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-upload.html'));
});

// Catch-all handler for SPA (React) routes
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API URL: http://localhost:${PORT}`);
  
  // Log available routes
  console.log('\nAvailable routes:');
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // It's a route handler
      const path = middleware.route.path;
      const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());
      console.log(`- ${methods.join(', ')} ${path}`);
    } else if (middleware.name === 'router') {
      // It's a mounted router
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods).map(m => m.toUpperCase());
          console.log(`- ${methods.join(', ')} ${path}`);
        }
      });
    }
  });
  
  console.log('=== SERVER STARTED SUCCESSFULLY ===');
  
  // Create a cleanup task for temporary files
  setInterval(() => {
    console.log('Running temporary file cleanup...');
    
    fs.readdir(uploadDir, (err, files) => {
      if (err) {
        console.error('Error reading upload directory:', err);
        return;
      }
      
      const now = Date.now();
      let deletedCount = 0;
      
      files.forEach(file => {
        const filePath = path.join(uploadDir, file);
        
        fs.stat(filePath, (err, stats) => {
          if (err) {
            console.error(`Error getting stats for file ${file}:`, err);
            return;
          }
          
          // Delete files older than 24 hours
          const fileAge = now - stats.mtime.getTime();
          if (fileAge > 24 * 60 * 60 * 1000) {
            fs.unlink(filePath, err => {
              if (err) {
                console.error(`Error deleting old file ${file}:`, err);
              } else {
                deletedCount++;
                console.log(`Deleted old temporary file: ${file}`);
              }
            });
          }
        });
      });
      
      console.log(`Temporary file cleanup complete. Deleted ${deletedCount} files.`);
    });
  }, config.tempFileCleanupInterval || 3600000); // Default to every hour
});

module.exports = app; 