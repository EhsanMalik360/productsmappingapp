import React, { useState, useEffect } from 'react';
import { UploadCloud, Download, ArrowLeft, ArrowRight, Info } from 'lucide-react';
import Button from '../../components/UI/Button';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import SuccessModal from '../../components/UI/SuccessModal';
import { parseCSV, validateRequiredFields } from '../../utils/csvImport';
import { autoMapProductColumns, mapProductData, importProductData } from '../../utils/productImport';
import { useAppContext } from '../../context/AppContext';
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
console.log('AmazonImport component loaded');
console.log('API_URL configured as:', API_URL);
console.log('Environment variable value:', import.meta.env.VITE_API_URL);

const REQUIRED_FIELDS = ['Brand', 'Sale Price'];

const AmazonImport: React.FC = () => {
  const { customAttributes } = useAppContext();
  const { addImportRecord } = useImportHistory();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [csvData, setCSVData] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<{[key: string]: string}>({});
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [fileRef, setFileRef] = useState<File | null>(null); // Store the file reference for server upload
  const [importResults, setImportResults] = useState<{
    totalRecords: number;
    successfulImports: number;
    failedImports: number;
  }>({ totalRecords: 0, successfulImports: 0, failedImports: 0 });
  
  // Job tracking states
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("Processing data...");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [batchSize, setBatchSize] = useState<number>(500); // Increased default batch size
  const [pollInterval, setPollInterval] = useState<number | null>(null);
  
  // Add state to track long-running imports
  const [isLongRunningImport, setIsLongRunningImport] = useState<boolean>(false);
  const [timeoutModalVisible, setTimeoutModalVisible] = useState<boolean>(false);
  const [executionTime, setExecutionTime] = useState<number>(0);
  const [importStartTime, setImportStartTime] = useState<number | null>(null);
  
  // Get required product custom attributes
  const requiredCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'product' && attr.required)
    .map(attr => attr.name);
    
  // All product custom attributes for optional mapping
  const allCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'product')
    .map(attr => attr.name);
    
  // Combined required fields including custom attributes
  const allRequiredFields = [...REQUIRED_FIELDS, ...requiredCustomAttributes];

  // Reset form to initial state
  const resetForm = () => {
    setCurrentStep(1);
    setCSVData([]);
    setFieldMapping({});
    setError('');
    setFileName('');
    setJobId(null);
    setImportResults({
      totalRecords: 0,
      successfulImports: 0,
      failedImports: 0
    });
    
    // Reset the file input
    const fileInput = document.getElementById('amazonFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // Handle success modal close
  const handleSuccessModalClose = () => {
    console.log('Closing success modal and cleaning up resources...');
    setShowSuccess(false);
    
    // Clear polling interval if it exists
    if (pollInterval) {
      console.log(`Clearing poll interval ${pollInterval}`);
      window.clearInterval(pollInterval);
      setPollInterval(null);
    }
    
    // Make sure loading is fully cleared when success modal is closed
    setIsLoading(false);
    setLoadingProgress(0); 
    setLoadingMessage("Processing data...");
    
    // Clear job ID to stop useEffect from polling
    setJobId(null);
    
    // Reset the form
    resetForm();
  };

  // Check job status from the server
  const checkJobStatus = async (id: string): Promise<string> => {
    try {
      console.log(`Checking job status for ID: ${id} from ${API_URL}/api/upload/status/${id}`);
      
      // Add retry mechanism for status check
      let retries = 3;
      let response;
      
      while (retries > 0) {
        try {
          // Even longer timeout for status check
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('Status check timeout reached, aborting fetch');
            controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
          }, 60000); // 60 second timeout for large file processing
          
          // Simple fetch with minimal options
          response = await fetch(`${API_URL}/api/upload/status/${id}`, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache, no-store'
            }
          });
          
          // Clear timeout as soon as fetch completes
          clearTimeout(timeoutId);
          
          // If successful, break out of retry loop
          if (response.ok) {
            console.log(`Job status fetch successful: ${response.status}`);
            break;
          } else {
            console.warn(`Job status fetch returned ${response.status}, retries left: ${retries - 1}`);
            retries--;
            
            if (retries > 0) {
              // Wait before retry with longer backoff
              const backoffDelay = (4 - retries) * 3000;
              console.log(`Waiting ${backoffDelay}ms before retry...`);
              // Update loading message to inform user
              setLoadingMessage(`Server busy, retrying in ${Math.round(backoffDelay/1000)}s... (Import continues in background)`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
          }
        } catch (fetchError) {
          // Improved error logging to capture more details
          if (fetchError instanceof Error) {
            console.log(`Fetch error during status check: ${fetchError.name} - ${fetchError.message}`);
            console.log('Error details:', fetchError);
          } else {
            console.log(`Fetch error during status check: ${String(fetchError)}`);
          }
          
          // Special handling for abort errors (timeouts) and network errors
          const isAbortError = fetchError instanceof Error && 
                              (fetchError.name === 'AbortError' || 
                               fetchError.message.includes('abort') ||
                               fetchError.message.includes('time'));
          
          const isNetworkError = fetchError instanceof Error &&
                               (fetchError.message.includes('network') ||
                                fetchError.message.includes('connection') ||
                                fetchError.message.includes('offline'));
          
          retries--;
          
          if (retries > 0) {
            // Much longer wait for timeout errors
            const waitTime = isAbortError || isNetworkError ? 8000 : (4 - retries) * 3000;
            console.log(`Waiting ${waitTime}ms before retry ${3-retries}/3`);
            
            // Update loading message to keep user informed
            setLoadingMessage(`Server is busy. Retrying status check in ${Math.round(waitTime/1000)} seconds...`);
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            // On final retry failure, just continue
            console.log('Status check failed but continuing to assume processing is happening');
            setLoadingMessage('Job is processing in the background. Status updates may be delayed...');
            
            // Continue assuming processing is happening
            return 'processing';
          }
        }
      }
      
      // If all retries failed but we didn't throw an error in the catch block
      if (!response || !response.ok) {
        console.log('Status check failed after all retries, but continuing polling');
        
        // For 502 Bad Gateway specifically - common with render.com free tier
        if (response && response.status === 502) {
          setLoadingMessage('Import is progressing in the background. Server is busy (502 Bad Gateway). Updates will resume when server responds...');
        } else {
          setLoadingMessage('Import is progressing in the background. Updates delayed due to server load...');
        }
        
        // Continue assuming processing is happening
        return 'processing';
      }
      
      // Parse response safely
      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        return 'processing'; // Continue polling even if we can't parse the response
      }
      
      // Update UI with job progress - ensure progress never decreases
      const newProgress = data.progress || 0;
      setLoadingProgress(prev => Math.max(prev, newProgress));
      
      // For large imports that are slow, provide more detailed messaging
      if (data.status === 'processing') {
        if (newProgress < 20) {
          setLoadingMessage(`Processing files... (${newProgress}%). This may take several minutes for large files.`);
        } else if (newProgress < 60) {
          setLoadingMessage(`Processing data... (${newProgress}%). Please wait.`);
        } else {
          setLoadingMessage(data.message || `Processing file... (${newProgress}%)`);
        }
      } else {
        setLoadingMessage(data.message || 'Processing file...');
      }
      
      console.log(`Job status update: ${data.status}, progress: ${newProgress}%, message: ${data.message}`);
      
      // Handle completed job
      if (data.status === 'completed') {
        // Keep loading overlay visible but update its state
        setLoadingProgress(100);
        setLoadingMessage("Import completed successfully!");
        
        // Update import results immediately so they're ready when we show the success modal
        if (data.results) {
          console.log('Received final results:', data.results);
          
          // Ensure we have the correct row counts
          const totalRecords = data.results.totalRecords || 0;
          const successfulImports = data.results.successfulImports || 0;
          const failedImports = data.results.failedImports || totalRecords - successfulImports;
          
          setImportResults({
            totalRecords: totalRecords,
            successfulImports: successfulImports,
            failedImports: failedImports
          });
          
          // Record import in history
          addImportRecord({
            type: 'Amazon Data',
            file_name: fileName,
            status: 'Completed',
            total_records: totalRecords,
            successful_records: successfulImports,
            failed_records: failedImports,
            error_message: ''
          }).catch(err => console.error('Failed to record import history:', err));
        }
        
        // Delay before showing success modal so user can see 100% completion
        setTimeout(() => {
          // Important: Only clear loading status AFTER success modal is displayed
          setShowSuccess(true);
          
          // Small delay to ensure success modal is visible before hiding loader
          setTimeout(() => {
            setIsLoading(false);
            setJobId(null);
          }, 300);
        }, 1500); // 1.5 second delay to show 100% completion
        
        return 'completed';
      }
      
      // Handle in-progress with slow updates - still show progress
      if (data.status === 'processing' && newProgress < 5) {
        console.log('Processing large file - progress updates may be slow');
        // Show a message for large files
        if (loadingMessage === 'Processing file...') {
          setLoadingMessage('Processing large file - this may take several minutes...');
        }
      }
      
      // Handle failed job
      if (data.status === 'failed') {
        // Keep loading visible with error state for 2 seconds
        setLoadingProgress(100);
        setLoadingMessage(`Error: ${data.message || 'Import failed'}`);
        
        setTimeout(() => {
          setIsLoading(false);
          setJobId(null);
          setError(data.message || 'Import failed');
        }, 2000);
        
        return 'failed';
      }
      
      return data.status;
    } catch (error) {
      console.error('Error in job status check:', error);
      
      // For any unexpected errors, just assume processing is continuing
      // This prevents the UI from getting stuck
      setLoadingMessage('Job is processing in the background. Updates will resume when server responds...');
      
      // Return processing status to continue polling
      return 'processing';
    }
  };

  // Setup polling for job status updates
  useEffect(() => {
    let intervalId: number | null = null;
    let isComponentMounted = true;
    let consecutiveErrorCount = 0;
    let currentPollInterval = 2000; // Start with 2 seconds
    let timeoutIds: number[] = []; // Keep track of all timeouts
    let timeoutCounter = 0; // Count seconds for timeout detection
    let timeoutCheckInterval: number | null = null;
    
    // Start timer for timeout detection
    if (jobId && importStartTime === null) {
      setImportStartTime(Date.now());
      
      // Set timeout check to notify user if import is taking too long
      timeoutCheckInterval = window.setInterval(() => {
        if (!isComponentMounted || !jobId) return;
        
        timeoutCounter += 1;
        const elapsedTime = Math.floor((Date.now() - (importStartTime || Date.now())) / 1000);
        setExecutionTime(elapsedTime);
        
        // After 3 minutes with no progress update, show timeout warning
        if (timeoutCounter >= 180 && !isLongRunningImport && !timeoutModalVisible) {
          console.log("Import taking longer than expected, showing timeout warning");
          setIsLongRunningImport(true);
          setTimeoutModalVisible(true);
          
          // Update message to inform user
          setLoadingMessage(`Import has been running for ${Math.floor(elapsedTime / 60)} minutes. You can wait or cancel.`);
        }
        
        // Fail after 15 minutes if no update (configurable)
        if (timeoutCounter >= 900 && !timeoutModalVisible) { // 15 minutes
          console.error("Import timed out after 15 minutes");
          setLoadingMessage("Import operation timed out after 15 minutes.");
          
          // Cancel the operation
          setIsLoading(false);
          setJobId(null);
          setError("Import operation timed out after 15 minutes. Please try again with a smaller file or contact support.");
          
          // Clear all intervals
          if (timeoutCheckInterval) window.clearInterval(timeoutCheckInterval);
          if (pollInterval) window.clearInterval(pollInterval);
        }
      }, 1000); // Check every second
      
      timeoutIds.push(timeoutCheckInterval as unknown as number);
    }
    
    const clearAllTimeouts = () => {
      // Clear all pending timeouts to avoid memory leaks
      timeoutIds.forEach(id => window.clearTimeout(id));
      timeoutIds = [];
      
      // Clear timeout check interval
      if (timeoutCheckInterval) {
        window.clearInterval(timeoutCheckInterval);
      }
    };
    
    const scheduleNextPoll = (delay: number) => {
      if (!isComponentMounted || !jobId) return null;
      
      const newTimeoutId = window.setTimeout(async () => {
        if (!isComponentMounted || !jobId) return;
        
        console.log(`Polling job status for job: ${jobId} (interval: ${delay}ms)`);
        try {
          const status = await checkJobStatus(jobId);
          
          if (!isComponentMounted) return;
          
          console.log(`Job status poll returned: ${status}`);
          
          // If job is completed or failed, stop polling
          if (status === 'completed' || status === 'failed') {
            console.log(`Auto-stopping polling due to job completion`);
            consecutiveErrorCount = 0;
            return; // Don't schedule next poll
          }
          
          // Successful poll - decrease interval if it was increased due to errors
          if (consecutiveErrorCount > 0) {
            consecutiveErrorCount = 0;
            // Gradually return to normal polling interval
            currentPollInterval = Math.max(2000, currentPollInterval * 0.7);
            console.log(`Decreased polling interval to ${currentPollInterval}ms`);
          }
          
          // Schedule next poll
          const nextTimeoutId = scheduleNextPoll(currentPollInterval);
          if (nextTimeoutId) {
            timeoutIds.push(nextTimeoutId);
            intervalId = nextTimeoutId;
          }
        } catch (error) {
          console.error('Error during job status polling:', error);
          
          if (!isComponentMounted) return;
          
          // Increment error count and increase polling interval to avoid hammering the server
          consecutiveErrorCount++;
          
          // Exponentially increase polling interval based on consecutive errors
          // Don't let it grow beyond 30 seconds
          currentPollInterval = Math.min(30000, currentPollInterval * 1.5);
          console.log(`Increased polling interval to ${currentPollInterval}ms after error`);
          
          // For 502 errors specifically, show a user-friendly message
          if (error instanceof Error && error.message.includes('502')) {
            setLoadingMessage(`Server is experiencing high load (502 error). Your import continues in the background.`);
          } else if (consecutiveErrorCount > 3) {
            setLoadingMessage(`Network issues detected. Import continues in background. Retrying in ${Math.round(currentPollInterval/1000)}s...`);
          }
          
          // Continue polling despite errors, with increased interval
          const nextTimeoutId = scheduleNextPoll(currentPollInterval);
          if (nextTimeoutId) {
            timeoutIds.push(nextTimeoutId);
            intervalId = nextTimeoutId;
          }
        }
      }, delay);
      
      timeoutIds.push(newTimeoutId);
      return newTimeoutId;
    };
    
    // Start polling immediately when jobId is set
    if (jobId) {
      console.log(`Setting up polling for job status updates: JobID ${jobId}`);
      
      // Initial status check with short delay
      const initialTimeoutId = window.setTimeout(async () => {
        try {
          await checkJobStatus(jobId);
          
          // Start regular polling after initial check
          const timeoutId = scheduleNextPoll(currentPollInterval);
          if (timeoutId) intervalId = timeoutId;
          
        } catch (error) {
          console.error('Error during initial job status check:', error);
          
          // Even if initial check fails, start polling
          const timeoutId = scheduleNextPoll(currentPollInterval);
          if (timeoutId) intervalId = timeoutId;
        }
      }, 1000);
      
      timeoutIds.push(initialTimeoutId);
    }
    
    // Cleanup function to run on unmount or when jobId changes
    return () => {
      console.log('Cleaning up job status polling');
      isComponentMounted = false;
      clearAllTimeouts();
      
      if (intervalId) {
        window.clearTimeout(intervalId);
        console.log(`Cleared timeout ${intervalId}`);
      }
      
      // Reset timeout state
      setImportStartTime(null);
      setExecutionTime(0);
    };
  }, [jobId, setLoadingMessage, setLoadingProgress, setIsLoading, setShowSuccess, setError, addImportRecord, setImportResults, setJobId, fileName, importStartTime, isLongRunningImport, timeoutModalVisible]);

  // Server-side file processing
  const handleServerFileUpload = async (file: File) => {
    try {
      console.log('Starting server-side processing for file:', file.name);
      setIsLoading(true);
      // Start with 0% - the server will update to 5% immediately
      setLoadingProgress(0);
      setLoadingMessage("Preparing file upload...");
      
      // Reset timeout tracking
      setImportStartTime(Date.now());
      setExecutionTime(0);
      setIsLongRunningImport(false);
      
      // Check file size and warn user if it's very large
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 50) {
        console.warn(`Very large file detected: ${fileSizeMB.toFixed(2)}MB. This may take longer to process.`);
        setLoadingMessage(`Large file detected (${fileSizeMB.toFixed(2)}MB). Upload may take several minutes...`);
      }
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('batchSize', batchSize.toString());
      
      // If already mapped, include field mapping
      if (Object.keys(fieldMapping).length > 0) {
        formData.append('fieldMapping', JSON.stringify(fieldMapping));
        console.log('Including field mapping in upload:', fieldMapping);
      }
      
      // Enable the bulk import for better performance
      formData.append('useBulkImport', 'true');
      
      // Update progress to indicate upload is starting
      setLoadingProgress(3);
      setLoadingMessage("Starting file upload with optimized bulk import...");
      
      // Log API endpoint being used
      console.log(`Uploading to server endpoint: ${API_URL}/api/upload/product`);
      
      // Upload to server API - use product endpoint since there's no specific amazon endpoint
      try {
        // Add timeout to fetch to detect connection issues
        // Increase timeout for larger files
        const timeoutMs = Math.max(60000, Math.min(300000, file.size / 10000)); // Between 1-5 minutes based on file size
        console.log(`Setting upload timeout to ${(timeoutMs/1000).toFixed(0)} seconds based on file size`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log('Upload timeout reached, aborting fetch');
          controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
        }, timeoutMs);
        
        console.log('Starting fetch request to server...');
        const response = await fetch(`${API_URL}/api/upload/product`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('Server response status:', response.status);
        
        // Get response data as text first for debugging
        const responseText = await response.text();
        console.log('Raw server response:', responseText);
        
        // Parse JSON (if valid)
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse server response as JSON:', e);
          throw new Error(`Server returned invalid JSON response: ${responseText.substring(0, 100)}...`);
        }
        
        if (!response.ok) {
          console.error('Server returned error:', result);
          
          // Handle specific error cases with user-friendly messages
          if (response.status === 413) {
            throw new Error("File is too large. Please reduce the file size and try again.");
          } else if (response.status === 504 || response.status === 502) {
            throw new Error("Server timeout. The file is likely too large for the server to process. Try with a smaller file.");
          } else {
            throw new Error(result.error || `Upload failed with status ${response.status}: ${result.details || ''}`);
          }
        }
        
        // Set job ID for status polling
        if (result.jobId) {
          console.log('Job ID received from server:', result.jobId);
          setJobId(result.jobId);
          
          // For large files, provide more informative message
          if (fileSizeMB > 10) {
            setLoadingMessage(`Processing large file (${fileSizeMB.toFixed(2)}MB) on server. This may take several minutes...`);
          } else {
            setLoadingMessage('Processing file on server...');
          }
          
          // Initial status check after a short delay
          setTimeout(() => {
            checkJobStatus(result.jobId).catch(err => {
              console.log('Initial status check failed, will retry during polling:', err);
            });
          }, 1000);
        } else {
          throw new Error('No job ID returned from server');
        }
      } catch (fetchError: unknown) {
        // Handle AbortError (timeout) specifically
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('Network request timed out - server might be busy with large file');
          throw new Error('Upload timed out. Your file might be too large for the server to handle. Try reducing the file size or try again later.');
        }
        
        // Handle 502 Bad Gateway specifically
        if (fetchError instanceof Error && fetchError.message.includes('502')) {
          throw new Error('Server Gateway Error (502). The server might be overloaded. Please try again with a smaller file or try later.');
        }
        
        // Handle other fetch errors
        console.error('Fetch error details:', fetchError);
        if (fetchError instanceof Error && fetchError.message.includes('Failed to fetch')) {
          throw new Error('Could not connect to the server. Please check your network connection and ensure the server is running.');
        }
        
        throw fetchError;
      }
    } catch (err) {
      console.error('Error in handleServerFileUpload:', err);
      // Keep the loading state visible with error for a moment
      setLoadingProgress(100);
      
      // Provide a clear error message
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setLoadingMessage(`Error: ${errorMessage}`);
      
      // Show error message after a delay
      setTimeout(() => {
        setIsLoading(false);
        setError(errorMessage);
        
        // Clear job tracking data
        setJobId(null);
        setImportStartTime(null);
        setExecutionTime(0);
        setIsLongRunningImport(false);
      }, 2000);
    }
  };
  
  // Handle file upload - client side for mapping, server side for actual import
  const handleFileUpload = async (event: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement>) => {
    // If there's an active job, don't allow a new upload
    if (jobId || isLoading) {
      console.warn('Upload attempted while another import is in progress');
      setError('Please wait for the current import to complete before starting a new one.');
      return;
    }
    
    console.log('⭐⭐⭐ AMAZON IMPORT UPLOAD HANDLER TRIGGERED ⭐⭐⭐');
    
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
    
    // Reset previous error message when starting a new upload
    setError('');
    
    setFileName(file.name);
    setFileRef(file); // Store the file reference for later
    
    // Log file details
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log('File upload detected:', {
      fileName: file.name,
      fileSize: file.size,
      fileSizeMB: fileSizeMB + ' MB'
    });
    
    try {
      // First, test server connection to ensure it's available for later
      console.log('Testing server connection...');
      try {
        const testResponse = await fetch(`${API_URL}/api/health`, { 
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          // Add timeout to quickly detect connection issues
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        console.log('Health check response:', testResponse.status);
        
        if (!testResponse.ok) {
          throw new Error(`Server responded with error status: ${testResponse.status}`);
        }
        
        console.log('Server connection successful');
      } catch (connectionError) {
        console.error('Server connection test failed:', connectionError);
        throw new Error(`Cannot connect to server at ${API_URL}. Please ensure the server is running and API_URL (${API_URL}) is correct.`);
      }
      
      // Use client-side processing for initial CSV parsing and preview
      console.log('Parsing CSV file for mapping preview...');
      setIsLoading(true);
      setLoadingProgress(10);
      setLoadingMessage("Parsing CSV file...");
      
      const data = await parseCSV(file);
      if (!validateRequiredFields(data)) {
        setError('CSV file appears to be empty or invalid');
        setIsLoading(false);
        return;
      }

      setLoadingProgress(30);
      setLoadingMessage("Auto-mapping columns...");
      // Auto-map columns based on the headers
      const autoMappedFields = await autoMapProductColumns(Object.keys(data[0]));
      setFieldMapping(autoMappedFields);
      
      setLoadingProgress(100);
      setCSVData(data);
      setCurrentStep(2);
      setError('');
      setIsLoading(false);
      
      console.log('CSV parsed and ready for mapping. Server-side processing will be used for final import.');
    } catch (error) {
      console.error('Error processing file:', error);
      setError(error instanceof Error ? error.message : 'Cannot process the file');
      setIsLoading(false);
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
  
  const handleImport = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(5);
      setLoadingMessage("Validating field mappings...");
      setError('');

      // Check if all required fields are mapped
      const missingFields = [];
      for (const field of allRequiredFields) {
        if (!fieldMapping[field]) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        setError(`Please map the following required fields: ${missingFields.join(', ')}`);
        setIsLoading(false);
        return;
      }

      // Use the stored file reference to perform server-side processing
      console.log('Mapping complete, proceeding with server-side processing...');
      if (fileRef) {
        await handleServerFileUpload(fileRef);
      } else {
        setError('No file selected. Please upload a file first.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error during import process:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during import process';
      
      // Keep loading visible with error state
      setLoadingProgress(100);
      setLoadingMessage(`Error: ${errorMessage}`);
      
      // Record the failed import attempt
      if (fileName) {
        await addImportRecord({
          type: 'Amazon Data',
          file_name: fileName,
          status: 'Failed',
          total_records: csvData.length,
          successful_records: 0,
          failed_records: csvData.length,
          error_message: errorMessage
        });
      }
      
      // Delay before showing error message
      setTimeout(() => {
        setIsLoading(false);
        setError(errorMessage);
      }, 1500);
    } finally {
      // Don't set loading to false here - we'll do it after showing success/error modals
      // if (!jobId) {
      //   setIsLoading(false);
      //   setLoadingProgress(0);
      // }
    }
  };

  // Handle batch size change
  const handleBatchSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setBatchSize(value);
    }
  };

  // Add a function to handle import cancellation
  const handleCancelImport = async () => {
    // Close timeout modal
    setTimeoutModalVisible(false);
    
    // Try to notify server about cancellation so it can abort the job
    if (jobId) {
      try {
        console.log(`Sending cancel request to server for job ${jobId}`);
        setLoadingMessage("Cancelling import operation...");
        
        const response = await fetch(`${API_URL}/api/upload/cancel/${jobId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // Short timeout for cancel request
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          console.log('Server acknowledged cancellation request');
        } else {
          console.warn('Server returned error on cancellation request:', response.status);
        }
      } catch (err) {
        console.error('Error sending cancellation request to server:', err);
        // Continue with client-side cancellation even if server request fails
      }
    }
    
    // Clear all states
    setIsLoading(false);
    setJobId(null);
    setLoadingProgress(0);
    setLoadingMessage("Processing data...");
    setImportStartTime(null);
    setExecutionTime(0);
    setIsLongRunningImport(false);
    
    // Show error message
    setError("Import cancelled by user. The file might be too large or the server might be busy.");
  };

  // Add a function to continue waiting
  const handleContinueWaiting = () => {
    setTimeoutModalVisible(false);
    setLoadingMessage(`Import is continuing to process in the background (${Math.floor(executionTime / 60)}:${executionTime % 60} elapsed)...`);
  };

  return (
    <div>
      {isLoading && <LoadingOverlay message={loadingMessage} progress={loadingProgress} />}
      
      <SuccessModal
        isOpen={showSuccess}
        onClose={handleSuccessModalClose}
        title="Import Completed Successfully"
        message="Your product data has been imported into the system."
        details={[
          { label: 'Total Records', value: importResults.totalRecords },
          { label: 'Successfully Imported', value: importResults.successfulImports },
          { label: 'Failed', value: importResults.failedImports }
        ]}
      />
      
      {/* Timeout warning modal */}
      {timeoutModalVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-lg">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <svg className="w-8 h-8 text-yellow-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <h3 className="text-xl font-semibold">Import Taking Longer Than Expected</h3>
              </div>
              
              <p className="text-gray-600 mb-4">
                Your import has been running for {Math.floor(executionTime / 60)} minutes and {executionTime % 60} seconds. 
                This could be due to a large file size or high server load.
              </p>
              
              <div className="bg-yellow-50 p-3 rounded-md mb-4 text-sm text-yellow-800">
                <p className="font-medium">Options:</p>
                <ul className="list-disc pl-5 mt-1">
                  <li>Continue waiting - The import will keep processing</li>
                  <li>Cancel - Stop the import and try again later</li>
                </ul>
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button variant="secondary" onClick={handleCancelImport}>
                  Cancel Import
                </Button>
                <Button onClick={handleContinueWaiting}>
                  Continue Waiting
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="steps flex mb-6">
        <div className={`step flex-1 p-3 text-center mr-1 rounded ${currentStep === 1 ? 'step-active bg-blue-500 text-white' : 'bg-gray-200'}`}>
          1. Upload File
        </div>
        <div className={`step flex-1 p-3 text-center mr-1 rounded ${currentStep === 2 ? 'step-active bg-blue-500 text-white' : 'bg-gray-200'}`}>
          2. Map Fields
        </div>
        <div className={`step flex-1 p-3 text-center rounded ${currentStep === 3 ? 'step-active bg-blue-500 text-white' : 'bg-gray-200'}`}>
          3. Import Data
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {currentStep === 1 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Import Amazon Product Data</h3>
          <p className="mb-4">Upload a CSV file containing your Amazon product data.</p>
          
          <div 
            className="dropzone border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-500 transition-colors"
            onDrop={handleFileUpload}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('amazonFileInput')?.click()}
          >
            <input 
              type="file" 
              id="amazonFileInput"
              className="hidden"
              accept=".csv"
              onChange={handleFileUpload}
            />
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            <p>Drag and drop your CSV file here, or <span className="text-blue-500">browse</span></p>
            <p className="text-sm text-gray-500 mt-2">Supported format: .csv</p>
          </div>
          
          <div className="mt-4 flex justify-between">
            <div>
              <span className="text-sm text-gray-500">Required fields: </span>
              <span className="text-sm text-blue-600">{REQUIRED_FIELDS.join(', ')}</span>
            </div>
            <Button className="flex items-center">
              <Download size={16} className="mr-1" /> Download Template
            </Button>
          </div>
          
          {/* Performance settings for large files */}
          <div className="mt-6 border rounded-md p-4">
            <h4 className="font-medium mb-3">Performance Settings</h4>
            
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="useBulkImport"
                checked={true}
                readOnly
                className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="useBulkImport" className="text-sm font-medium">
                Use optimized bulk import (5-10x faster)
              </label>
              <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">New</span>
            </div>

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
                Adjust for better performance with bulk import. Higher values can increase throughput.
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Files are processed using PostgreSQL's COPY command for optimal performance and memory efficiency.
            </p>
          </div>
          
          <div className="mt-4 bg-blue-50 p-3 rounded-md border border-blue-100 flex items-start">
            <Info size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Data Validation Note:</p>
              <p>We only validate required fields during import. Non-required fields can be left empty or contain any value.</p>
            </div>
          </div>
        </div>
      )}
      
      {currentStep === 2 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Map CSV Fields to System Fields</h3>
          <p className="mb-4">Review and adjust the automatic field mapping if needed.</p>
          
          <table className="w-full mb-4">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">System Field</th>
                <th className="px-4 py-2 text-left">Your CSV Column</th>
                <th className="px-4 py-2 text-left">Sample Data</th>
              </tr>
            </thead>
            <tbody>
              {/* Required system fields */}
              {REQUIRED_FIELDS.map((field) => (
                <tr key={field} className="border-t">
                  <td className="px-4 py-2">
                    <span className="text-red-500">*</span> {field}
                  </td>
                  <td className="px-4 py-2">
                    <select 
                      className="w-full border p-2 rounded"
                      value={fieldMapping[field] || ''}
                      onChange={(e) => handleFieldMapping(field, e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {Object.keys(csvData[0] || {}).map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {csvData[0]?.[fieldMapping[field]] || '-'}
                  </td>
                </tr>
              ))}
              
              {/* Required custom attributes */}
              {requiredCustomAttributes.map((field) => (
                <tr key={field} className="border-t">
                  <td className="px-4 py-2">
                    <span className="text-red-500">*</span> {field} <span className="text-xs text-blue-500">(Custom)</span>
                  </td>
                  <td className="px-4 py-2">
                    <select 
                      className="w-full border p-2 rounded"
                      value={fieldMapping[field] || ''}
                      onChange={(e) => handleFieldMapping(field, e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {Object.keys(csvData[0] || {}).map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {csvData[0]?.[fieldMapping[field]] || '-'}
                  </td>
                </tr>
              ))}
              
              {/* Optional fields */}
              <tr className="border-t bg-gray-50">
                <td colSpan={3} className="px-4 py-2 font-medium">Optional Fields</td>
              </tr>
              
              {['Amazon Fee', 'Category', 'Rating', 'Review Count'].map((field) => (
                <tr key={field} className="border-t">
                  <td className="px-4 py-2">{field}</td>
                  <td className="px-4 py-2">
                    <select 
                      className="w-full border p-2 rounded"
                      value={fieldMapping[field] || ''}
                      onChange={(e) => handleFieldMapping(field, e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {Object.keys(csvData[0] || {}).map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {csvData[0]?.[fieldMapping[field]] || '-'}
                  </td>
                </tr>
              ))}
              
              {/* Optional custom attributes (excluding required ones) */}
              {allCustomAttributes
                .filter(attrName => !requiredCustomAttributes.includes(attrName))
                .map((field) => (
                <tr key={field} className="border-t">
                  <td className="px-4 py-2">
                    {field} <span className="text-xs text-blue-500">(Custom)</span>
                  </td>
                  <td className="px-4 py-2">
                    <select 
                      className="w-full border p-2 rounded"
                      value={fieldMapping[field] || ''}
                      onChange={(e) => handleFieldMapping(field, e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {Object.keys(csvData[0] || {}).map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {csvData[0]?.[fieldMapping[field]] || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="flex justify-between mt-6">
            <Button variant="secondary" className="flex items-center" onClick={() => setCurrentStep(1)}>
              <ArrowLeft size={16} className="mr-1" /> Back
            </Button>
            <Button 
              className="flex items-center" 
              onClick={() => setCurrentStep(3)}
              disabled={!allRequiredFields.every(field => fieldMapping[field])}
            >
              Continue <ArrowRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}
      
      {currentStep === 3 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Data Preview and Import</h3>
          <p className="mb-4">Review your data before importing into the system.</p>
          
          <div className="overflow-x-auto mb-6">
            <table className="w-full">
              <thead>
                <tr>
                  {allRequiredFields.map(field => (
                    <th key={field} className="px-4 py-2 text-left">{field}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 5).map((row, index) => (
                  <tr key={index} className="border-t">
                    {allRequiredFields.map(field => (
                      <td key={field} className="px-4 py-2">
                        {row[fieldMapping[field]]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="bg-blue-50 p-4 rounded mb-6">
            <h4 className="font-semibold mb-2 text-blue-800">Import Summary</h4>
            <ul className="text-sm">
              <li className="mb-1"><span className="font-medium">Total records:</span> {csvData.length}</li>
              <li className="mb-1"><span className="font-medium">Validation:</span> Only required fields will be validated</li>
            </ul>
          </div>
          
          <div className="flex justify-between mt-6">
            <Button variant="secondary" className="flex items-center" onClick={() => setCurrentStep(2)}>
              <ArrowLeft size={16} className="mr-1" /> Back to Mapping
            </Button>
            <Button 
              variant="primary" 
              className="flex items-center" 
              onClick={handleImport}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Import Data'} {!isLoading && <ArrowRight size={16} className="ml-1" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AmazonImport;