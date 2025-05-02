import React, { useState } from 'react';
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
  MatchOptions 
} from '../../utils/supplierImport';
import { useAppContext } from '../../context/AppContext';
import { useImportHistory } from '../../hooks/useSupabase';

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
  
  // Match results stats
  const [matchStats, setMatchStats] = useState<{
    totalMatched: number,
    byMethod: {[key in MatchMethod]?: number}
  }>({
    totalMatched: 0,
    byMethod: {}
  });

  // First, add a new state for loading message
  const [loadingMessage, setLoadingMessage] = useState<string>("Processing data...");
  // Add progress percentage state
  const [loadingProgress, setLoadingProgress] = useState<number>(0);

  // Add a new state for batch size
  const [batchSize, setBatchSize] = useState<number>(100); // Increased default batch size from 50 to 100

  // Get required supplier custom attributes
  const requiredCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'supplier' && attr.required)
    .map(attr => attr.name);
    
  // All supplier custom attributes for optional mapping
  const allCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'supplier')
    .map(attr => attr.name);
    
  // Combined required fields including custom attributes
  const allRequiredFields = [...REQUIRED_FIELDS, ...requiredCustomAttributes];

  // Get custom attribute to column mapping

  // Get the mapping of custom attribute names to column names

  // Reset form to initial state
  const resetForm = () => {
    setCurrentStep(1);
    setCSVData([]);
    setFieldMapping({});
    setError('');
    setFileName('');
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
    resetForm();
  };

  const handleFileUpload = async (event: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement>) => {
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
    
    try {
      setIsLoading(true);
      setLoadingProgress(10);
      setLoadingMessage("Parsing CSV file...");
      const data = await parseCSV(file);
      if (!validateRequiredFields(data)) {
        setError('CSV file appears to be empty or invalid');
        return;
      }

      setLoadingProgress(30);
      setLoadingMessage("Auto-mapping columns...");
      // Auto-map columns - now async
      const autoMappedFields = await autoMapSupplierColumns(Object.keys(data[0]));
      setFieldMapping(autoMappedFields);
      
      setLoadingProgress(100);
      setCSVData(data);
      setCurrentStep(2);
      setError('');
    } catch (err) {
      setError('Error parsing CSV file');
      console.error(err);
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
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
      
      // Map data using the field mapping
      setLoadingProgress(15);
      setLoadingMessage("Processing CSV data...");
      const mappingResult = await mapSupplierData(csvData, fieldMapping);
      
      // If we have currency warnings, show the error and don't proceed
      if (mappingResult.warnings && mappingResult.warnings.currencyWarning) {
        setError(mappingResult.warnings.message);
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
      
      // Proceed to import with the mapped data
      setLoadingProgress(25);
      setLoadingMessage(`Matching products with suppliers (0/${mappingResult.data.length})...`);
      
      // Create a progress update function
      const updateProgress = (current: number, total: number) => {
        const percentage = Math.round((current / total) * 75) + 25; // Scale from 25%-100%
        setLoadingProgress(Math.min(percentage, 98)); // Cap at 98% until fully done
        setLoadingMessage(`Matching products with suppliers (${current}/${total})...`);
      };
      
      // Pass progress updater to importSupplierData
      const results = await importSupplierData(
        Promise.resolve(mappingResult), 
        matchOptions,
        updateProgress,
        batchSize  // Pass the batch size
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
        error_message: results.warnings?.message || ''
      });
      
      setLoadingProgress(100);
      setCurrentStep(4);
      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error mapping and importing data');
      console.error(err);
      
      // Record the failed import attempt
      if (fileName) {
        await addImportRecord({
          type: 'Supplier Data',
          file_name: fileName,
          status: 'Failed',
          total_records: csvData.length,
          successful_records: 0,
          failed_records: csvData.length,
          error_message: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
      setLoadingMessage("Processing data...");
    }
  };

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
  
  const handlePriorityChange = (method: MatchMethod, direction: 'up' | 'down') => {
    setMatchOptions(prev => {
      const priority = [...prev.priority];
      const index = priority.indexOf(method);
      
      if (index === -1) return prev;
      
      if (direction === 'up' && index > 0) {
        // Swap with the previous item
        [priority[index - 1], priority[index]] = [priority[index], priority[index - 1]];
      } else if (direction === 'down' && index < priority.length - 1) {
        // Swap with the next item
        [priority[index], priority[index + 1]] = [priority[index + 1], priority[index]];
      }
      
      return { ...prev, priority };
    });
  };

  return (
    <div>
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
            <h4 className="font-medium mb-3">Performance Settings</h4>
            <div className="flex items-center">
              <label htmlFor="batchSize" className="mr-2 text-sm">Batch Size:</label>
              <input 
                type="number" 
                id="batchSize"
                className="w-24 border p-2 rounded"
                min="10"
                max="500"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
              />
              <span className="ml-2 text-sm text-gray-500">
                Adjust for better performance. Lower for slower connections, higher for faster ones. Recommended: 50-200.
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Higher batch sizes (100-500) can significantly improve import speed but may cause timeouts on slower systems.
            </p>
          </div>
          
          <div className="flex justify-between mt-6">
            <Button variant="secondary" className="flex items-center" onClick={() => setCurrentStep(2)}>
              <ArrowLeft size={16} className="mr-1" /> Back
            </Button>
            <Button variant="primary" className="flex items-center" onClick={handleMap}>
              Import Data <ArrowRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierImport;