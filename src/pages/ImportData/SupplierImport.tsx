import React, { useState, useEffect } from 'react';
import { UploadCloud, Download, ArrowLeft, ArrowRight, Info, AlertTriangle } from 'lucide-react';
import Button from '../../components/UI/Button';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import SuccessModal from '../../components/UI/SuccessModal';
import { parseCSV, validateRequiredFields } from '../../utils/csvImport';
import { 
  autoMapSupplierColumns, 
  mapSupplierData, 
  importSupplierData, 
  MatchMethod,
  MatchOptions,
  MatchColumnMapping,
  setMatchingColumns
} from '../../utils/supplierImport';
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
console.log('SupplierImport component loaded');
console.log('API_URL configured as:', API_URL);
console.log('Environment variable value:', import.meta.env.VITE_API_URL);

const REQUIRED_FIELDS = ['Supplier Name', 'Cost'];

const SupplierImport: React.FC = () => {
  const { customAttributes, refreshData } = useAppContext();
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
  }>({
    totalRecords: 0,
    successfulImports: 0,
    failedImports: 0,
    suppliersAdded: 0
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
  const [batchSize, setBatchSize] = useState<number>(250); // Increased default for better performance with large files
  const [pollInterval, setPollInterval] = useState<number | null>(null);
  const [fileRef, setFileRef] = useState<File | null>(null); // Store the file reference for server upload

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
      suppliersAdded: 0
    });
    
    // Reset the file input
    const fileInput = document.getElementById('supplierFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // Handle success modal close
  const handleSuccessModalClose = () => {
    setShowSuccess(false);
    
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
    setJobId(null);
    
    // Reset the form
    resetForm();
  };

  // Setup polling for job status updates
  useEffect(() => {
    if (jobId) {
      console.log(`Setting up polling for job status updates: JobID ${jobId}`);
      // Start polling for job status
      const interval = window.setInterval(() => {
        console.log(`Polling job status for job: ${jobId}`);
        checkJobStatus(jobId)
          .then(status => {
            console.log(`Job status poll returned: ${status}`);
            // Note: We don't clear the interval here since we handle completion
            // in the checkJobStatus function with a setTimeout
          })
          .catch(error => {
            console.error('Error during job status polling:', error);
          });
      }, 1500); // Poll every 1.5 seconds (increased frequency)
      
      setPollInterval(interval);
      
      // Clear interval on unmount
      return () => {
        console.log(`Cleaning up job status polling interval: ${interval}`);
        window.clearInterval(interval);
        setPollInterval(null);
      };
    } else if (pollInterval) {
      // Clear interval if job completed or component unmounted
      console.log(`Clearing existing poll interval: ${pollInterval}`);
      window.clearInterval(pollInterval);
      setPollInterval(null);
    }
  }, [jobId]);

  // Function to check job status periodically
  const checkJobStatus = async (jobId: string) => {
    if (!jobId) return;
    
    // If success modal is already showing, don't trigger multiple status checks
    if (showSuccess) return;
    
    try {
      const response = await fetch(`${API_URL}/api/upload/status/${jobId}`);
      const data = await response.json();
      
      console.log('Job status response:', data);
      
      if (data.status === 'completed') {
        // Clear polling interval to stop further checks
        if (pollInterval) {
          console.log(`Clearing poll interval ${pollInterval} because job completed`);
          window.clearInterval(pollInterval);
          setPollInterval(null);
        }
        
        setIsLoading(false);
        
        console.log('Job completed with results:', data.results);
        
        // Ensure we're getting valid results
        if (data.results) {
          setImportResults({
            totalRecords: data.results.totalRecords || 0,
            successfulImports: data.results.successfulImports || 0,
            failedImports: data.results.failedImports || 0,
            suppliersAdded: data.results.suppliersAdded || 0
          });
          
          // Set match stats if available
          if (data.results.matchStats) {
            console.log('Match statistics received from server:', data.results.matchStats);
            const receivedStats = {
              totalMatched: data.results.matchStats.totalMatched || 0,
              byMethod: {
                [MatchMethod.EAN]: data.results.matchStats.byMethod?.ean || 0,
                [MatchMethod.MPN]: data.results.matchStats.byMethod?.mpn || 0,
                [MatchMethod.NAME]: data.results.matchStats.byMethod?.name || 0
              }
            };
            console.log('Processed match stats:', receivedStats);
            setMatchStats(receivedStats);
          } else {
            console.warn('No match statistics found in results');
            setMatchStats({
              totalMatched: 0,
              byMethod: {
                [MatchMethod.EAN]: 0,
                [MatchMethod.MPN]: 0,
                [MatchMethod.NAME]: 0
              }
            });
          }
          
          // Show success modal only once
          if (!showSuccess) {
            setShowSuccess(true);
          }
          
          // Refresh data to show updated supplier products
          if (refreshData) {
            console.log('Refreshing data after successful import');
            refreshData();
          }
        }
      } else if (data.status === 'failed') {
        // Clear polling interval on failure
        if (pollInterval) {
          window.clearInterval(pollInterval);
          setPollInterval(null);
        }
        
        setIsLoading(false);
        setError(data.message || 'Import failed');
      } else {
        // Still processing, update progress
        setLoadingProgress(data.progress || 0);
        
        // Check again after a delay only if not completed and polling is still active
        if (!showSuccess && pollInterval) {
          setTimeout(() => checkJobStatus(jobId), 2000);
        }
      }
    } catch (error) {
      console.error('Error checking job status:', error);
      setIsLoading(false);
      setError('Failed to check import status');
      
      // Clear polling interval on error
      if (pollInterval) {
        window.clearInterval(pollInterval);
        setPollInterval(null);
      }
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

  // Large file handling - server-side processing
  const handleLargeFileUpload = async (file: File) => {
    try {
      setIsLoading(true);
      // Start with 0% - the server will update to 5% immediately
      setLoadingProgress(0);
      setLoadingMessage("Preparing file upload...");
      
      // Log information about the file
      console.log(`Uploading file to server: ${file.name} (${Math.round(file.size / 1024)} KB)`);
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('batchSize', batchSize.toString());
      
      // Include field mapping if we're at that step or beyond
      if (Object.keys(fieldMapping).length > 0) {
        console.log('Including field mapping in request:', fieldMapping);
        formData.append('fieldMapping', JSON.stringify(fieldMapping));
      }
      
      // Include match options if we're at the final step
      if (currentStep >= 3) {
        console.log('Including match options in request:', matchOptions);
        formData.append('matchOptions', JSON.stringify(matchOptions));
      }
      
      // Update progress to indicate upload is starting
      setLoadingProgress(3);
      setLoadingMessage("Starting file upload...");
      
      // Log the server endpoint being used
      console.log(`Sending file to server endpoint: ${API_URL}/api/upload/supplier`);
      
      // Upload to server API with improved error handling
      const response = await fetch(`${API_URL}/api/upload/supplier`, {
        method: 'POST',
        body: formData
      });
      
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
        throw new Error(result.error || 'Upload failed with status ' + response.status);
      }
      
      // Set job ID for status polling
      if (result.jobId) {
        console.log('Received job ID from server:', result.jobId);
        setJobId(result.jobId);
        setLoadingMessage('Processing file on server...');
        
        // Initial status check
        await checkJobStatus(result.jobId);
        
        // Don't start a new interval here - we already have useEffect handling polling
      } else {
        console.error('No job ID returned from server. Server response:', result);
        throw new Error('No job ID returned from server');
      }
    } catch (err) {
      console.error('Error in handleLargeFileUpload:', err);
      // Keep the loading state visible with error for a moment
      setLoadingProgress(100);
      setLoadingMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      setTimeout(() => {
        setIsLoading(false);
        setError(err instanceof Error ? err.message : 'Error uploading file');
      }, 2000);
    }
  };

  // Handle map button click - proceed to next step or start import
  const handleMap = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(5);
      setLoadingMessage("Validating field mappings...");
      
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
      
      // Move to matching options step if this is the first run through
      if (currentStep === 2) {
        setCurrentStep(3);
        setIsLoading(false);
        setLoadingProgress(0);
        return;
      }
      
      // If this is a large file and we're proceeding with import, upload now
      if (fileRef) {
        console.log('Proceeding with server-side processing for supplier file import...');
        await handleLargeFileUpload(fileRef);
      } else if (csvData.length > 0) {
        // For small files already loaded, process with existing client-side method
        setLoadingProgress(15);
        setLoadingMessage("Processing CSV data...");
        const mappingResult = await mapSupplierData(csvData, fieldMapping);
        
        // If we have currency warnings, show the error and don't proceed
        if (mappingResult.warnings && mappingResult.warnings.currencyWarning) {
          setError(mappingResult.warnings.message);
          setIsLoading(false);
          return;
        }
        
        // Process with client-side function for small datasets
        setLoadingProgress(25);
        setLoadingMessage(`Matching products with suppliers... 0%`);
        
        // Create a progress update function
        const updateProgress = (current: number, total: number) => {
          const percentage = Math.round((current / total) * 75) + 25; // Scale from 25%-100%
          setLoadingProgress(Math.min(percentage, 98)); // Cap at 98% until fully done
          setLoadingMessage(`Matching products with suppliers... ${Math.round((current / total) * 100)}%`);
        };
        
        // Pass progress updater to importSupplierData
        const results = await importSupplierData(
          Promise.resolve(mappingResult), 
          matchOptions,
          updateProgress,
          batchSize,
          Object.keys(matchColumnMapping).length > 0 ? matchColumnMapping : undefined
        );
        
        // Update import results
        setImportResults({
          totalRecords: mappingResult.data.length,
          successfulImports: results.processedCount,
          failedImports: mappingResult.data.length - results.processedCount,
          suppliersAdded: results.supplierCount
        });
        
        // Store match stats
        if (results.matchStats) {
          setMatchStats(results.matchStats);
        }
        
        setLoadingProgress(99);
        setLoadingMessage("Recording import history...");
        
        // Add import record to history
        await addImportRecord({
          type: 'Supplier Data',
          file_name: fileName,
          status: 'Completed',
          total_records: mappingResult.data.length,
          successful_records: results.processedCount,
          failed_records: mappingResult.data.length - results.processedCount,
          error_message: ''
        });
        
        // Set to 100% complete
        setLoadingProgress(100);
        setLoadingMessage("Import completed successfully!");
        
        // Add a delay before showing success to ensure user sees 100% state
        setTimeout(() => {
          setShowSuccess(true);
          
          // Small delay to ensure success modal is visible before hiding loader
          setTimeout(() => {
            setIsLoading(false);
          }, 300);
        }, 1000);
      }
    } catch (err) {
      console.error('Error during import process:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during import process';
      
      // Keep loading visible with error state
      setLoadingProgress(100);
      setLoadingMessage(`Error: ${errorMessage}`);
      
      // Try to get server logs for more detailed error information
      try {
        fetchServerLogs();
      } catch (logError) {
        console.error('Error fetching server logs:', logError);
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

  // Helper function to fetch server logs for debugging
  const fetchServerLogs = async () => {
    try {
      console.log('Fetching server logs to help diagnose the issue...');
      const response = await fetch(`${API_URL}/api/logs`);
      
      if (!response.ok) {
        console.error('Failed to fetch server logs:', response.status);
        return;
      }
      
      const logData = await response.json();
      console.log('==== SERVER LOGS ====');
      if (logData.logs && Array.isArray(logData.logs)) {
        // Display last 20 log lines
        const recentLogs = logData.logs.slice(-20);
        recentLogs.forEach((log: string) => console.log(log));
      } else {
        console.log('No logs available or unexpected format');
      }
      console.log('==== END SERVER LOGS ====');
    } catch (error) {
      console.error('Error fetching server logs:', error);
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
      setLoadingMessage(`Importing supplier data...`);
      setLoadingProgress(5);
      
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
      
      // Include match column mapping in the uploaded data
      const data = {
        fieldMapping: JSON.stringify(fieldMapping),
        matchOptions: JSON.stringify(matchOptions),
        batchSize: batchSize.toString(),
        matchColumnMapping: Object.keys(cleanedMatchColumnMapping).length > 0 
          ? JSON.stringify(cleanedMatchColumnMapping) 
          : undefined
      };
      
      if (fileRef) {
        // Create form data to send the file
        const formData = new FormData();
        formData.append('file', fileRef);
        
        // Add other data
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined) {
            formData.append(key, value);
          }
        });
        
        // Send to server
        const response = await fetch(`${API_URL}/api/upload/supplier`, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorBody = await response.json();
          throw new Error(errorBody.error || 'Failed to upload file');
        }
        
        const result = await response.json();
        
        if (result.jobId) {
          setJobId(result.jobId);
          // Setup polling interval to check job status
          const interval = window.setInterval(() => checkJobStatus(result.jobId), 2000);
          setPollInterval(interval);
        } else {
          throw new Error('No job ID returned from server');
        }
      } else {
        throw new Error('No file reference available for upload');
      }
    } catch (error) {
      console.error('Import error:', error);
      setError(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      {isLoading && <LoadingOverlay message={loadingMessage} progress={loadingProgress} />}
      
      <SuccessModal
        isOpen={showSuccess}
        onClose={handleSuccessModalClose}
        title="Supplier Import Completed"
        message="Your supplier data has been successfully imported into the system."
        details={[
          { label: 'Total Records', value: importResults.totalRecords },
          { label: 'Successfully Imported', value: importResults.successfulImports },
          { label: 'Failed', value: importResults.failedImports },
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
              
              {['MOQ', 'Lead Time', 'Payment Terms'].map((field) => (
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
                min="50"
                max="1000"
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
                <div>Batch Size: 100-200</div>
                <div className="text-xs text-gray-600">Fast processing, low memory</div>
              </div>
              <div className="bg-blue-50 p-2 rounded">
                <div className="font-semibold">Medium Files (5,000-30,000 rows)</div>
                <div>Batch Size: 200-400</div>
                <div className="text-xs text-gray-600">Balanced performance</div>
              </div>
              <div className="bg-orange-50 p-2 rounded border border-orange-200">
                <div className="font-semibold">Large Files (&gt;30,000 rows)</div>
                <div>Batch Size: 300-800</div>
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