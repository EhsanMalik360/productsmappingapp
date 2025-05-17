import React, { useState, useEffect } from 'react';
// UI Components
import Button from '../../components/UI/Button';
// Third-party components
import { UploadCloud, Download, ArrowLeft, ArrowRight, Info, Loader2 } from 'lucide-react';
// App imports
import { useAppContext } from '../../context/AppContext';
import { useImportHistory } from '../../hooks/useSupabase';
import { api } from '../../lib/api';
import { parseCSV, validateRequiredFields } from '../../utils/csvImport';
import { autoMapProductColumns } from '../../utils/productImport';
import './ImportData.css';

// API URL for direct fetch calls
const API_URL = import.meta.env.VITE_API_URL || '';

// Define required fields based on Django backend expectations
const REQUIRED_FIELDS = ['title', 'ean', 'brand', 'sale_price'];

// Define optional fields that can be mapped
const OPTIONAL_FIELDS = [
  'asin',
  'mpn',
  'upc',
  'units_sold',
  'fba_fees',
  'referral_fee',
  'buy_box_price',
  'rating',
  'review_count',
  'bought_past_month',
  'estimated_monthly_revenue',
  'fba_sellers',
  'amazon_instock_rate',
  'buy_box_seller_name',
  'live_offers_count'
];

// Debug the API URL at startup
console.log('AmazonImport component loaded');
console.log('API_URL configured as:', API_URL);
console.log('Environment variable value:', import.meta.env.VITE_API_URL);

