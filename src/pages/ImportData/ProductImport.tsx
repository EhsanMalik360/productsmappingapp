import React, { useState, useEffect } from 'react';
import { UploadCloud, Download, ArrowLeft } from 'lucide-react';
import Button from '../../components/UI/Button';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import SuccessModal from '../../components/UI/SuccessModal';
import { parseCSV, validateRequiredFields } from '../../utils/csvImport';
import { autoMapProductColumns, mapProductData, importProductData } from '../../utils/productImport';
import { useImportHistory } from '../../hooks/useSupabase';

// Server API URL
const API_URL = (() => {
  const url = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  // Ensure URL has a protocol prefix
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `http://${url}`;
  }
  return url;
})();

// Debug the API URL at startup
console.log('ProductImport component loaded');
console.log('API_URL configured as:', API_URL);
console.log('Environment variable value:', import.meta.env.VITE_API_URL);

const REQUIRED_FIELDS = ['Title', 'EAN', 'Brand', 'Sale Price'];

const ProductImport: React.FC = () => {
  const { addImportRecord } = useImportHistory();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [csvData, setCSVData] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<{[key: string]: string}>({});
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [importResults, setImportResults] = useState<{
    totalRecords: number;
    successfulImports: number;
    failedImports: number;
  }>({
    totalRecords: 0,
    successfulImports: 0,
    failedImports: 0
  });

  // Job tracking states
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("Processing data...");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [batchSize, setBatchSize] = useState<number>(500); // Larger batch size for better performance
  const [pollInterval, setPollInterval] = useState<number | null>(null);

  // Setup polling for job status updates
  useEffect(() => {
    if (jobId) {
      // Start polling for job status
      const interval = window.setInterval(() => {
        checkJobStatus(jobId);
      }, 2000); // Check every 2 seconds
      
      setPollInterval(interval);
      
      // Clear interval on unmount
      return () => {
        if (interval) window.clearInterval(interval);
      };
    } else if (pollInterval) {
      // Clear interval if job completed or component unmounted
      window.clearInterval(pollInterval);
      setPollInterval(null);
    }
  }, [jobId]);

  // Check job status from the server
  const checkJobStatus = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/upload/status/${id}`);
      if (!response.ok) {
        throw new Error('Failed to get job status');
      }
      
      const data = await response.json();
      
      // Update UI with job progress
      setLoadingProgress(data.progress || 0);
      setLoadingMessage(data.message || 'Processing file...');
      
      // Handle completed job
      if (data.status === 'completed') {
        setIsLoading(false);
        setJobId(null);
        
        // Update import results from the server response
        if (data.results) {
          setImportResults({
            totalRecords: data.results.totalRecords || 0,
            successfulImports: data.results.successfulImports || 0,
            failedImports: data.results.failedImports || 0
          });
          
          // Show success modal
          setShowSuccess(true);
        }
      }
      
      // Handle failed job
      if (data.status === 'failed') {
        setIsLoading(false);
        setJobId(null);
        setError(data.message || 'Import failed');
      }
    } catch (error) {
      console.error('Error checking job status:', error);
    }
  };

  // Handle small file upload - client-side processing
  const handleSmallFileUpload = async (file: File) => {
    try {
      setIsLoading(true);
      setLoadingMessage("Parsing CSV file...");
      setLoadingProgress(10);
      
      const data = await parseCSV(file);
      if (!validateRequiredFields(data)) {
        setError('CSV file appears to be empty or invalid');
        return;
      }

      // Auto-map columns
      setLoadingMessage("Auto-mapping columns...");
      setLoadingProgress(50);
      const autoMappedFields = autoMapProductColumns(Object.keys(data[0]));
      setFieldMapping(autoMappedFields);
      
      setCSVData(data);
      setCurrentStep(2);
      setError('');
      setLoadingProgress(100);
    } catch (err) {
      setError('Error parsing CSV file');
      console.error(err);
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  // Large file handling - server-side processing
  const handleLargeFileUpload = async (file: File) => {
    try {
      console.log('Starting server-side processing for file:', file.name);
      setIsLoading(true);
      setLoadingProgress(5);
      setLoadingMessage("Uploading file to server...");
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('batchSize', batchSize.toString());
      
      // If already mapped, include field mapping
      if (Object.keys(fieldMapping).length > 0) {
        formData.append('fieldMapping', JSON.stringify(fieldMapping));
        console.log('Including field mapping in upload:', fieldMapping);
      }
      
      // Log API endpoint being used
      console.log(`Uploading to server endpoint: ${API_URL}/api/upload/product`);
      
      // Upload to server API
      try {
        // Add timeout to fetch to detect connection issues
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        console.log('Starting fetch request to server...');
        const response = await fetch(`${API_URL}/api/upload/product`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('Server response status:', response.status);
        
        if (!response.ok) {
          let errorMessage = 'Upload failed';
          try {
            const errorData = await response.json();
            console.error('Server error response:', errorData);
            errorMessage = errorData.error || errorMessage;
          } catch (parseError) {
            console.error('Error parsing error response:', parseError);
            errorMessage = `Server returned status ${response.status}`;
          }
          throw new Error(errorMessage);
        }
        
        const result = await response.json();
        console.log('Server processing result:', result);
        
        // Set job ID for status polling
        if (result.jobId) {
          console.log('Job ID received from server:', result.jobId);
          setJobId(result.jobId);
          setLoadingMessage('Processing file on server...');
        } else {
          throw new Error('No job ID returned from server');
        }
      } catch (fetchError: unknown) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('Network request timed out after 30 seconds - server might be down');
          throw new Error('Server connection timed out. Please check if the server is running.');
        }
        console.error('Fetch error details:', fetchError);
        throw fetchError;
      }
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof Error ? err.message : 'Error uploading file';
      setError(errorMessage);
      console.error('Server upload error:', err);
      
      // Show the error in a more prominent way
      alert(`Server upload failed: ${errorMessage}\nPlease check that the server is running at ${API_URL}`);
    }
  };

  // Handle file upload - always use server-side processing
  const handleFileUpload = async (event: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement>) => {
    console.log('⭐⭐⭐ UPLOAD HANDLER TRIGGERED ⭐⭐⭐');
    
    let file: File | null = null;
    
    if ('dataTransfer' in event) {
      event.preventDefault();
      file = event.dataTransfer.files[0];
    } else {
      file = event.target.files?.[0] || null;
    }
    
    if (!file) {
      setError('Please select a file');
      return;
    }
    
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }
    
    setFileName(file.name);
    
    // Log file details
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log('File upload detected:', {
      fileName: file.name,
      fileSize: file.size,
      fileSizeMB: fileSizeMB + ' MB'
    });
    
    console.log('Always using server-side processing regardless of file size');
    console.log(`Server API URL: ${API_URL}`);
    
    try {
      // Test the server connection before processing
      console.log('Testing server connection...');
      const testResponse = await fetch(`${API_URL}/api/health`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }).catch(error => {
        console.error('Server connection test failed:', error);
        throw new Error(`Cannot connect to server at ${API_URL}. Is it running?`);
      });
      
      console.log('Health check response:', testResponse.status);
      
      if (!testResponse.ok) {
        throw new Error(`Server responded with error status: ${testResponse.status}`);
      }
      
      console.log('Server connection successful - proceeding with server-side processing');
      await handleLargeFileUpload(file);
    } catch (error) {
      console.error('Server check failed:', error);
      setError(error instanceof Error ? error.message : 'Cannot connect to the server');
      return;
    }
  };
  
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };
  
  const handleFieldMapping = (systemField: string, csvField: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [systemField]: csvField
    }));
  };
  
  const handleMap = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(5);
      setLoadingMessage("Validating field mappings...");
      
      // Check if all required fields are mapped
      const missingFields = [];
      for (const field of REQUIRED_FIELDS) {
        if (!fieldMapping[field]) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        setError(`Please map the following required fields: ${missingFields.join(', ')}`);
        setIsLoading(false);
        return;
      }
      
      // Get the file and upload it with mapping information
      const fileInput = document.getElementById('productFileInput') as HTMLInputElement;
      if (fileInput?.files?.[0]) {
        await handleLargeFileUpload(fileInput.files[0]);
      } else {
        setError('No file selected. Please upload a file first.');
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error mapping and importing data');
      console.error(err);
      
      // Record the failed import attempt
      if (fileName) {
        await addImportRecord({
          type: 'Product Data',
          file_name: fileName,
          status: 'Failed',
          total_records: csvData.length,
          successful_records: 0,
          failed_records: csvData.length,
          error_message: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    } finally {
      if (!jobId) {
        // Only set loading to false if we're not waiting for a job
        setIsLoading(false);
        setLoadingProgress(0);
      }
    }
  };

  const handleBatchSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setBatchSize(value);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    setCurrentStep(1);
    setCSVData([]);
    setFieldMapping({});
    setFileName('');
  };

  return (
    <div className="max-w-5xl mx-auto">
      {isLoading && <LoadingOverlay message={loadingMessage} progress={loadingProgress} />}
      
      <SuccessModal
        isOpen={showSuccess}
        onClose={handleCloseSuccess}
        title="Import Completed Successfully"
        message={`${importResults.successfulImports} of ${importResults.totalRecords} products were imported successfully.`}
      />
      
      <h1 className="text-3xl font-bold mb-8">Import Amazon Products</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center mb-6">
          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center mr-2">
            1
          </div>
          <h2 className="text-xl font-semibold">Upload CSV File</h2>
        </div>
        
        {currentStep === 1 && (
          <div>
            <p className="text-gray-600 mb-4">
              Upload a CSV file containing your Amazon product data. The file should include 
              at minimum the product title, EAN, brand, and sale price.
            </p>
            
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded mb-4">
                {error}
              </div>
            )}
            
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition mb-4"
              onDragOver={handleDragOver}
              onDrop={handleFileUpload}
              onClick={() => document.getElementById('productFileInput')?.click()}
            >
              <UploadCloud size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="mb-2">Drag and drop your CSV file here</p>
              <p className="text-sm text-gray-500">or click to select a file</p>
              
              <input 
                type="file" 
                id="productFileInput" 
                accept=".csv" 
                className="hidden" 
                onChange={handleFileUpload} 
              />
            </div>
            
            <div className="flex justify-between">
              <p className="text-sm text-gray-500">
                Required fields: <span className="font-medium">{REQUIRED_FIELDS.join(', ')}</span>
              </p>
              <Button variant="secondary" className="flex items-center gap-2">
                <Download size={16} />
                <span>Download Template</span>
              </Button>
            </div>
            
            {/* Performance settings for large files */}
            <div className="mt-6 border rounded-md p-4">
              <h4 className="font-medium mb-3">Performance Settings</h4>
              <div className="flex items-center">
                <label htmlFor="batchSize" className="mr-2 text-sm">Batch Size:</label>
                <input 
                  type="number" 
                  id="batchSize"
                  className="w-24 border p-2 rounded"
                  min="10"
                  max="1000"
                  value={batchSize}
                  onChange={handleBatchSizeChange}
                />
                <span className="ml-2 text-sm text-gray-500">
                  Adjust for better performance when importing large files. Recommended: 100-500.
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Files larger than 10MB will be processed on the server with progress tracking.
              </p>
            </div>
          </div>
        )}
        
        {currentStep === 2 && (
          <div>
            <p className="text-gray-600 mb-4">
              Map the columns from your CSV file to our system fields. Required fields are marked with an asterisk (*).
            </p>
            
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded mb-4">
                {error}
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="min-w-full mb-4">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left">System Field</th>
                    <th className="px-4 py-2 text-left">CSV Column</th>
                    <th className="px-4 py-2 text-left">Sample Data</th>
                  </tr>
                </thead>
                <tbody>
                  {REQUIRED_FIELDS.map(field => (
                    <tr key={field} className="border-t">
                      <td className="px-4 py-2 font-medium">
                        <span className="text-red-500">*</span> {field}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full p-2 border rounded"
                          value={fieldMapping[field] || ''}
                          onChange={e => handleFieldMapping(field, e.target.value)}
                        >
                          <option value="">Select column</option>
                          {Object.keys(csvData[0] || {}).map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 font-mono text-sm">
                        {csvData[0]?.[fieldMapping[field]] || 'N/A'}
                      </td>
                    </tr>
                  ))}
                  
                  {/* Optional fields */}
                  <tr>
                    <td colSpan={3} className="px-4 py-2 bg-gray-50 font-medium">
                      Optional Fields
                    </td>
                  </tr>
                  
                  {['Units Sold', 'Amazon Fee', 'Buy Box Price', 'Category', 'Rating', 'Review Count'].map(field => (
                    <tr key={field} className="border-t">
                      <td className="px-4 py-2">
                        {field}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full p-2 border rounded"
                          value={fieldMapping[field] || ''}
                          onChange={e => handleFieldMapping(field, e.target.value)}
                        >
                          <option value="">Select column</option>
                          {Object.keys(csvData[0] || {}).map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 font-mono text-sm">
                        {csvData[0]?.[fieldMapping[field]] || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-between mt-6">
              <Button 
                variant="secondary" 
                className="flex items-center gap-2"
                onClick={() => setCurrentStep(1)}
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </Button>
              
              <Button onClick={handleMap}>
                Import Products
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductImport; 