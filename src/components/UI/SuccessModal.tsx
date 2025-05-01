import React from 'react';
import { CheckCircle } from 'lucide-react';
import Button from './Button';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  details?: {
    label: string;
    value: string | number;
  }[];
}

const SuccessModal: React.FC<SuccessModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  details = []
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-w-lg">
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
                  <span className="font-medium">{detail.value}</span>
                </div>
              ))}
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