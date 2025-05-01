import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Button from '../../components/UI/Button';
import { useAppContext, Supplier } from '../../context/AppContext';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}

const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, supplier }) => {
  const { addSupplier, updateSupplier } = useAppContext();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Initialize form when supplier changes
  useEffect(() => {
    if (supplier) {
      setName(supplier.name);
    } else {
      setName('');
    }
    setError('');
  }, [supplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate form
    if (!name.trim()) {
      setError('Supplier name is required');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      if (supplier) {
        // Update existing supplier
        await updateSupplier(supplier.id, { name });
      } else {
        // Add new supplier
        await addSupplier({ name });
      }
      
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="fixed inset-0 bg-black opacity-50"></div>
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md z-10">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="text-lg font-semibold">
            {supplier ? 'Edit Supplier' : 'Add New Supplier'}
          </h3>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="name">
              Supplier Name
            </label>
            <input
              id="name"
              type="text"
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter supplier name"
            />
          </div>
          
          <div className="flex justify-end space-x-2 mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? (supplier ? 'Updating...' : 'Adding...') 
                : (supplier ? 'Update Supplier' : 'Add Supplier')
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierModal; 