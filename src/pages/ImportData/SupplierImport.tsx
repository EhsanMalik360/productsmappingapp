import React, { useState } from 'react';
import { UploadCloud, Download, ArrowLeft, ArrowRight, Info } from 'lucide-react';
import Button from '../../components/UI/Button';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import SuccessModal from '../../components/UI/SuccessModal';
import { parseCSV, validateRequiredFields } from '../../utils/csvImport';
import { autoMapSupplierColumns, mapSupplierData, importSupplierData } from '../../utils/supplierImport';
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
      const data = await parseCSV(file);
      if (!validateRequiredFields(data)) {
        setError('CSV file appears to be empty or invalid');
        return;
      }

      // Auto-map columns - now async
      const autoMappedFields = await autoMapSupplierColumns(Object.keys(data[0]));
      setFieldMapping(autoMappedFields);
      
      setCSVData(data);
      setCurrentStep(2);
      setError('');
    } catch (err) {
      setError('Error parsing CSV file');
      console.error(err);
    } finally {
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
  
  const handleMap = async () => {
    try {
      setIsLoading(true);
      
      // Check if all required fields are mapped
      const missingFields = [];
      for (const field of allRequiredFields) {
        if (!fieldMapping[field]) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        setError(`Please map the following required fields: ${missingFields.join(', ')}`);
        return;
      }
      
      // Map data using the field mapping
      const mappedData = await mapSupplierData(csvData, fieldMapping);
      
      // Proceed to import
      const results = await importSupplierData(mappedData);
      
      // Update import results
      setImportResults({
        totalRecords: mappedData.length,
        successfulImports: results.processedCount,
        failedImports: mappedData.length - results.processedCount,
        suppliersAdded: results.supplierCount
      });
      
      // Add import record to history
      await addImportRecord({
        type: 'Supplier Data',
        file_name: fileName,
        status: 'Completed',
        total_records: mappedData.length,
        successful_records: results.processedCount,
        failed_records: mappedData.length - results.processedCount,
        error_message: ''
      });
      
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
    }
  };

  return (
    <div>
      {isLoading && <LoadingOverlay message="Processing supplier data, please wait..." />}
      
      <SuccessModal
        isOpen={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Supplier Import Completed"
        message="Your supplier data has been successfully imported into the system."
        details={[
          { label: 'Total Records', value: importResults.totalRecords },
          { label: 'Successfully Imported', value: importResults.successfulImports },
          { label: 'Failed', value: importResults.failedImports },
          { label: 'New Suppliers Added', value: importResults.suppliersAdded }
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
              <li className="mb-1"><span className="font-medium">Unique suppliers:</span> {new Set(csvData.map(row => row[fieldMapping['Supplier Name']])).size}</li>
              <li className="mb-1"><span className="font-medium">Validation:</span> Only required fields will be validated</li>
            </ul>
          </div>
          
          <div className="flex justify-between mt-6">
            <Button variant="secondary" className="flex items-center" onClick={() => setCurrentStep(2)}>
              <ArrowLeft size={16} className="mr-1" /> Back to Mapping
            </Button>
            <Button className="flex items-center" onClick={handleMap}>
              <UploadCloud size={16} className="mr-1" /> Import Data
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierImport;