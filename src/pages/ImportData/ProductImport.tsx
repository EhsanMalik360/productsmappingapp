import React, { useState } from 'react';
import { UploadCloud, Download, ArrowLeft } from 'lucide-react';
import Button from '../../components/UI/Button';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import SuccessModal from '../../components/UI/SuccessModal';
import { parseCSV, validateRequiredFields } from '../../utils/csvImport';
import { autoMapProductColumns, mapProductData, importProductData } from '../../utils/productImport';
import { useImportHistory } from '../../hooks/useSupabase';

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

      // Auto-map columns
      const autoMappedFields = autoMapProductColumns(Object.keys(data[0]));
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
      for (const field of REQUIRED_FIELDS) {
        if (!fieldMapping[field]) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        setError(`Please map the following required fields: ${missingFields.join(', ')}`);
        return;
      }
      
      // Map data using the field mapping
      const mappedData = await mapProductData(csvData, fieldMapping);
      
      // Proceed to import
      const results = await importProductData(mappedData);
      
      // Update import results
      setImportResults({
        totalRecords: mappedData.length,
        successfulImports: results.processedCount,
        failedImports: mappedData.length - results.processedCount
      });
      
      // Add import record to history
      await addImportRecord({
        type: 'Product Data',
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
      setIsLoading(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    setCurrentStep(1);
    setCSVData([]);
    setFieldMapping({});
  };

  return (
    <div className="max-w-5xl mx-auto">
      {isLoading && <LoadingOverlay />}
      
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
                id="productFileInput"
                type="file" 
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
            
            <div className="flex justify-between items-center">
              <a 
                href="/template/amazon-products-template.csv" 
                download
                className="flex items-center text-blue-600 hover:underline"
              >
                <Download size={16} className="mr-1" /> Download Template
              </a>
            </div>
          </div>
        )}
      </div>
      
      {currentStep >= 2 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center mb-6">
            <div className={`w-8 h-8 rounded-full ${currentStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'} flex items-center justify-center mr-2`}>
              2
            </div>
            <h2 className="text-xl font-semibold">Map Fields</h2>
          </div>
          
          {currentStep === 2 && (
            <div>
              <p className="text-gray-600 mb-4">
                Map the fields from your CSV file to our system fields. Required fields are marked with an asterisk (*).
              </p>
              
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded mb-4">
                  {error}
                </div>
              )}
              
              <div className="overflow-auto max-h-80 mb-6">
                <table className="min-w-full border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="py-2 px-4 border-b text-left">System Field</th>
                      <th className="py-2 px-4 border-b text-left">CSV Field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(fieldMapping).map(([systemField, csvField]) => (
                      <tr key={systemField} className="border-b">
                        <td className="py-2 px-4">
                          {systemField} {REQUIRED_FIELDS.includes(systemField) && <span className="text-red-500">*</span>}
                        </td>
                        <td className="py-2 px-4">
                          <select
                            value={csvField}
                            onChange={(e) => handleFieldMapping(systemField, e.target.value)}
                            className="border rounded p-1 w-full"
                          >
                            <option value="">-- Select Field --</option>
                            {csvData.length > 0 && 
                              Object.keys(csvData[0]).map(header => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))
                            }
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-between">
                <Button 
                  variant="secondary" 
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center"
                >
                  <ArrowLeft size={16} className="mr-1" /> Back
                </Button>
                <Button className="flex items-center" onClick={handleMap}>
                  <UploadCloud size={16} className="mr-1" /> Import Data
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductImport; 