import React, { useState, useEffect } from 'react';
import { UploadCloud, Download, ArrowLeft, ArrowRight, Info, AlertTriangle, Loader2 } from 'lucide-react';
import Button from '../../components/UI/Button';
import SuccessModal from '../../components/UI/SuccessModal';
import { parseCSV, validateRequiredFields } from '../../utils/csvImport';
import { 
  autoMapSupplierColumns, 
  MatchMethod,
  MatchOptions,
  MatchColumnMapping} from '../../utils/supplierImport';
import { useAppContext } from '../../context/AppContext';
import { useImportHistory } from '../../hooks/useSupabase';
import { api } from '../../lib/api';

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
console.log('SupplierImport component loaded');
console.log('API_URL configured as:', API_URL);
console.log('Environment variable value:', import.meta.env.VITE_API_URL);

const REQUIRED_FIELDS = ['Supplier Name', 'Cost'];

const SupplierImport: React.FC = () => {
  const { customAttributes } = useAppContext();
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
    suppliersAdded: number;
    duplicateRows: number;
  }>({
    totalRecords: 0,
    successfulImports: 0,
    failedImports: 0,
    suppliersAdded: 0,
    duplicateRows: 0
  });
  
  // Match options state
  const [matchOptions, setMatchOptions] = useState<MatchOptions>({
    useEan: true,
    useMpn: true,
    useName: false,
    priority: [MatchMethod.EAN, MatchMethod.MPN, MatchMethod.NAME]
  });
  
  // Custom match column mapping state
  const [matchColumnMapping, setMatchColumnMapping] = useState<MatchColumnMapping>({});
  
  // Match results stats
  const [matchStats, setMatchStats] = useState<{
    totalMatched: number,
    byMethod: {[key in MatchMethod]?: number}
  }>({
    totalMatched: 0,
    byMethod: {}
  });

  // Job tracking states
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("Processing data...");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [batchSize, setBatchSize] = useState<number>(1000); // Increased default for better performance
  const [pollInterval, setPollInterval] = useState<number | null>(null);
  const [fileRef, setFileRef] = useState<File | null>(null); // Store the file reference for server upload
  
  // Add states for timeout handling
  const [importStartTime, setImportStartTime] = useState<number | null>(null);
  const [, setExecutionTime] = useState<number>(0);
  const [isLongRunningImport, setIsLongRunningImport] = useState<boolean>(false);
  const [importComplete, setImportComplete] = useState<boolean>(false);

  // First, add a new state for duplicate details around line 32-41
  const [duplicateDetails, setDuplicateDetails] = useState<{
    row_index: number;
    reason: string;
    data?: Record<string, string>;
  }[]>([]);

  // Required supplier custom attributes
  const requiredCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'supplier' && attr.required)
    .map(attr => attr.name);
    
  // All supplier custom attributes for optional mapping
  const allCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'supplier')
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
      failedImports: 0,
      suppliersAdded: 0,
      duplicateRows: 0
    });
    setDuplicateDetails([]);
    setLoadingProgress(0);
    setLoadingMessage("Processing data...");
    setImportStartTime(null);
    setExecutionTime(0);
    setIsLongRunningImport(false);
    setImportComplete(false);
    
    // Reset the file input
    const fileInput = document.getElementById('supplierFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // Handle success modal close
  const handleSuccessModalClose = () => {
    // Immediately set showSuccess to false to prevent any race conditions
    setShowSuccess(false);
    
    // Clear any jobId to prevent status checks
    setJobId(null);
    
    // Clear polling interval if it exists
    if (pollInterval) {
      window.clearInterval(pollInterval);
      setPollInterval(null);
    }
    
    // Clear any pending timeouts for job status checks
    // This helps prevent additional success modal triggers
    const highestTimeoutId = setTimeout(() => {}, 0);
    for (let i = 0; i < (highestTimeoutId as unknown as number); i++) {
      clearTimeout(i);
    }
    
    // Make sure loading is fully cleared when success modal is closed
    setIsLoading(false);
    setLoadingProgress(0); 
    setLoadingMessage("Processing data...");
    
    // Reset the form
    resetForm();
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
        
        // For long-running imports, just update the message but don't show timeout warning
        if (elapsed >= 180 && !isLongRunningImport) {
          console.log("Import taking longer than expected, updating message only");
          setIsLongRunningImport(true);
          
          // Just update message to inform user of progress
          setLoadingMessage(`Import running for ${Math.floor(elapsed / 60)} minutes. Processing will continue automatically.`);
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
      // Show success message and reset states
      setShowSuccess(true);
      setIsLoading(false);
      setJobId(null);
    }
  }, [importComplete]);

  // Poll job status
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout;
    let isComponentMounted = true;
    
    // Function to handle job status checks
    const pollJobStatus = async () => {
      if (!jobId || !isComponentMounted) return;
      
      try {
        console.log(`Polling job status for ID: ${jobId}`);
        const statusData = await api.checkJobStatus(jobId);
        
        if (!isComponentMounted) return;
        
        // Update progress and message from Django backend data
        setLoadingProgress(statusData.progress || 0);
        setLoadingMessage(statusData.message || "Processing file...");
        
        // Handle job completion
        if (statusData.status === 'completed') {
          console.log('Job completed successfully:', statusData);
          
          // Process results to match our expected format
          if (statusData.results) {
            setImportResults({
              totalRecords: statusData.results.total || 0,
              successfulImports: statusData.results.successful || 0,
              failedImports: statusData.results.failed || 0,
              suppliersAdded: statusData.results.suppliers_added || 0,
              duplicateRows: statusData.results.deduped || 0
            });
            
            // Set match stats if available
            if (statusData.results.match_stats) {
              setMatchStats({
                totalMatched: statusData.results.match_stats.total_matched || 0,
                byMethod: {
                  [MatchMethod.EAN]: statusData.results.match_stats.by_method?.ean || 0,
                  [MatchMethod.MPN]: statusData.results.match_stats.by_method?.mpn || 0,
                  [MatchMethod.NAME]: statusData.results.match_stats.by_method?.name || 0
                }
              });
            }
            
            // Set duplicate details if available
            if (statusData.results.duplicate_details && Array.isArray(statusData.results.duplicate_details)) {
              setDuplicateDetails(statusData.results.duplicate_details);
              console.log(`Received ${statusData.results.duplicate_details.length} duplicate details`);
            }
          }
          
          // Show success modal
          setImportComplete(true);
          setIsLoading(false);
          setJobId(null);
          clearInterval(pollingInterval);
        }
        
        // Handle job failure
        if (statusData.status === 'failed') {
          console.error('Job failed:', statusData);
          setIsLoading(false);
          setJobId(null);
          setError(statusData.message || 'Import failed');
          clearInterval(pollingInterval);
        }
      } catch (error) {
        console.error('Error checking job status:', error);
        // Don't stop polling on error unless too many consecutive errors
      }
    };
    
    if (jobId && isLoading) {
      // Start polling immediately
      pollJobStatus();
      
      // Calculate appropriate polling interval based on file size
      let pollDelayMs = 2000; // Default is 2 seconds
      
      // For large files (detectable by batch size and/or file reference size)
      if (batchSize > 1000 && fileRef && fileRef.size > 10 * 1024 * 1024) {
        // Large file detected, use longer polling intervals
        pollDelayMs = 5000; // 5 seconds for large files
        console.log(`Large file detected (${(fileRef.size / (1024 * 1024)).toFixed(2)} MB), using ${pollDelayMs}ms polling interval`);
      } else if (batchSize > 2000 && fileRef && fileRef.size > 50 * 1024 * 1024) {
        // Very large file, use even longer interval
        pollDelayMs = 8000; // 8 seconds for very large files
        console.log(`Very large file detected (${(fileRef.size / (1024 * 1024)).toFixed(2)} MB), using ${pollDelayMs}ms polling interval`);
      }
      
      // Poll at the calculated interval
      pollingInterval = setInterval(pollJobStatus, pollDelayMs);
    }
    
    return () => {
      isComponentMounted = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [jobId, isLoading, batchSize, fileRef]);

  // Handle file upload - client side for mapping, server side for actual import
  const handleFileUpload = async (event: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement>) => {
    // If there's an active job, don't allow a new upload
    if (jobId || isLoading) {
      console.warn('Upload attempted while another import is in progress');
      setError('Please wait for the current import to complete before starting a new one.');
      return;
    }
    
    console.log('⭐⭐⭐ SUPPLIER UPLOAD HANDLER TRIGGERED ⭐⭐⭐');
    
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
      
      console.log('Server connection successful');
      
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
      const autoMappedFields = await autoMapSupplierColumns(Object.keys(data[0]));
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

  // Handle drag over
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  // Handle field mapping
  const handleFieldMapping = (systemField: string, csvField: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [systemField]: csvField
    }));
  };

  // Large file handling - server-side processing (updated)
  const handleLargeFileUpload = async (file: File) => {
    try {
      console.log('Starting server-side processing for file:', file.name);
      setIsLoading(true);
      setLoadingProgress(5);
      setLoadingMessage("Uploading file to server...");
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);
      
      // Optimize batch size based on file size for better performance
      const fileSizeMB = file.size / (1024 * 1024);
      let optimalBatchSize = batchSize;
      
      // For larger files, increase batch size automatically if user didn't manually set it higher
      if (fileSizeMB > 50) {
        optimalBatchSize = Math.max(batchSize, 3000); // At least 3000 for large files
        console.log(`Large file detected (${fileSizeMB.toFixed(2)}MB). Optimizing batch size to ${optimalBatchSize}`);
      } else if (fileSizeMB > 20) {
        optimalBatchSize = Math.max(batchSize, 2000); // At least 2000 for medium files
        console.log(`Medium file detected (${fileSizeMB.toFixed(2)}MB). Using batch size of ${optimalBatchSize}`);
      }
      
      // Include the optimized batch size
      formData.append('batch_size', optimalBatchSize.toString());
      console.log(`Using optimized batch size: ${optimalBatchSize} for file of ${fileSizeMB.toFixed(2)}MB`);
      
      // Include field mapping if available
      if (Object.keys(fieldMapping).length > 0) {
        formData.append('field_mapping', JSON.stringify(fieldMapping));
        console.log('Including field mapping in upload:', fieldMapping);
      }
      
      // Include match options if specified
      if (matchOptions) {
        formData.append('match_options', JSON.stringify(matchOptions));
        console.log('Including match options in upload:', matchOptions);
      }
      
      // Set execution start time for timeout tracking
      setImportStartTime(Date.now());
      
      // Use the API client for upload (this will handle authentication and CORS)
      console.log('Sending file to Django backend endpoint...');
      
      // Use the Django API endpoint
      const result = await fetch(`${API_URL}/api/upload/supplier/`, {
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
      
      console.log('Server response:', result);
      
      // Set job ID for status tracking
      if (result.job_id || result.id) { // Check for either job_id or id
        const jobIdentifier = result.job_id || result.id; // Use either one that's available
        setJobId(jobIdentifier);
        console.log(`Job ID set: ${jobIdentifier}`);
        
        // Update loading message
        setLoadingProgress(5);
        setLoadingMessage("File received by server. Processing has started...");
      } else if (result.file_path) {
        // The server accepted the file but didn't return a job ID
        // Generate a pseudo job ID based on the file path to track progress
        const pseudoJobId = result.file_path.split('\\').pop() || `file-${Date.now()}`;
        console.log(`No job ID received, but file was accepted. Using pseudo job ID: ${pseudoJobId}`);
        setJobId(pseudoJobId);
        
        // Update loading message
        setLoadingProgress(5);
        setLoadingMessage("File received by server. Processing without job tracking...");
      } else {
        throw new Error('No job ID received from server');
      }
    } catch (error) {
      console.error('Error in handleLargeFileUpload:', error);
      
      // Check for connection timeout
      if (error instanceof Error && error.message.includes('timed out')) {
        console.warn('Network request timed out - server might be busy with large file');
        throw new Error('Upload timed out. Your file might be too large for the server to handle. Try reducing the file size or try again later.');
      }
      
      throw error;
    }
  };

  // Handle match option changes
  const handleMatchOptionChange = (option: 'useEan' | 'useMpn' | 'useName', value: boolean) => {
    setMatchOptions(prev => {
      // Create new object with updated option
      const updated = { ...prev, [option]: value };
      
      // If user is disabling all options, force at least one to be true
      if (!updated.useEan && !updated.useMpn && !updated.useName) {
        updated[option] = true;
      }
      
      // When disabling an option, also remove it from priority
      if (!value) {
        const methodToRemove = option === 'useEan' 
          ? MatchMethod.EAN 
          : option === 'useMpn'
            ? MatchMethod.MPN
            : MatchMethod.NAME;
            
        updated.priority = prev.priority.filter(m => m !== methodToRemove);
      } else {
        // When enabling an option, add it to priority if not already there
        const methodToAdd = option === 'useEan' 
          ? MatchMethod.EAN 
          : option === 'useMpn'
            ? MatchMethod.MPN
            : MatchMethod.NAME;
            
        if (!prev.priority.includes(methodToAdd)) {
          updated.priority = [...prev.priority, methodToAdd];
        }
      }
      
      return updated;
    });
  };
  
  // Handle priority changes
  const handlePriorityChange = (method: MatchMethod, direction: 'up' | 'down') => {
    setMatchOptions(prev => {
      const currentIndex = prev.priority.indexOf(method);
      if (currentIndex === -1) return prev;
      
      // Can't move first item up or last item down
      if (
        (direction === 'up' && currentIndex === 0) || 
        (direction === 'down' && currentIndex === prev.priority.length - 1)
      ) {
        return prev;
      }
      
      // Create a new array with the items swapped
      const newPriority = [...prev.priority];
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      // Swap the items
      [newPriority[currentIndex], newPriority[targetIndex]] = 
        [newPriority[targetIndex], newPriority[currentIndex]];
      
      return {
        ...prev,
        priority: newPriority
      };
    });
  };

  // Handle batch size change
  const handleBatchSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setBatchSize(value);
    }
  };

  // Handle custom match column selection
  const handleMatchColumnChange = (matchType: 'ean' | 'mpn' | 'name', csvColumn: string) => {
    setMatchColumnMapping(prev => ({
      ...prev,
      [matchType]: csvColumn
    }));
  };

  const handleImport = async () => {
    try {
      setIsLoading(true);
      setError('');
      setLoadingMessage(`Preparing to import supplier data...`);
      setLoadingProgress(5);
      
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
      
      // Clear empty values from matchColumnMapping
      const cleanedMatchColumnMapping: MatchColumnMapping = {};
      if (matchColumnMapping.ean && matchColumnMapping.ean !== '') {
        cleanedMatchColumnMapping.ean = matchColumnMapping.ean;
      }
      if (matchColumnMapping.mpn && matchColumnMapping.mpn !== '') {
        cleanedMatchColumnMapping.mpn = matchColumnMapping.mpn;
      }
      if (matchColumnMapping.name && matchColumnMapping.name !== '') {
        cleanedMatchColumnMapping.name = matchColumnMapping.name;
      }
      
      // Prepare options for the API call
      
      // Reset timeout tracking
      setImportStartTime(Date.now());
      setExecutionTime(0);
      setIsLongRunningImport(false);
      
      if (fileRef) {
        try {
          console.log('Starting optimized server-side processing for supplier import...');
          
          // Check file size and warn user if it's very large
          const fileSizeMB = fileRef.size / (1024 * 1024);
          if (fileSizeMB > 50) {
            console.warn(`Very large file detected: ${fileSizeMB.toFixed(2)}MB. This may take longer to process.`);
            setLoadingMessage(`Large file detected (${fileSizeMB.toFixed(2)}MB). Upload may take several minutes...`);
          }
          
          // Use our enhanced file upload handler
          await handleLargeFileUpload(fileRef);
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
          
          // Record the failed import attempt
          if (fileName) {
            await addImportRecord({
              type: 'Supplier Data',
              file_name: fileName,
              status: 'Failed',
              total_records: csvData.length,
              successful_records: 0,
              failed_records: csvData.length,
              error_message: uploadError instanceof Error ? uploadError.message : 'Unknown error'
            });
          }
          
          // Show error message after a delay to ensure it's seen
          setTimeout(() => {
            setIsLoading(false);
            setError(uploadError instanceof Error ? uploadError.message : 'Unknown upload error');
          }, 1500);
        }
      } else {
        throw new Error('No file reference available for upload');
      }
    } catch (error) {
      console.error('Import error:', error);
      
      // Keep loading visible with error state
      setLoadingProgress(100);
      setLoadingMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Delay before showing error message
      setTimeout(() => {
      setIsLoading(false);
        setError(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }, 1500);
    }
  };

  return (
    <div className="container mx-auto p-4">
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
      
      <SuccessModal
        isOpen={showSuccess}
        onClose={handleSuccessModalClose}
        title="Supplier Import Completed"
        message="Your supplier data has been successfully imported into the system."
        duplicateDetails={duplicateDetails}
        details={[
          { label: 'Total Records', value: importResults.totalRecords },
          { label: 'Successfully Imported', value: importResults.successfulImports },
          { label: 'Failed', value: importResults.failedImports },
          { label: 'Duplicate Rows Skipped', value: importResults.duplicateRows, color: 'text-amber-600' },
          { label: 'New Suppliers Added', value: importResults.suppliersAdded },
          { 
            label: 'Matched by EAN', 
            value: matchStats.byMethod[MatchMethod.EAN] || 0,
            matchMethod: MatchMethod.EAN
          },
          { 
            label: 'Matched by MPN', 
            value: matchStats.byMethod[MatchMethod.MPN] || 0,
            matchMethod: MatchMethod.MPN 
          },
          { 
            label: 'Matched by Name', 
            value: matchStats.byMethod[MatchMethod.NAME] || 0,
            matchMethod: MatchMethod.NAME
          }
        ]}
      />
      
      <div className="steps flex mb-6">
        <div className={`step flex-1 p-3 text-center mr-1 rounded ${currentStep === 1 ? 'step-active bg-blue-500 text-white' : 'bg-gray-200'}`}>
          1. Upload File
        </div>
        <div className={`step flex-1 p-3 text-center mr-1 rounded ${currentStep === 2 ? 'step-active bg-blue-500 text-white' : 'bg-gray-200'}`}>
          2. Map Fields
        </div>
        <div className={`step flex-1 p-3 text-center rounded ${currentStep === 3 ? 'step-active bg-blue-500 text-white' : 'bg-gray-200'}`}>
          3. Configure Product Matching
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {currentStep === 1 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Import Supplier Data</h3>
          <p className="mb-4">Upload a CSV file containing your supplier cost data.</p>
          
          <div 
            className="dropzone border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-500 transition-colors"
            onDrop={handleFileUpload}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('supplierFileInput')?.click()}
          >
            <input 
              type="file" 
              id="supplierFileInput"
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
                min="1000"
                max="10000"
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
              
              {['Brand', 'Product Name', 'EAN', 'MPN', 'Supplier Stock'].map((field) => (
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
          <h3 className="text-lg font-semibold mb-3">Configure Product Matching</h3>
          <p className="mb-4">
            Choose how supplier products will be matched with existing products in the system.
          </p>
          
          <div className="bg-blue-50 p-4 mb-6 rounded-md border border-blue-100">
            <div className="flex items-start mb-2">
              <Info size={18} className="text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">About Product Matching</p>
                <p>Products will be matched in order of priority based on the methods you select below.</p>
              </div>
            </div>
            
            <div className="mt-2 pl-7">
              <div className="flex items-center mb-1">
                <div className="w-8 text-center">
                  <span className="inline-block w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center">1</span>
                </div>
                <span className="ml-2 text-sm font-medium">Exact matches with high confidence</span>
              </div>
              <div className="flex items-center mb-1">
                <div className="w-8 text-center">
                  <span className="inline-block w-5 h-5 bg-yellow-500 text-white rounded-full text-xs flex items-center justify-center">2</span>
                </div>
                <span className="ml-2 text-sm font-medium">Good matches with medium confidence</span>
              </div>
              <div className="flex items-center">
                <div className="w-8 text-center">
                  <span className="inline-block w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">3</span>
                </div>
                <span className="ml-2 text-sm font-medium">Name-based matches with low confidence</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="border rounded-md p-4">
              <h4 className="font-medium mb-3">Available Matching Methods</h4>
              
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useEan"
                    className="h-4 w-4 text-blue-600"
                    checked={matchOptions.useEan}
                    onChange={(e) => handleMatchOptionChange('useEan', e.target.checked)}
                  />
                  <div className="ml-3">
                    <label htmlFor="useEan" className="font-medium">
                      EAN/UPC Matching
                      <span className="ml-2 inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                        High Confidence
                      </span>
                    </label>
                    <p className="text-sm text-gray-500">
                      Match using column: <span className="font-mono">{fieldMapping['EAN'] || 'Not mapped'}</span>
                    </p>
                    <div className="mt-2">
                      <label className="text-xs text-blue-600 block mb-1">Select custom column for EAN matching:</label>
                      <select 
                        className="w-full border p-1 rounded text-sm"
                        value={matchColumnMapping.ean || fieldMapping['EAN'] || ''}
                        onChange={(e) => handleMatchColumnChange('ean', e.target.value)}
                      >
                        <option value="">Use default mapping</option>
                        {Object.keys(csvData[0] || {}).map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useMpn"
                    className="h-4 w-4 text-blue-600"
                    checked={matchOptions.useMpn}
                    onChange={(e) => handleMatchOptionChange('useMpn', e.target.checked)}
                  />
                  <div className="ml-3">
                    <label htmlFor="useMpn" className="font-medium">
                      MPN Matching
                      <span className="ml-2 inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                        Medium Confidence
                      </span>
                    </label>
                    <p className="text-sm text-gray-500">
                      Match using column: <span className="font-mono">{fieldMapping['MPN'] || 'Not mapped'}</span>
                      {!fieldMapping['MPN'] && (
                        <span className="text-orange-500 ml-2">
                          <AlertTriangle size={14} className="inline mr-1" />
                          No column mapped
                        </span>
                      )}
                    </p>
                    <div className="mt-2">
                      <label className="text-xs text-blue-600 block mb-1">Select custom column for MPN matching:</label>
                      <select 
                        className="w-full border p-1 rounded text-sm"
                        value={matchColumnMapping.mpn || fieldMapping['MPN'] || ''}
                        onChange={(e) => handleMatchColumnChange('mpn', e.target.value)}
                      >
                        <option value="">Use default mapping</option>
                        {Object.keys(csvData[0] || {}).map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useName"
                    className="h-4 w-4 text-blue-600"
                    checked={matchOptions.useName}
                    onChange={(e) => handleMatchOptionChange('useName', e.target.checked)}
                  />
                  <div className="ml-3">
                    <label htmlFor="useName" className="font-medium">
                      Product Name Matching
                      <span className="ml-2 inline-block px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">
                        Low Confidence
                      </span>
                    </label>
                    <p className="text-sm text-gray-500">
                      Match using column: <span className="font-mono">{fieldMapping['Product Name'] || 'Not mapped'}</span>
                      {!fieldMapping['Product Name'] && (
                        <span className="text-orange-500 ml-2">
                          <AlertTriangle size={14} className="inline mr-1" />
                          No column mapped
                        </span>
                      )}
                    </p>
                    <div className="mt-2">
                      <label className="text-xs text-blue-600 block mb-1">Select custom column for Name matching:</label>
                      <select 
                        className="w-full border p-1 rounded text-sm"
                        value={matchColumnMapping.name || fieldMapping['Product Name'] || ''}
                        onChange={(e) => handleMatchColumnChange('name', e.target.value)}
                      >
                        <option value="">Use default mapping</option>
                        {Object.keys(csvData[0] || {}).map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="border rounded-md p-4">
              <h4 className="font-medium mb-3">Matching Priority</h4>
              <p className="text-sm text-gray-600 mb-4">
                Drag to reorder how matching methods will be applied. Products will be matched using the first method that finds a match.
              </p>
              
              <div className="space-y-2">
                {matchOptions.priority.map((method, index) => {
                  // Skip methods that are disabled
                  if (
                    (method === MatchMethod.EAN && !matchOptions.useEan) ||
                    (method === MatchMethod.MPN && !matchOptions.useMpn) ||
                    (method === MatchMethod.NAME && !matchOptions.useName)
                  ) {
                    return null;
                  }
                  
                  // Determine label and style based on method
                  let label = '';
                  let badge = '';
                  let badgeClass = '';
                  
                  if (method === MatchMethod.EAN) {
                    label = 'EAN/UPC Matching';
                    badge = 'High';
                    badgeClass = 'bg-green-100 text-green-800';
                  } else if (method === MatchMethod.MPN) {
                    label = 'MPN Matching';
                    badge = 'Medium';
                    badgeClass = 'bg-yellow-100 text-yellow-800';
                  } else {
                    label = 'Product Name Matching';
                    badge = 'Low';
                    badgeClass = 'bg-red-100 text-red-800';
                  }
                  
                  return (
                    <div key={method} className="flex items-center justify-between p-2 bg-gray-50 border rounded">
                      <div className="flex items-center">
                        <span className="inline-block w-5 h-5 bg-gray-700 text-white rounded-full text-xs flex items-center justify-center mr-2">
                          {index + 1}
                        </span>
                        <span className="font-medium">{label}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${badgeClass}`}>
                          {badge} Confidence
                        </span>
                      </div>
                      
                      <div className="flex space-x-1">
                        <button
                          type="button"
                          onClick={() => handlePriorityChange(method, 'up')}
                          disabled={index === 0}
                          className={`p-1 rounded hover:bg-gray-200 ${index === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePriorityChange(method, 'down')}
                          disabled={index === matchOptions.priority.filter(m => 
                            (m === MatchMethod.EAN && matchOptions.useEan) ||
                            (m === MatchMethod.MPN && matchOptions.useMpn) ||
                            (m === MatchMethod.NAME && matchOptions.useName)
                          ).length - 1}
                          className={`p-1 rounded hover:bg-gray-200 ${
                            index === matchOptions.priority.filter(m => 
                              (m === MatchMethod.EAN && matchOptions.useEan) ||
                              (m === MatchMethod.MPN && matchOptions.useMpn) ||
                              (m === MatchMethod.NAME && matchOptions.useName)
                            ).length - 1 ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          <div className="border rounded-md p-4 mt-6">
            <h4 className="font-medium mb-3">Performance Settings for Large Files</h4>
            <div className="flex items-center mb-3">
              <label htmlFor="batchSize" className="mr-2 text-sm">Batch Size:</label>
              <input 
                type="number" 
                id="batchSize"
                className="w-24 border p-2 rounded"
                min="500"
                max="10000"
                value={batchSize}
                onChange={handleBatchSizeChange}
              />
              <span className="ml-2 text-sm text-gray-500">
                Adjust for file size and network stability. <strong>Recommended:</strong>
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div className="bg-blue-50 p-2 rounded">
                <div className="font-semibold">Small Files (&lt;5,000 rows)</div>
                <div>Batch Size: 500-1,000</div>
                <div className="text-xs text-gray-600">Fast processing, low memory</div>
              </div>
              <div className="bg-blue-50 p-2 rounded">
                <div className="font-semibold">Medium Files (5,000-30,000 rows)</div>
                <div>Batch Size: 1,000-2,000</div>
                <div className="text-xs text-gray-600">Balanced performance</div>
              </div>
              <div className="bg-orange-50 p-2 rounded border border-orange-200">
                <div className="font-semibold">Large Files (&gt;30,000 rows)</div>
                <div>Batch Size: 2,000-5,000</div>
                <div className="text-xs text-orange-600">More memory needed</div>
              </div>
            </div>
            
            {csvData.length > 30000 && (
              <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200 flex items-start mb-3">
                <AlertTriangle size={18} className="text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-yellow-800">Large File Detected ({csvData.length.toLocaleString()} rows)</div>
                  <div className="text-sm text-yellow-700">
                    Processing may take several minutes and require significant memory. 
                  </div>
                </div>
              </div>
            )}
            
            <div className="text-xs text-gray-500 mt-2">
              <p className="mb-1">Higher batch sizes can significantly improve import speed but may cause timeouts on slower systems.</p>
              
            </div>
          </div>
          
          <div className="flex justify-between mt-6">
            <Button variant="secondary" className="flex items-center" onClick={() => setCurrentStep(2)}>
              <ArrowLeft size={16} className="mr-1" /> Back
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

export default SupplierImport;