import React, { useState } from 'react';
import { CheckCircle, ChevronRight, ChevronDown } from 'lucide-react';
import Button from './Button';
import ProductMatchBadge from './ProductMatchBadge';
import { MatchMethod } from '../../utils/supplierImport';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  details?: {
    label: string;
    value: string | number;
    color?: string;
    matchMethod?: MatchMethod;
  }[];
  duplicateDetails?: {
    row_index: number;
    reason: string;
    data?: Record<string, string>;
  }[];
}

const SuccessModal: React.FC<SuccessModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  details = [],
  duplicateDetails = []
}) => {
  const [showDuplicates, setShowDuplicates] = useState(false);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center mb-4">
            <CheckCircle className="text-green-500 w-8 h-8 mr-3" />
            <h3 className="text-xl font-semibold">{title}</h3>
          </div>
          
          <p className="text-gray-600 mb-4">{message}</p>
          
          {details.length > 0 && (
            <div className="bg-gray-50 rounded p-4 mb-4">
              {details.map((detail, index) => (
                <div key={index} className="flex justify-between mb-2 last:mb-0">
                  <span className="text-gray-600">{detail.label}:</span>
                  {detail.matchMethod ? (
                    <div className="flex items-center">
                      <span className="font-medium mr-2">{detail.value}</span>
                      <ProductMatchBadge matchMethod={detail.matchMethod} size="sm" />
                    </div>
                  ) : (
                    <span className={`font-medium ${detail.color || ''}`}>{detail.value}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {duplicateDetails && duplicateDetails.length > 0 && (
            <div className="mb-4">
              <button 
                onClick={() => setShowDuplicates(!showDuplicates)}
                className="flex items-center w-full justify-between bg-amber-50 p-3 rounded border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center text-amber-800">
                  {showDuplicates ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="ml-1 font-medium">
                    Duplicate Rows: {duplicateDetails.length} rows skipped
                  </span>
                </div>
                <span className="text-sm text-amber-600">
                  {showDuplicates ? 'Hide details' : 'Show details'}
                </span>
              </button>
              
              {showDuplicates && (
                <div className="mt-2 border border-gray-200 rounded max-h-60 overflow-y-auto">
                  {duplicateDetails.slice(0, 10).map((dup, index) => (
                    <div key={index} className="p-2 border-b last:border-b-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Row {dup.row_index}</span>
                        <span className="text-amber-600">{dup.reason}</span>
                      </div>
                      {dup.data && (
                        <div className="mt-1 text-xs text-gray-500">
                          {Object.entries(dup.data)
                            .slice(0, 3) // Limit to first 3 fields
                            .map(([key, value]) => (
                              <div key={key}>
                                <span className="font-medium">{key}: </span>
                                <span>{value}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {duplicateDetails.length > 10 && (
                    <div className="p-2 text-center text-sm text-gray-500">
                      {duplicateDetails.length - 10} more duplicate rows...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuccessModal;