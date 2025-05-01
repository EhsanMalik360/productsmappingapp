import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import { Edit, Trash2, Check, X, AlertCircle, HelpCircle, Plus } from 'lucide-react';

const SupplierAttributes: React.FC = () => {
  const { customAttributes, addCustomAttribute, updateCustomAttribute, deleteCustomAttribute } = useAppContext();
  const [newAttributeName, setNewAttributeName] = useState('');
  const [newAttributeType, setNewAttributeType] = useState<'Text' | 'Number' | 'Date' | 'Yes/No' | 'Selection'>('Text');
  const [newAttributeRequired, setNewAttributeRequired] = useState(false);
  const [newAttributeDefaultValue, setNewAttributeDefaultValue] = useState<string | number | boolean>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingAttributeId, setEditingAttributeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const supplierAttributes = customAttributes.filter(attr => attr.forType === 'supplier');
  
  useEffect(() => {
    // Reset default value when type changes
    switch (newAttributeType) {
      case 'Number':
        setNewAttributeDefaultValue(0);
        break;
      case 'Date':
        setNewAttributeDefaultValue('');
        break;
      case 'Yes/No':
        setNewAttributeDefaultValue(false);
        break;
      case 'Selection':
      case 'Text':
      default:
        setNewAttributeDefaultValue('');
        break;
    }
  }, [newAttributeType]);

  const resetForm = () => {
    setNewAttributeName('');
    setNewAttributeType('Text');
    setNewAttributeRequired(false);
    setNewAttributeDefaultValue('');
    setIsEditing(false);
    setEditingAttributeId(null);
    setError(null);
    if (!isEditing) setShowAddForm(false);
  };

  const formatDefaultValueForDisplay = (value: any, type: string) => {
    if (value === null || value === undefined) return '-';
    
    if (type === 'Yes/No') {
      return value ? 'Yes' : 'No';
    } else if (type === 'Date' && value) {
      return new Date(value).toLocaleDateString();
    }
    
    return value.toString();
  };
  
  const handleAddAttribute = async () => {
    if (!newAttributeName.trim()) {
      setError('Attribute name is required');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const newAttribute = {
        name: newAttributeName,
        type: newAttributeType,
        defaultValue: newAttributeDefaultValue,
        required: newAttributeRequired,
        forType: 'supplier' as const
      };
      
      if (isEditing && editingAttributeId) {
        await updateCustomAttribute(editingAttributeId, newAttribute);
      } else {
        await addCustomAttribute(newAttribute);
      }
      
      resetForm();
    } catch (err) {
      console.error('Error saving attribute:', err);
      setError('Failed to save attribute');
    } finally {
      setLoading(false);
    }
  };

  const handleEditAttribute = (attribute: any) => {
    setNewAttributeName(attribute.name);
    setNewAttributeType(attribute.type);
    setNewAttributeRequired(attribute.required);
    setNewAttributeDefaultValue(attribute.defaultValue !== null ? attribute.defaultValue : '');
    setIsEditing(true);
    setEditingAttributeId(attribute.id);
    setShowAddForm(true);
  };

  const handleDeleteAttribute = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this attribute? This will also remove all values associated with it.')) {
      return;
    }
    
    try {
      setLoading(true);
      await deleteCustomAttribute(id);
    } catch (err) {
      console.error('Error deleting attribute:', err);
      setError('Failed to delete attribute');
    } finally {
      setLoading(false);
    }
  };

  const renderDefaultValueInput = () => {
    switch (newAttributeType) {
      case 'Number':
        return (
          <div className="relative">
            <input
              type="number"
              placeholder="Default value"
              className="border border-gray-300 p-2 rounded w-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all"
              value={newAttributeDefaultValue as number}
              onChange={(e) => setNewAttributeDefaultValue(Number(e.target.value))}
            />
            <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none whitespace-nowrap">
              Default numeric value
            </div>
          </div>
        );
      case 'Date':
        return (
          <div className="relative">
            <input
              type="date"
              className="border border-gray-300 p-2 rounded w-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all"
              value={newAttributeDefaultValue as string}
              onChange={(e) => setNewAttributeDefaultValue(e.target.value)}
            />
            <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none whitespace-nowrap">
              Default date
            </div>
          </div>
        );
      case 'Yes/No':
        return (
          <div className="relative">
            <select
              className="border border-gray-300 p-2 rounded w-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all appearance-none bg-no-repeat bg-right pr-8"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundSize: "1.5em 1.5em" }}
              value={newAttributeDefaultValue === true ? 'true' : 'false'}
              onChange={(e) => setNewAttributeDefaultValue(e.target.value === 'true')}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
            <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none whitespace-nowrap">
              Default boolean value
            </div>
          </div>
        );
      case 'Selection':
        // For simplicity, we'll use a text input for the default selection value
        return (
          <div className="relative">
            <input
              type="text"
              placeholder="Default selection value"
              className="border border-gray-300 p-2 rounded w-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all"
              value={newAttributeDefaultValue as string}
              onChange={(e) => setNewAttributeDefaultValue(e.target.value)}
            />
            <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none whitespace-nowrap">
              Default selection option
            </div>
          </div>
        );
      case 'Text':
      default:
        return (
          <div className="relative">
            <input
              type="text"
              placeholder="Default value"
              className="border border-gray-300 p-2 rounded w-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all"
              value={newAttributeDefaultValue as string}
              onChange={(e) => setNewAttributeDefaultValue(e.target.value)}
            />
            <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none whitespace-nowrap">
              Default text value
            </div>
          </div>
        );
    }
  };

  const toggleAddForm = () => {
    if (showAddForm) {
      resetForm();
    } else {
      setShowAddForm(true);
    }
  };
  
  return (
    <div>
      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Supplier Attributes</h3>
            <p className="text-gray-600 mt-1">Define additional attributes to track for your suppliers.</p>
          </div>
          <Button 
            onClick={toggleAddForm}
            className={`flex items-center ${showAddForm ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
          >
            {showAddForm ? (
              <>
                <X size={18} className="mr-1" /> Cancel
              </>
            ) : (
              <>
                <Plus size={18} className="mr-1" /> Add New Attribute
              </>
            )}
          </Button>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
            <AlertCircle size={18} className="mr-2" />
            {error}
          </div>
        )}
        
        {showAddForm && (
          <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-100 shadow-sm">
            <h4 className="font-medium text-blue-800 mb-3">
              {isEditing ? 'Edit Attribute' : 'Add New Attribute'}
            </h4>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attribute Name*
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Location, Payment Method, Contact Person" 
                    className="border border-gray-300 p-2 rounded w-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all"
                    value={newAttributeName}
                    onChange={(e) => setNewAttributeName(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attribute Type
                    <span className="inline-block ml-1 cursor-help group relative">
                      <HelpCircle size={14} className="text-gray-400" />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none w-48 text-center">
                        Choose the data type for this attribute
                      </div>
                    </span>
                  </label>
                  <select 
                    className="border border-gray-300 p-2 rounded w-full shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 transition-all appearance-none bg-no-repeat bg-right pr-8"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundSize: "1.5em 1.5em" }}
                    value={newAttributeType}
                    onChange={(e) => setNewAttributeType(e.target.value as any)}
                  >
                    <option value="Text">Text</option>
                    <option value="Number">Number</option>
                    <option value="Date">Date</option>
                    <option value="Yes/No">Yes/No</option>
                    <option value="Selection">Selection</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Value
                    <span className="inline-block ml-1 cursor-help group relative">
                      <HelpCircle size={14} className="text-gray-400" />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none w-48 text-center">
                        Set a default value that will be used if none is provided
                      </div>
                    </span>
                  </label>
                  {renderDefaultValueInput()}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Required
                    <span className="inline-block ml-1 cursor-help group relative">
                      <HelpCircle size={14} className="text-gray-400" />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-gray-800 text-white rounded pointer-events-none w-48 text-center">
                        If enabled, this attribute must be provided during import
                      </div>
                    </span>
                  </label>
                  <div className="flex items-center h-10">
                    <label className="inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={newAttributeRequired}
                        onChange={(e) => setNewAttributeRequired(e.target.checked)}
                      />
                      <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                      <span className="ms-3 text-sm">
                        {newAttributeRequired ? 'Required' : 'Optional'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end mt-4">
                <Button 
                  onClick={handleAddAttribute} 
                  disabled={loading || !newAttributeName.trim()}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : isEditing ? 'Update Attribute' : 'Add Attribute'}
                </Button>
              </div>
            </div>
          </div>
        )}
        
        <Table
          headers={['Attribute Name', 'Type', 'Default Value', 'Required', 'Actions']}
        >
          {supplierAttributes.map((attribute) => (
            <tr key={attribute.id} className="border-t hover:bg-gray-50">
              <td className="px-4 py-3">{attribute.name}</td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                  {attribute.type}
                </span>
              </td>
              <td className="px-4 py-3">
                {formatDefaultValueForDisplay(attribute.defaultValue, attribute.type)}
              </td>
              <td className="px-4 py-3">
                {attribute.required ? (
                  <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                    <Check className="w-3 h-3 mr-1" /> Required
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                    <X className="w-3 h-3 mr-1" /> Optional
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex space-x-2">
                  <button 
                    className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    onClick={() => handleEditAttribute(attribute)}
                  >
                    <Edit size={14} className="mr-1" /> Edit
                  </button>
                  <button 
                    className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                    onClick={() => handleDeleteAttribute(attribute.id)}
                  >
                    <Trash2 size={14} className="mr-1" /> Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {supplierAttributes.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                <div className="flex flex-col items-center">
                  <AlertCircle size={24} className="text-gray-400 mb-2" />
                  <p>No custom attributes defined. Add your first attribute above.</p>
                </div>
              </td>
            </tr>
          )}
        </Table>
      </Card>
      
      <div className="bg-blue-50 p-4 rounded mb-6 border border-blue-100">
        <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
          <HelpCircle size={16} className="mr-2" />
          Custom Attributes Usage
        </h4>
        <p className="text-sm">Custom attributes can be used to:</p>
        <ul className="text-sm list-disc pl-6 mt-2 space-y-1 text-blue-900">
          <li>Track additional supplier information</li>
          <li>Filter and segment suppliers in reports</li>
          <li>Include key supplier data in dashboards</li>
          <li>Create supplier performance metrics</li>
          <li>Apply validation rules during data import</li>
        </ul>
      </div>
    </div>
  );
};

export default SupplierAttributes;