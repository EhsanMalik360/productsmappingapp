// Simple diagnostic script to check server connection and configuration
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Server Diagnostics Tool');
console.log('=======================');

// 1. Check if server is running
console.log('\n1. Checking if server is running at http://localhost:3001...');
const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/health',
  method: 'GET',
  timeout: 3000
}, (res) => {
  console.log(`   ✅ Server responded with status code: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`   Response: ${data}`);
    runNextChecks();
  });
});

req.on('error', (e) => {
  if (e.code === 'ECONNREFUSED') {
    console.log(`   ❌ Server connection refused. Is the server running?`);
    console.log(`   Run 'npm run server' to start the server.`);
  } else {
    console.log(`   ❌ Error connecting to server: ${e.message}`);
  }
  runNextChecks();
});

req.on('timeout', () => {
  console.log('   ❌ Request timed out after 3 seconds');
  req.destroy();
  runNextChecks();
});

req.end();

function runNextChecks() {
  // 2. Check if uploads directory exists
  console.log('\n2. Checking if uploads directory exists...');
  const uploadsDir = path.join(__dirname, 'src/uploads');
  
  try {
    if (fs.existsSync(uploadsDir)) {
      console.log(`   ✅ Uploads directory exists at: ${uploadsDir}`);
      
      // Check if directory is writable
      try {
        const testFilePath = path.join(uploadsDir, 'test-write.tmp');
        fs.writeFileSync(testFilePath, 'test');
        fs.unlinkSync(testFilePath);
        console.log('   ✅ Uploads directory is writable');
      } catch (err) {
        console.log('   ❌ Uploads directory is not writable');
      }
    } else {
      console.log(`   ❌ Uploads directory does not exist at: ${uploadsDir}`);
      console.log('   Creating directory...');
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`   ✅ Created uploads directory at: ${uploadsDir}`);
      } catch (err) {
        console.log(`   ❌ Failed to create uploads directory: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`   ❌ Error checking uploads directory: ${err.message}`);
  }
  
  // 3. Check environment variables
  console.log('\n3. Checking environment variables...');
  console.log('   ℹ️ Note: .env files are not automatically loaded by this script');
  
  // Environment check summary
  console.log('\n📋 Summary:');
  console.log('1. Make sure server is running with "npm run server"');
  console.log('2. Verify uploads directory exists and is writable');
  console.log('3. Check environment variables are properly set in .env file');
  console.log('   SUPABASE_SERVICE_KEY=your_actual_service_key');
  console.log('\nTry uploading a file again after addressing any issues.');
} 