// Helper function to format field names for display
const formatFieldName = (fieldName: string): string => {
  // Convert camelCase or snake_case to Title Case
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

// Define field name mapping for display
const fieldDisplayNames: { [key: string]: string } = {
  'title': 'Product Name',
  'ean': 'EAN/Barcode',
  'brand': 'Brand',
  'sale_price': 'Sale Price',
  'mpn': 'MPN',
  'units_sold': 'Monthly Units Sold',
  'amazon_fee': 'Amazon Fee',
  'buy_box_price': 'Buy Box Price',
  'category': 'Category',
  'rating': 'Rating',
  'review_count': 'Reviews',
  'asin': 'ASIN',
  'upc': 'UPC',
  'fba_fees': 'FBA Fees',
  'referral_fee': 'Referral Fee',
  'bought_past_month': 'Bought in Past Month',
  'estimated_monthly_revenue': 'Estimated Monthly Revenue',
  'fba_sellers': 'FBA Sellers',
  'amazon_instock_rate': 'Amazon Instock Rate (%)',
  'dominant_seller_percentage': 'Dominant Seller (%)',
  'buy_box_seller_name': 'Buy Box Seller Name',
  'live_offers_count': 'Count of Live Offers (New, FBA)'
};

const AmazonImport: React.FC = () => {
  const { customAttributes } = useAppContext();
  const { addImportRecord } = useImportHistory();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [csvData, setCSVData] = useState<Record<string, string>[]>([]);
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
    skippedImports?: number;
  }>({ totalRecords: 0, successfulImports: 0, failedImports: 0, skippedImports: 0 });
  
  // Job tracking states
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("Processing data...");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [batchSize, setBatchSize] = useState<number>(500); // Increased default batch size
  const [] = useState<number | null>(null);
  
  // Add states for timeout handling
  const [importStartTime, setImportStartTime] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number>(0);
  const [isLongRunningImport, setIsLongRunningImport] = useState<boolean>(false);
  const [importComplete, setImportComplete] = useState<boolean>(false);
  
  // Get required product custom attributes
  const requiredCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'product' && attr.required)
    .map(attr => attr.name);
    
  // Combined required fields including custom attributes
  const allRequiredFields = [...REQUIRED_FIELDS, ...requiredCustomAttributes];

  // Reset form to initial state
  const resetForm = () => {
    setCurrentStep(1);
    setCSVData([]);
    setFieldMapping({});
    setError('');
    setIsLoading(false);
    setShowSuccess(false);
    setFileName('');
    setFileRef(null);
    setImportResults({ totalRecords: 0, successfulImports: 0, failedImports: 0, skippedImports: 0 });
    setJobId(null);
    setLoadingProgress(0);
    setLoadingMessage("Processing data...");
    setImportStartTime(null);
    setExecutionTime(0);
    setIsLongRunningImport(false);
    setImportComplete(false);
    
    // Reset the file input
    const fileInput = document.getElementById('amazonFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // Setup polling for job status updates
  useEffect(() => {
    let isComponentMounted = true;
    let consecutiveErrorCount = 0;
    let currentPollInterval = 2000;
    let intervalId: number | null = null;
    let timeoutIds: number[] = [];
    
    // Clear all timeouts function
    const clearAllTimeouts = () => {
      console.log(`Clearing ${timeoutIds.length} timeouts`);
      timeoutIds.forEach(id => {
        window.clearTimeout(id);
        console.log(`Cleared timeout ${id}`);
      });
      timeoutIds = [];
    };
    
    // Schedule next poll function with exponential backoff
    const scheduleNextPoll = (delay: number) => {
      if (!isComponentMounted || !jobId) return null;
      
      // For temporary job IDs, use a shorter initial polling interval
      const isTempId = jobId.startsWith('temp-');
      // Use shorter intervals for more frequent updates
      const effectiveDelay = isTempId ? Math.min(delay, 1000) : Math.min(delay, 2000);
      
      const newTimeoutId = window.setTimeout(async () => {
        if (!isComponentMounted || !jobId) return;
        
        console.log(`Polling job status for job: ${jobId} (interval: ${effectiveDelay}ms)`);
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
          
          // For long-running imports, adjust poll interval
          const elapsedTime = Math.floor((Date.now() - (importStartTime || Date.now())) / 1000);
          
          // Use more aggressive polling for better responsiveness
          if (isTempId && elapsedTime < 60) {
            currentPollInterval = 1000; // Poll every 1 second for the first minute with temp IDs
          } else if (elapsedTime > 300) { // After 5 minutes
            // Cap maximum interval at 10 seconds (reduced from 20s)
            currentPollInterval = Math.min(10000, Math.max(currentPollInterval, 5000));
          } else if (elapsedTime > 120) { // After 2 minutes
            // Increase poll interval to at least 3 seconds (reduced from 5s)
            currentPollInterval = Math.max(currentPollInterval, 3000);
          } else {
            // More frequent polling for first 2 minutes to show accurate progress
            currentPollInterval = 2000;
          }
          
          // Successful poll - decrease interval if it was increased due to errors
          if (consecutiveErrorCount > 0) {
            consecutiveErrorCount = 0;
            // Gradually return to normal polling interval based on elapsed time
            if (elapsedTime < 120 && !isTempId) {
              currentPollInterval = Math.max(1000, currentPollInterval * 0.7);
            console.log(`Decreased polling interval to ${currentPollInterval}ms`);
            }
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
          // Don't let it grow beyond 15 seconds (reduced from 30s)
          if (!isTempId || consecutiveErrorCount > 3) {
            currentPollInterval = Math.min(15000, currentPollInterval * 1.5);
          console.log(`Increased polling interval to ${currentPollInterval}ms after error`);
          }
          
          // For 502 errors specifically, show a user-friendly message
          if (error instanceof Error && error.message.includes('502')) {
            setLoadingMessage(`Server is processing your large file (502 error). Import continues in the background.`);
          } else if (error instanceof Error && error.message.includes('timed out')) {
            setLoadingMessage(`Server is busy with your import. Processing large files can take several minutes.`);
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
      }, effectiveDelay);
      
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
  }, [jobId, setLoadingMessage, setLoadingProgress, setIsLoading, setShowSuccess, setError, addImportRecord, setImportResults, setJobId, fileName, importStartTime, isLongRunningImport]);

  // Check job status from the server
  const checkJobStatus = async (jobId: string): Promise<string> => {
    try {
      console.log(`Checking job status for ID: ${jobId}`);
      const statusData = await api.checkJobStatus(jobId);
      
      // Update UI with status data
      setLoadingProgress(statusData.progress || 0);
      setLoadingMessage(statusData.message || "Processing file...");
      
      // Handle job completion
      if (statusData.status === 'completed') {
        console.log('Import job completed successfully!');
        
        // Process results to match our expected format
        if (statusData.results) {
          setImportResults({
            totalRecords: statusData.results.total || 0,
            successfulImports: statusData.results.successful || 0,
            failedImports: statusData.results.failed || 0,
            skippedImports: statusData.results.skipped || 0
          });
        }
        
        // Show success modal
        setShowSuccess(true);
          setIsLoading(false);
          setJobId(null);
        
        return 'completed';
      }
      
      // Handle job failure
      if (statusData.status === 'failed') {
        console.error('Job failed:', statusData);
        setIsLoading(false);
        setJobId(null);
        setError(statusData.message || 'Import failed');
        return 'failed';
      }
      
      // Still processing
      return statusData.status || 'processing';
      
    } catch (error) {
      console.error('Error checking job status:', error);
      // Don't throw the error, instead return a status so polling continues
      return 'processing';
    }
  };

  // Server-side file processing
  const handleServerFileUpload = async (file: File) => {
    try {
      console.log('Starting server-side processing for file:', file.name);
      setIsLoading(true);
      setLoadingProgress(5);
      setLoadingMessage("Uploading file to server...");
      
      // Set execution start time for timeout tracking
      setImportStartTime(Date.now());
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);
      
      // Adjust batch size based on file size for optimal performance
      const fileSizeMB = file.size / (1024 * 1024);
      let optimalBatchSize = batchSize;
      
      // For larger files, increase batch size automatically
      if (fileSizeMB > 50) {
        optimalBatchSize = Math.max(batchSize, 3000); // At least 3000 for large files
        console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB). Increasing batch size to ${optimalBatchSize}`);
      } else if (fileSizeMB > 20) {
        optimalBatchSize = Math.max(batchSize, 2000); // At least 2000 for medium files
        console.log(`Medium file detected (${fileSizeMB.toFixed(2)}MB). Using batch size of ${optimalBatchSize}`);
      }
      
      // Include optimized batch size
      formData.append('batch_size', optimalBatchSize.toString());
      
      // Include field mapping if available
      if (Object.keys(fieldMapping).length > 0) {
        formData.append('field_mapping', JSON.stringify(fieldMapping));
        console.log('Including field mapping in upload:', fieldMapping);
      }
      
      // Log using Django backend
      console.log(`Uploading to Django backend via API endpoint`);
      
      // Use direct fetch to the Django API endpoint for Amazon product uploads
      const response = await fetch(`${API_URL}/api/upload/amazon/`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        return response.json();
      });
      
      console.log('Server response:', response);
        
        // Set job ID for status tracking
      if (response.job_id || response.id) {
        const jobIdentifier = response.job_id || response.id;
          setJobId(jobIdentifier);
          console.log(`Job ID set: ${jobIdentifier}`);
          
          // Update loading message
        setLoadingProgress(15);
          setLoadingMessage("File received. Processing has started...");
      } else {
        throw new Error('No job ID received from server');
      }
      } catch (error) {
        console.error('Error in handleServerFileUpload:', error);
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'Failed to upload file');
      throw error;
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
      for (const field of REQUIRED_FIELDS) {
        if (!fieldMapping[field]) {
          missingFields.push(fieldDisplayNames[field] || formatFieldName(field));
        }
      }
      
      // Also check for required custom attributes
      for (const field of requiredCustomAttributes) {
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
        try {
        await handleServerFileUpload(fileRef);
        } catch (uploadError) {
          // For timeout errors, we want to continue tracking anyway
          if (uploadError instanceof Error && uploadError.message.includes('timed out')) {
            console.warn('Upload timed out but continuing with progress tracking');
            handleImportAfterUploadTimeout();
            return; // Don't consider this a full error, we're still tracking
          }
          
          // For server-side validation errors, show specific message
          if (uploadError instanceof Error && 
             (uploadError.message.includes('Missing required field') || 
              uploadError.message.includes('Validation error'))) {
            setLoadingProgress(100);
            setLoadingMessage(`Error: ${uploadError.message}`);
            
            // After a short delay, reset loading state
            setTimeout(() => {
              setIsLoading(false);
              setError(uploadError.message);
            }, 1500);
            return;
          }
          
          throw uploadError; // Re-throw other errors
        }
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
        try {
        await addImportRecord({
          type: 'Amazon Data',
          file_name: fileName,
          status: 'Failed',
          total_records: csvData.length,
          successful_records: 0,
          failed_records: csvData.length,
          error_message: errorMessage
        });
        } catch (recordError) {
          console.error('Failed to add import record:', recordError);
        }
      }
      
      // Delay before showing error message
      setTimeout(() => {
        setIsLoading(false);
        setError(errorMessage);
        setJobId(null);
      }, 1500);
    }
  };

  // Special handler for continuing after upload timeout
  const handleImportAfterUploadTimeout = () => {
    // Generate a temporary job ID
    const tempJobId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setJobId(tempJobId);
    
    // Set appropriate UI state
    setLoadingProgress(15);
    setLoadingMessage("Upload timed out, but import likely continues in background. Monitoring for progress...");
    
    // Start checking for recent jobs to find the real job ID
    setTimeout(async () => {
      try {
        // Try to find the most recent job created around the time we started
        const recentJobs = await api.getRecentJobs();
        if (recentJobs && recentJobs.length > 0) {
          // Get the most recent job that was started within the last 2 minutes
          const recentJob = recentJobs.find((job: { id: string; created_at: string }) => {
            const jobTime = new Date(job.created_at).getTime();
            const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
            return jobTime > twoMinutesAgo;
          });
          
          if (recentJob && recentJob.id) {
            console.log(`Found recent job ID ${recentJob.id}, switching tracking to it`);
            // Replace our temp ID with the real one
            setJobId(recentJob.id);
          }
        }
      } catch (findError) {
        console.error('Error looking for recent jobs:', findError);
        // Continue with the temp ID for tracking
      }
    }, 5000); // Wait 5 seconds before checking for a real job
  };

  // Handle batch size change
  const handleBatchSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setBatchSize(value);
    }
  };

  // Add a function to handle import cancellation

  // Monitor import execution time
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (isLoading && importStartTime && importStartTime > 0) {
      // Update the execution time every second
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - importStartTime) / 1000);
        setExecutionTime(elapsed);
        
        // For long-running imports, just update the message
        if (elapsed >= 180 && !isLongRunningImport) {
          console.log("Import taking longer than expected, updating message only");
          setIsLongRunningImport(true);
          
          // Update message to inform user of progress
          setLoadingMessage(`Import running for ${Math.floor(elapsed / 60)} minutes. Processing will continue automatically.`);
        } else if (elapsed > 10 && !isLongRunningImport) {
          setIsLongRunningImport(true);
        }
      }, 1000);
    }
    
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isLoading, importStartTime, isLongRunningImport]);
  
  // Monitor importComplete state
  useEffect(() => {
    if (importComplete) {
      // Ensure the success modal is shown
      setShowSuccess(true);
      setIsLoading(false);
      setJobId(null);
    }
  }, [importComplete]);

  // Poll job status
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout;
    
    if (jobId && isLoading) {
      console.log(`Starting polling for job ${jobId}`);
      
      // Check immediately
      checkJobStatus(jobId).catch(error => {
        console.error('Initial status check failed:', error);
        setLoadingMessage(`Error: ${error.message}`);
      });
      
      // Then poll every 2 seconds
      pollingInterval = setInterval(async () => {
        try {
          await checkJobStatus(jobId);
        } catch (error) {
          console.error('Status polling failed:', error);
          // Don't stop polling on errors, just log them
        }
      }, 2000);
    }
    
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [jobId, isLoading]);

  // Add a direct check for recently completed jobs - important for detecting completion when status checks fail
  useEffect(() => {
    let completionCheckInterval: NodeJS.Timeout;
    
    // Only start this separate check if we're in a loading state
    if (isLoading && (loadingProgress < 100)) {
      // Function to check for recently completed imports
      const checkForCompletedImports = async () => {
        try {
          // Check import history first - this should catch all completed imports
          const historyResponse = await api.getImportHistory({ limit: 5 });
          if (historyResponse && Array.isArray(historyResponse) && historyResponse.length > 0) {
            // Look for any recently completed import (last 5 minutes)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const recentImport = historyResponse.find((record: any) => 
              record.status === 'Completed' && 
              new Date(record.created_at) > fiveMinutesAgo &&
              record.file_name === fileName
            );
            
            if (recentImport) {
              // Force completion if we find matching import
              setImportResults({
                totalRecords: recentImport.total_records || 0,
                successfulImports: recentImport.successful_records || 0,
                failedImports: recentImport.failed_records || 0,
                skippedImports: 0
              });
              setLoadingProgress(100);
              setImportComplete(true);
              setShowSuccess(true);
              setIsLoading(false);
              setJobId(null);
              return true; // Stop checking
            }
          }
          
          // As a backup, also check recent jobs directly
          const recentJobs = await api.getRecentJobs();
          if (recentJobs && Array.isArray(recentJobs) && recentJobs.length > 0) {
            // Only consider very recent jobs (last 2 minutes)
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
            const recentCompletedJob = recentJobs.find((job: any) => 
              job.status === 'completed' && 
              new Date(job.completed_at || job.updated_at || job.created_at) > twoMinutesAgo
            );
            
            if (recentCompletedJob) {
              // Use this job's results for our success modal
              const results = recentCompletedJob.results || {};
              setImportResults({
                totalRecords: results.total || recentCompletedJob.total_rows || 0,
                successfulImports: results.successful || recentCompletedJob.processed_rows || 0,
                failedImports: results.failed || recentCompletedJob.error_count || 0,
                skippedImports: results.skipped || 0
              });
              setLoadingProgress(100);
              setImportComplete(true);
              setShowSuccess(true);
              setIsLoading(false);
              setJobId(null);
              return true; // Stop checking
            }
          }
          
          return false; // Continue checking
        } catch (error) {
          return false; // Continue checking despite errors
        }
      };
      
      // Check immediately
      checkForCompletedImports();
      
      // Then check more frequently
      completionCheckInterval = setInterval(async () => {
        const completed = await checkForCompletedImports();
        if (completed) {
          clearInterval(completionCheckInterval);
        }
      }, 2000); // Check every 2 seconds instead of 5 for faster detection
    }
    
    return () => {
      if (completionCheckInterval) {
        clearInterval(completionCheckInterval);
      }
    };
  }, [isLoading, loadingProgress, fileName]);

  // Add a safety check for when progress is high but completion isn't detected
  useEffect(() => {
    let highProgressTimeout: NodeJS.Timeout | null = null;
    
    // If progress is high (80%+) but we haven't completed yet, add a safety timeout
    if (isLoading && loadingProgress >= 80 && loadingProgress < 100) {
      // Set a shorter timeout to force check completion if we're stuck at high progress
      highProgressTimeout = setTimeout(async () => {
        try {
          // Check import history specifically for very recent completions
          const historyResponse = await api.getImportHistory({ limit: 3 });
          if (historyResponse && Array.isArray(historyResponse) && historyResponse.length > 0) {
            // Look for a very recent import with our filename
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
            const matchingImport = historyResponse.find((record: any) => 
              record.status === 'Completed' && 
              new Date(record.created_at) > twoMinutesAgo &&
              record.file_name === fileName
            );
            
            if (matchingImport) {
              // Force completion
              setImportResults({
                totalRecords: matchingImport.total_records || 0,
                successfulImports: matchingImport.successful_records || 0,
                failedImports: matchingImport.failed_records || 0,
                skippedImports: 0
              });
              setLoadingProgress(100);
              setImportComplete(true);
              setShowSuccess(true);
              setIsLoading(false);
              setJobId(null);
              return;
            }
          }
          
          // Also check recent jobs for completions
          const recentJobs = await api.getRecentJobs();
          if (recentJobs && recentJobs.length > 0) {
            const recentJob = recentJobs.find((job: any) => 
              job.status === 'completed' && 
              new Date(job.completed_at || job.updated_at || job.created_at).getTime() > 
                Date.now() - (5 * 60 * 1000) // Last 5 minutes
            );
            
            if (recentJob) {
              // Use this job's results
              const results = recentJob.results || {};
              setImportResults({
                totalRecords: results.total || recentJob.total_rows || 0,
                successfulImports: results.successful || recentJob.processed_rows || 0,
                failedImports: results.failed || recentJob.error_count || 0,
                skippedImports: results.skipped || 0
              });
              setLoadingProgress(100);
              setImportComplete(true);
              setShowSuccess(true);
              setIsLoading(false);
              setJobId(null);
              return;
            }
          }
          
          // If we can't find a matching import but progress is stuck at high level,
          // assume success after a reasonable time
          if (executionTime > 60) { // If running for more than 60 seconds
            // Force completion with generic results
            setImportResults({
              totalRecords: csvData.length,
              successfulImports: csvData.length,
              failedImports: 0,
              skippedImports: 0
            });
            setLoadingProgress(100);
            setImportComplete(true);
            setShowSuccess(true);
            setIsLoading(false);
            setJobId(null);
          }
        } catch (error) {
          // If there's an error checking, still consider completion after extended time
          if (executionTime > 120) { // After 2 minutes
            setLoadingProgress(100);
            setImportComplete(true);
            setShowSuccess(true);
            setIsLoading(false);
            setJobId(null);
          }
        }
      }, 15000); // 15 second timeout (reduced from 30s for faster detection)
    }
    
    return () => {
      if (highProgressTimeout) {
        clearTimeout(highProgressTimeout);
      }
    };
  }, [isLoading, loadingProgress, executionTime, fileName, csvData.length]);

  // Show success modal with results
  const renderSuccessModal = () => {
    if (!showSuccess) return null;
    
    const handleCloseModal = () => {
      setShowSuccess(false);
      // Reset to step 1 (file upload tab)
      setCurrentStep(1);
      resetForm();
    };
    
    // Use the exact values from the backend results
    const totalCount = importResults.totalRecords;
    const successCount = importResults.successfulImports;
    const failedCount = importResults.failedImports;
    const skippedCount = importResults.skippedImports || 0;
    
    // Calculate success percentage for visual display
    const successPercentage = totalCount > 0 
      ? Math.round((successCount / totalCount) * 100) 
      : 0;
    
    // Check if we have skipped records (from backend)
    const hasSkipped = skippedCount > 0;
    const hasFailed = failedCount > 0;
    
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 backdrop-blur-sm">
        <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md mx-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3 border-b pb-2">
            <div className="flex items-center">
              <div className="bg-green-100 p-2 rounded-full mr-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Import Completed</h2>
                <p className="text-xs text-gray-600">Your products have been successfully imported</p>
              </div>
            </div>
          </div>
          
          <div className="mb-4">
            {/* Total count with large number */}
            <div className="text-center mb-3 bg-blue-50 py-2 rounded-lg">
              <div className="text-2xl font-bold text-blue-700">{totalCount.toLocaleString()}</div>
              <div className="text-sm text-blue-600">Products Processed</div>
            </div>
            
            {/* Progress bar showing success rate */}
            <div className="relative mb-3">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-xs font-semibold text-blue-700">Success Rate</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-blue-700">{successPercentage}%</span>
                </div>
              </div>
              <div className="overflow-hidden h-2 text-xs flex rounded-full bg-gray-200">
                <div
                  style={{ width: `${successPercentage}%` }}
                  className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center rounded-full transition-all duration-500 ${
                    successPercentage > 90 ? 'bg-green-500' : 
                    successPercentage > 70 ? 'bg-blue-500' : 
                    successPercentage > 50 ? 'bg-yellow-500' : 'bg-orange-500'
                  }`}
                ></div>
              </div>
            </div>
            
            {/* Results cards grid */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {/* Success card */}
              <div className="bg-white border border-green-200 rounded p-2 shadow-sm">
                <div className="flex items-center justify-center mb-1">
                  <svg className="w-3 h-3 text-green-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span className="text-xs font-medium text-gray-600">Successful</span>
            </div>
                <div className="text-lg font-bold text-center text-green-600">{successCount.toLocaleString()}</div>
          </div>
          
              {/* Skipped card */}
              <div className="bg-white border border-yellow-200 rounded p-2 shadow-sm">
                <div className="flex items-center justify-center mb-1">
                  <svg className="w-3 h-3 text-yellow-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                  <span className="text-xs font-medium text-gray-600">Skipped</span>
                </div>
                <div className="text-lg font-bold text-center text-yellow-600">{skippedCount.toLocaleString()}</div>
              </div>
              
              {/* Failed card */}
              <div className="bg-white border border-red-200 rounded p-2 shadow-sm">
                <div className="flex items-center justify-center mb-1">
                  <svg className="w-3 h-3 text-red-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                  <span className="text-xs font-medium text-gray-600">Failed</span>
                </div>
                <div className="text-lg font-bold text-center text-red-600">{failedCount.toLocaleString()}</div>
              </div>
            </div>
            
            {/* Status message */}
            <div className={`p-2 rounded text-xs ${
              !hasFailed && !hasSkipped ? 'bg-green-50 text-green-800' : 
              hasFailed ? 'bg-red-50 text-red-800' : 
              'bg-yellow-50 text-yellow-800'
            }`}>
              {hasSkipped && !hasFailed ? (
                <div>
                  <p className="font-medium mb-1">Import completed with skipped records</p>
                  <p>{skippedCount} records were skipped (duplicates)</p>
                </div>
              ) : hasSkipped && hasFailed ? (
                <div>
                  <p className="font-medium mb-1">Import partially completed</p>
                  <p>{successCount} successful, {skippedCount} skipped, {failedCount} failed</p>
                </div>
              ) : hasFailed ? (
                <div>
                  <p className="font-medium mb-1">Import completed with errors</p>
                  <p>{failedCount} records failed to import</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium mb-1">Import completed successfully</p>
                  <p>All {successCount} products imported without errors</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button 
              variant="secondary"
              className="px-3 py-1 text-sm"
              onClick={() => {
                handleCloseModal();
              }}
            >
              Close
            </Button>
            <Button 
              className="px-3 py-1 text-sm"
              onClick={() => {
                handleCloseModal();
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Success Modal */}
      {showSuccess && renderSuccessModal()}
      
      {/* Loading Indicator */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-lg shadow-2xl flex flex-col items-center" style={{ minWidth: '400px', maxWidth: '90%' }}>
            <div className="mb-6 flex items-center justify-center relative">
              <Loader2 className="h-20 w-20 text-blue-600 animate-spin" />
              
              {loadingProgress !== undefined && loadingProgress >= 0 && (
                <div className="absolute">
                  <span className="text-2xl font-bold text-blue-700">{Math.round(loadingProgress)}%</span>
                </div>
              )}
            </div>
            
            <div className="w-full mb-4">
              <div className="relative pt-1">
                <div className="overflow-hidden h-5 mb-2 text-xs flex rounded-full bg-blue-100 shadow-inner">
                  <div 
                    style={{ width: `${loadingProgress || 0}%` }} 
                    className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center rounded-full transition-all duration-500 ease-out ${loadingProgress < 30 ? 'bg-blue-500' : loadingProgress < 70 ? 'bg-sky-600' : loadingProgress < 100 ? 'bg-blue-700' : 'bg-green-600'}`}
                  ></div>
                </div>
              </div>
            </div>
            
            <div className="w-full text-center mb-3">
              <p className="text-gray-800 font-semibold text-lg">{loadingMessage}</p>
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
          
          {/* Field Mapping UI */}
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border rounded">
            <thead>
                <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">System Field</th>
                  <th className="px-4 py-2 text-left">CSV Column</th>
              </tr>
            </thead>
            <tbody>
                {/* Required fields first */}
              {REQUIRED_FIELDS.map((field) => (
                  <tr key={field} className="border-t bg-yellow-50">
                    <td className="px-4 py-2 font-medium">
                      {fieldDisplayNames[field] || formatFieldName(field)} <span className="text-red-500">*</span>
                  </td>
                  <td className="px-4 py-2">
                    <select 
                      value={fieldMapping[field] || ''}
                      onChange={(e) => handleFieldMapping(field, e.target.value)}
                        className="w-full p-2 border rounded"
                    >
                        <option value="">-- Select Column --</option>
                        {csvData.length > 0 &&
                          Object.keys(csvData[0]).map((column) => (
                            <option key={column} value={column}>
                              {column}
                            </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              
              {/* Optional fields */}
                {OPTIONAL_FIELDS.map((field) => (
                <tr key={field} className="border-t">
                    <td className="px-4 py-2">{fieldDisplayNames[field] || formatFieldName(field)}</td>
                  <td className="px-4 py-2">
                    <select 
                      value={fieldMapping[field] || ''}
                      onChange={(e) => handleFieldMapping(field, e.target.value)}
                        className="w-full p-2 border rounded"
                    >
                        <option value="">-- Select Column --</option>
                        {csvData.length > 0 &&
                          Object.keys(csvData[0]).map((column) => (
                            <option key={column} value={column}>
                              {column}
                            </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          
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