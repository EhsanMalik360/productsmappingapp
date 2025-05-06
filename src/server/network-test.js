// Network diagnostic script to troubleshoot connectivity issues
const fetch = require('node-fetch');
const https = require('https');
const http = require('http');
const config = require('./config');

// Show diagnostic info
console.log('======== NETWORK DIAGNOSTICS ========');
console.log('Test timestamp:', new Date().toISOString());
console.log('Node.js version:', process.version);
console.log('Current working directory:', process.cwd());
console.log('Environment variables:');
console.log('- SERVER_PORT:', process.env.SERVER_PORT || 'not set');
console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? 'set (hidden)' : 'not set');
console.log('- SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'set (hidden)' : 'not set');
console.log('===================================\n');

// Test local server connectivity
async function testLocalServer() {
  console.log('Testing local server connection...');
  const localUrl = `http://localhost:${config.serverPort || 3001}`;
  
  try {
    const response = await fetch(`${localUrl}/api/health`, {
      method: 'GET',
      timeout: 5000
    });
    
    console.log(`✅ Local server is reachable at ${localUrl}`);
    console.log('  Status:', response.status);
    
    const data = await response.json();
    console.log('  Response:', data);
    return true;
  } catch (error) {
    console.log(`❌ Cannot connect to local server at ${localUrl}`);
    console.log('  Error:', error.message);
    return false;
  }
}

// Test Supabase connectivity
async function testSupabaseConnection() {
  console.log('\nTesting Supabase connection...');
  const supabaseUrl = config.supabaseUrl;
  
  try {
    const response = await fetch(supabaseUrl, {
      method: 'GET',
      timeout: 5000,
      agent: function(_parsedURL) {
        if (_parsedURL.protocol === 'https:') {
          return new https.Agent({ 
            keepAlive: true,
            timeout: 5000,
            rejectUnauthorized: false
          });
        } else {
          return new http.Agent({ 
            keepAlive: true,
            timeout: 5000
          });
        }
      }
    });
    
    console.log(`✅ Supabase URL is reachable at ${supabaseUrl}`);
    console.log('  Status:', response.status);
    return true;
  } catch (error) {
    console.log(`❌ Cannot connect to Supabase at ${supabaseUrl}`);
    console.log('  Error:', error.message);
    return false;
  }
}

// Test internet connectivity
async function testInternetConnectivity() {
  console.log('\nTesting general internet connectivity...');
  
  try {
    const response = await fetch('https://www.google.com', {
      method: 'GET',
      timeout: 5000
    });
    
    console.log('✅ Internet connectivity is working (connected to google.com)');
    console.log('  Status:', response.status);
    return true;
  } catch (error) {
    console.log('❌ Cannot connect to the internet (google.com unreachable)');
    console.log('  Error:', error.message);
    return false;
  }
}

// Test file upload using FormData
async function testFileUpload() {
  console.log('\nTesting file upload capability...');
  const fs = require('fs');
  const FormData = require('form-data');
  const path = require('path');
  
  // Create a small test CSV file
  const testFilePath = path.join(__dirname, 'test-upload.csv');
  fs.writeFileSync(testFilePath, 'id,name,value\n1,test,123\n2,test2,456');
  
  const form = new FormData();
  form.append('file', fs.createReadStream(testFilePath));
  form.append('batchSize', '10');
  
  const localUrl = `http://localhost:${config.serverPort || 3001}`;
  
  try {
    console.log('Sending test file upload to server...');
    const response = await fetch(`${localUrl}/api/upload/test`, {
      method: 'POST',
      body: form,
      timeout: 10000
    });
    
    console.log('✅ File upload test completed');
    console.log('  Status:', response.status);
    
    const data = await response.json();
    console.log('  Response:', data);
    
    // Clean up
    fs.unlinkSync(testFilePath);
    return true;
  } catch (error) {
    console.log('❌ File upload test failed');
    console.log('  Error:', error.message);
    
    // Clean up
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    return false;
  }
}

// Run all the tests
async function runAllTests() {
  const results = {
    localServer: await testLocalServer(),
    internet: await testInternetConnectivity(),
    supabase: await testSupabaseConnection(),
    fileUpload: await testFileUpload()
  };
  
  console.log('\n======== TEST RESULTS SUMMARY ========');
  console.log('Local server:', results.localServer ? '✅ PASS' : '❌ FAIL');
  console.log('Internet connectivity:', results.internet ? '✅ PASS' : '❌ FAIL');
  console.log('Supabase connection:', results.supabase ? '✅ PASS' : '❌ FAIL');
  console.log('File upload:', results.fileUpload ? '✅ PASS' : '❌ FAIL');
  console.log('=====================================');
  
  if (!results.localServer) {
    console.log('\n🚨 The local API server appears to be unreachable.');
    console.log('Make sure it is running with "npm run server".');
  }
  
  if (!results.supabase && results.internet) {
    console.log('\n🚨 Internet is working but Supabase connection failed.');
    console.log('This could indicate:');
    console.log('1. Your Supabase URL is incorrect');
    console.log('2. Supabase service is down');
    console.log('3. Network/firewall is blocking the connection to Supabase');
  }
  
  if (!results.fileUpload && results.localServer) {
    console.log('\n🚨 Server is running but file upload failed.');
    console.log('This could indicate:');
    console.log('1. An issue with the multer configuration');
    console.log('2. Missing request headers');
    console.log('3. Server-side error in the upload handler');
  }
}

// Run all tests
runAllTests().catch(err => {
  console.error('Error running tests:', err);
}); 