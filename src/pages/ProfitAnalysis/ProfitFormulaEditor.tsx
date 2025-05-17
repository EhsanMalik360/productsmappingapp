import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { DragSourceMonitor } from 'react-dnd';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { PlusCircle, X, MoveVertical, Calculator, AlertCircle, Edit2, Save, Info, HelpCircle, Download } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';

// Formula component types
type OperatorType = '+' | '-' | '*' | '/' | '(' | ')';
type FormulaItemType = 'field' | 'customAttribute' | 'operator' | 'constant';

interface FormulaItem {
  id: string;
  type: FormulaItemType;
  value: string;
  displayValue?: string;
}

// Result type for database calculations
interface ProfitCalculationResult {
  productId: string;
  productTitle: string;
  salePrice: number;
  amazonFee: number;
  referralFee: number;
  supplierCost: number;
  customValues: Record<string, number>;
  profit: number;
  profitMargin: number;
}

// Draggable formula item component
const FormulaItemComponent: React.FC<{
  item: FormulaItem;
  index: number;
  moveItem: (dragIndex: number, hoverIndex: number) => void;
  removeItem: (index: number) => void;
  editItem?: (index: number, newValue: string) => void;
}> = ({ item, index, moveItem, removeItem, editItem }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.value);
  
  const [{ isDragging }, drag] = useDrag({
    type: 'formula-item',
    item: () => ({ index }),
    collect: (monitor: DragSourceMonitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  const [, drop] = useDrop({
    accept: 'formula-item',
    hover: (draggedItem: { index: number }) => {
      if (draggedItem.index !== index) {
        moveItem(draggedItem.index, index);
        draggedItem.index = index;
      }
    },
  });
  
  const getItemStyle = () => {
    let baseStyle = "px-3 py-2 rounded-lg flex items-center text-sm font-medium mr-2 mb-2 ";
    
    if (isDragging) {
      baseStyle += "opacity-50 ";
    }
    
    switch (item.type) {
      case 'field':
        return baseStyle + "bg-blue-100 text-blue-800 border border-blue-300";
      case 'customAttribute':
        return baseStyle + "bg-purple-100 text-purple-800 border border-purple-300";
      case 'operator':
        return baseStyle + "bg-gray-200 text-gray-800 border border-gray-300";
      case 'constant':
        return baseStyle + "bg-green-100 text-green-800 border border-green-300";
      default:
        return baseStyle + "bg-gray-100";
    }
  };
  
  const handleSaveEdit = () => {
    if (editItem && item.type === 'constant') {
      editItem(index, editValue);
    }
    setIsEditing(false);
  };
  
  return (
    <div
      ref={(node) => drag(drop(node))}
      className={getItemStyle()}
      style={{ cursor: 'move' }}
    >
      {item.type === 'constant' && isEditing ? (
        <div className="flex items-center">
          <input
            type="number"
            className="w-20 px-2 py-1 border rounded-md text-sm mr-2"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSaveEdit();
            }}
            className="text-green-600 hover:text-green-800"
          >
            <Save size={14} />
          </button>
        </div>
      ) : (
        <>
          <MoveVertical size={14} className="mr-2 text-gray-500" />
          <span>{item.displayValue || item.value}</span>
          
          {item.type === 'constant' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="ml-2 text-blue-600 hover:text-blue-800"
            >
              <Edit2 size={14} />
            </button>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeItem(index);
            }}
            className="ml-2 text-red-600 hover:text-red-800"
          >
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
};

// Main component
const ProfitFormulaEditor: React.FC = () => {
  // Get product data and custom attributes for the formula
  const { products, getBestSupplierForProduct, customAttributes } = useAppContext();
  
  // Formula storage key for database
  const FORMULA_STORAGE_KEY = 'profit-formula';
  
  // States
  const [formulaItems, setFormulaItems] = useState<FormulaItem[]>([]);
  const [isSaved, setIsSaved] = useState(true);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [showOperatorMenu, setShowOperatorMenu] = useState(false);
  const [showConstantInput, setShowConstantInput] = useState(false);
  const [constantValue, setConstantValue] = useState('0');
  const [isCalculating, setIsCalculating] = useState(false);
  const [dataResults, setDataResults] = useState<ProfitCalculationResult[]>([]);
  const [showResultsTable, setShowResultsTable] = useState(false);
  const [sortField, setSortField] = useState<string>('profit');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Default formula: Sale Price - Amazon Fee - Supplier Cost
  const defaultFormula = [
    { id: '1', type: 'field' as FormulaItemType, value: 'salePrice', displayValue: 'Sale Price' },
    { id: '2', type: 'operator' as FormulaItemType, value: '-', displayValue: '-' },
    { id: '3', type: 'field' as FormulaItemType, value: 'amazonFee', displayValue: 'Amazon Fee' },
    { id: '4', type: 'operator' as FormulaItemType, value: '-', displayValue: '-' },
    { id: '5', type: 'field' as FormulaItemType, value: 'supplierCost', displayValue: 'Supplier Cost' }
  ];
  
  // Load formula from database
  useEffect(() => {
    fetchFormula();
  }, []);
  
  // Fetch formula from database settings
  const fetchFormula = async () => {
    try {
      // Check if formula exists in database
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', FORMULA_STORAGE_KEY)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          // Initialize with default formula
          await saveFormulaToDB(defaultFormula);
          setFormulaItems(defaultFormula);
        } else {
          console.error('Error fetching formula from database:', error);
          // Fall back to default formula
          setFormulaItems(defaultFormula);
        }
      } else if (data?.value) {
        // Load formula from database
        setFormulaItems(data.value as FormulaItem[]);
      } else {
        // Fall back to default formula
        setFormulaItems(defaultFormula);
      }
    } catch (err) {
      console.error('Error loading formula:', err);
      // Fall back to default formula
      setFormulaItems(defaultFormula);
    } finally {
      setIsSaved(true);
    }
  };
  
  // Save formula to database
  const saveFormulaToDB = async (formula: FormulaItem[]) => {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ 
          key: FORMULA_STORAGE_KEY,
          value: formula,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        });
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error saving formula to database:', err);
      throw err;
    }
  };
  
  // Example product for preview
  const [exampleProduct, setExampleProduct] = useState<any | null>(null);
  const [calculationResult] = useState<{
    result: number;
    steps: { description: string; value: number }[];
  } | null>(null);
  
  // Available fields
  const standardFields = [
    { value: 'salePrice', displayValue: 'Sale Price' },
    { value: 'amazonFee', displayValue: 'Amazon Fee' },
    { value: 'referralFee', displayValue: 'Referral Fee' },
    { value: 'supplierCost', displayValue: 'Supplier Cost' },
    { value: 'buyBoxPrice', displayValue: 'Buy Box Price' },
    { value: 'unitsSold', displayValue: 'Units Sold' }
  ];
  
  // Product custom attributes that are numeric
  const numericCustomAttributes = customAttributes
    .filter(attr => attr.forType === 'product' && attr.type === 'Number')
    .map(attr => ({
      value: `attr_${attr.id}`,
      displayValue: attr.name,
      attributeId: attr.id
    }));
  
  // Available operators
  const operators = [
    { value: '+' as OperatorType, displayValue: '+' },
    { value: '-' as OperatorType, displayValue: '-' },
    { value: '*' as OperatorType, displayValue: '×' },
    { value: '/' as OperatorType, displayValue: '÷' },
    { value: '(' as OperatorType, displayValue: '(' },
    { value: ')' as OperatorType, displayValue: ')' }
  ];
  
  // Find an example product with supplier for preview
  useEffect(() => {
    const findExampleProduct = () => {
      const productWithSupplier = products.find(product => {
        const bestSupplier = getBestSupplierForProduct(product.id);
        return bestSupplier !== undefined;
      });
      
      if (productWithSupplier) {
        const bestSupplier = getBestSupplierForProduct(productWithSupplier.id);
        if (bestSupplier) {
          setExampleProduct({
            ...productWithSupplier,
            supplierCost: bestSupplier.cost,
            referralFee: productWithSupplier.referralFee !== undefined ? productWithSupplier.referralFee : 0
          });
        }
      }
    };
    
    findExampleProduct();
  }, [products, getBestSupplierForProduct]);
  
  // Calculate profits for all products based on the current formula
  const calculateAllProductProfits = () => {
    if (formulaItems.length === 0) {
      setFormulaError("No formula available to calculate profit");
      return;
    }
    
    // Validate formula first
    validateFormula();
    if (formulaError) {
      toast.error(`Formula error: ${formulaError}`);
      return;
    }
    
    setIsCalculating(true);
    
    try {
      // Process all products using the formula
      const results: ProfitCalculationResult[] = [];
      
      for (const product of products) {
        try {
          const supplierProduct = getBestSupplierForProduct(product.id);
          if (!supplierProduct) continue; // Skip products without suppliers
          
          // Create a scope with all the values we need for the formula
          const scope: Record<string, number> = {
            salePrice: product.salePrice || 0,
            amazonFee: product.amazonFee || 0,
            buyBoxPrice: product.buyBoxPrice || 0,
            referralFee: product.referralFee || 0,
            supplierCost: supplierProduct.cost || 0
          };
          
          // Add custom numeric attributes to the scope
          const customValues: Record<string, number> = {};
          for (const attr of customAttributes) {
            if (attr.type === 'Number' && attr.forType === 'product') {
              const fieldName = `custom_${attr.name.toLowerCase().replace(/\s+/g, '_')}`;
              const value = (product as any)[fieldName] || 0;
              scope[fieldName] = value;
              customValues[attr.name] = value;
            }
          }
          
          // Calculate profit based on the formula
          const formula = buildFormulaExpression(formulaItems);
          const profit = evaluateFormula(formula, scope);
          
          // Calculate profit margin as a percentage
          const profitMargin = scope.salePrice > 0 ? (profit / scope.salePrice) * 100 : 0;
          
          // Add to results
          results.push({
            productId: product.id,
            productTitle: product.title,
            salePrice: scope.salePrice,
            amazonFee: scope.amazonFee,
            referralFee: scope.referralFee,
            supplierCost: scope.supplierCost,
            customValues,
            profit,
            profitMargin
          });
        } catch (err) {
          console.error(`Error calculating profit for product ${product.id}:`, err);
        }
      }
      
      // Sort the results
      setDataResults(results);
      setShowResultsTable(true);
    } catch (err) {
      console.error('Error calculating profits:', err);
      toast.error('Error calculating profits');
    } finally {
      setIsCalculating(false);
    }
  };
  
  // Sort the results based on the current sort field and direction
  const sortedResults = useMemo(() => {
    if (!dataResults.length) return [];
    
    return [...dataResults].sort((a, b) => {
      let valueA, valueB;
      
      // Handle nested fields
      if (sortField === 'productTitle') {
        valueA = a.productTitle;
        valueB = b.productTitle;
        return sortDirection === 'asc' 
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA);
      } else {
        valueA = a[sortField as keyof ProfitCalculationResult] as number;
        valueB = b[sortField as keyof ProfitCalculationResult] as number;
        return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
      }
    });
  }, [dataResults, sortField, sortDirection]);
  
  // Handle sorting change
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to descending when changing fields
    }
  };
  
  // Calculate average, minimum, and maximum profit
  const profitStats = useMemo(() => {
    if (!dataResults.length) {
      return { avg: 0, min: 0, max: 0, total: 0 };
    }
    
    const profits = dataResults.map(r => r.profit);
    const total = profits.reduce((sum, profit) => sum + profit, 0);
    const avg = total / profits.length;
    const min = Math.min(...profits);
    const max = Math.max(...profits);
    
    return { avg, min, max, total };
  }, [dataResults]);
  
  // Export results to CSV
  const exportToCSV = () => {
    if (!dataResults.length) return;
    
    const headers = [
      'Product Title',
      'Sale Price',
      'Amazon Fee',
      'Referral Fee',
      'Supplier Cost',
      ...Object.keys(dataResults[0].customValues),
      'Profit',
      'Profit Margin (%)'
    ];
    
    const csvRows = [
      headers.join(','),
      ...sortedResults.map(result => {
        const values = [
          `"${result.productTitle.replace(/"/g, '""')}"`,
          result.salePrice.toFixed(2),
          result.amazonFee.toFixed(2),
          result.referralFee.toFixed(2),
          result.supplierCost.toFixed(2),
          ...Object.values(result.customValues).map(v => v.toFixed(2)),
          result.profit.toFixed(2),
          result.profitMargin.toFixed(2)
        ];
        return values.join(',');
      })
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `profit-analysis-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Move formula items (for drag and drop)
  const moveItem = useCallback((dragIndex: number, hoverIndex: number) => {
    setFormulaItems(prevItems => {
      const result = Array.from(prevItems);
      const [removed] = result.splice(dragIndex, 1);
      result.splice(hoverIndex, 0, removed);
      setIsSaved(false);
      return result;
    });
  }, []);
  
  // Add field to formula
  const addField = (field: { value: string; displayValue: string }) => {
    setFormulaItems(prevItems => [
      ...prevItems,
      {
        id: `field-${Date.now()}`,
        type: field.value.startsWith('custom_') ? 'customAttribute' : 'field',
        value: field.value,
        displayValue: field.displayValue
      }
    ]);
    setShowFieldMenu(false);
    setIsSaved(false);
  };
  
  // Add operator to formula
  const addOperator = (operator: { value: OperatorType; displayValue: string }) => {
    setFormulaItems(prevItems => [
      ...prevItems,
      {
        id: `op-${Date.now()}`,
        type: 'operator',
        value: operator.value,
        displayValue: operator.displayValue
      }
    ]);
    setShowOperatorMenu(false);
    setIsSaved(false);
  };
  
  // Add constant to formula
  const addConstant = () => {
    if (constantValue !== '') {
      setFormulaItems(prevItems => [
        ...prevItems,
        {
          id: `const-${Date.now()}`,
          type: 'constant',
          value: constantValue,
          displayValue: constantValue
        }
      ]);
      setConstantValue('0');
      setShowConstantInput(false);
      setIsSaved(false);
    }
  };
  
  // Remove item from formula
  const removeItem = (index: number) => {
    setFormulaItems(prevItems => prevItems.filter((_, i) => i !== index));
    setIsSaved(false);
  };
  
  // Edit item in formula
  const editItem = (index: number, newValue: string) => {
    setFormulaItems(prevItems => {
      const newItems = [...prevItems];
      if (newItems[index]) {
        newItems[index] = { ...newItems[index], value: newValue, displayValue: newValue };
      }
      return newItems;
    });
    setIsSaved(false);
  };
  
  // Save formula to database
  const saveFormula = async () => {
    try {
      setIsSaved(false);
      
      const success = await saveFormulaToDB(formulaItems);
      
      if (success) {
        setIsSaved(true);
        toast.success('Formula saved');
      }
    } catch (error) {
      toast.error('Failed to save formula');
      console.error('Error saving formula:', error);
    }
  };
  
  // Reset formula to default
  const resetFormula = () => {
    if (window.confirm('Are you sure you want to reset the formula to default?')) {
      setFormulaItems(defaultFormula);
      saveFormulaToDB(defaultFormula)
        .then(() => {
          setIsSaved(true);
          setFormulaError(null);
          toast.success('Formula reset to default');
        })
        .catch(error => {
          toast.error('Failed to reset formula');
          console.error('Error resetting formula:', error);
        });
    }
  };
  
  // Validate formula syntax
  const validateFormula = () => {
    // Simple validation for now
    if (formulaItems.length === 0) {
      setFormulaError('Formula cannot be empty');
      return;
    }
    
    // Check for balanced parentheses
    let parenCount = 0;
    formulaItems.forEach(item => {
      if (item.value === '(') parenCount++;
      if (item.value === ')') parenCount--;
      if (parenCount < 0) {
        setFormulaError('Unbalanced parentheses');
        return;
      }
    });
    
    if (parenCount !== 0) {
      setFormulaError('Unbalanced parentheses');
      return;
    }
    
    // Check for consecutive operators
    let hasConsecutiveOperators = false;
    for (let i = 0; i < formulaItems.length - 1; i++) {
      if (formulaItems[i].type === 'operator' && 
          formulaItems[i+1].type === 'operator' &&
          formulaItems[i].value !== '(' && 
          formulaItems[i+1].value !== ')') {
        hasConsecutiveOperators = true;
        break;
      }
    }
    
    if (hasConsecutiveOperators) {
      setFormulaError('Formula contains consecutive operators');
      return;
    }
    
    // Clear error if all checks pass
    setFormulaError(null);
  };
  
  // Update localStorage when formula changes
  useEffect(() => {
    if (formulaItems.length > 0) {
      setIsSaved(false);
      // Validate formula on change
      validateFormula();
    }
  }, [formulaItems]);
  
  // Helper function to build a formula expression string
  const buildFormulaExpression = (items: FormulaItem[]): string => {
    let expression = '';
    
    items.forEach(item => {
      if (item.type === 'field' || item.type === 'customAttribute') {
        // Sanitize field names for the formula
        const fieldName = item.value.replace(/[^a-zA-Z0-9_]/g, '');
        expression += `scope.${fieldName}`;
      } else if (item.type === 'operator') {
        expression += item.value;
      } else if (item.type === 'constant') {
        // Ensure constants are treated as numbers
        expression += parseFloat(item.value);
      }
    });
    
    return expression;
  };
  
  // Helper function to safely evaluate a formula
  const evaluateFormula = (formula: string, scope: Record<string, number>): number => {
    try {
      // Using Function constructor instead of eval for better security isolation
      // This creates a function that only has access to the scope object
      const calculatedValue = new Function('scope', `return ${formula}`)(scope);
      
      // Ensure the result is a number
      if (typeof calculatedValue !== 'number' || isNaN(calculatedValue)) {
        throw new Error('Formula did not evaluate to a valid number');
      }
      
      return calculatedValue;
    } catch (error) {
      console.error('Error evaluating formula:', error);
      throw new Error('Failed to calculate formula');
    }
  };
  
  return (
    <DndProvider backend={HTML5Backend}>
      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-semibold">Profit Calculation Formula</h3>
            <p className="text-gray-600">Create a custom formula to calculate profit for your products.</p>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="secondary" 
              onClick={resetFormula} 
              className="flex items-center"
            >
              <AlertCircle size={16} className="mr-1" /> Reset
            </Button>
            <Button 
              onClick={saveFormula} 
              disabled={isSaved || !!formulaError}
              className="flex items-center"
            >
              <Save size={16} className="mr-1" /> {isSaved ? 'Saved' : 'Save Formula'}
            </Button>
          </div>
        </div>
        
        {formulaError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
            <AlertCircle size={18} className="mr-2" />
            {formulaError}
          </div>
        )}
        
        <div className="bg-gray-50 p-4 rounded mb-6 border border-gray-200">
          <h4 className="font-medium mb-3 flex items-center">
            <Calculator size={18} className="mr-2 text-blue-600" />
            Current Formula
          </h4>
          
          <div className="flex flex-wrap min-h-16 p-3 bg-white rounded border border-gray-300 mb-4">
            {formulaItems.length > 0 ? (
              formulaItems.map((item, index) => (
                <FormulaItemComponent
                  key={item.id}
                  item={item}
                  index={index}
                  moveItem={moveItem}
                  removeItem={removeItem}
                  editItem={editItem}
                />
              ))
            ) : (
              <div className="text-gray-500 italic">Your formula will appear here. Add fields, operators, and constants below.</div>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative">
              <Button 
                variant="secondary" 
                className="flex items-center" 
                onClick={() => {
                  setShowFieldMenu(!showFieldMenu);
                  setShowOperatorMenu(false);
                  setShowConstantInput(false);
                }}
              >
                <PlusCircle size={16} className="mr-1" /> Add Field
              </Button>
              
              {showFieldMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-gray-200 z-10 w-64">
                  <div className="p-2 border-b border-gray-200 bg-gray-50">
                    <h5 className="font-medium">Standard Fields</h5>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {standardFields.map(field => (
                      <button
                        key={field.value}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center"
                        onClick={() => addField(field)}
                      >
                        <span className="w-8 h-5 bg-blue-100 rounded-sm mr-2 inline-block"></span>
                        {field.displayValue}
                      </button>
                    ))}
                    
                    {numericCustomAttributes.length > 0 && (
                      <>
                        <div className="p-2 border-b border-t border-gray-200 bg-gray-50">
                          <h5 className="font-medium">Custom Attributes</h5>
                        </div>
                        {numericCustomAttributes.map(attr => (
                          <button
                            key={attr.value}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center"
                            onClick={() => addField(attr)}
                          >
                            <span className="w-8 h-5 bg-purple-100 rounded-sm mr-2 inline-block"></span>
                            {attr.displayValue}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="relative">
              <Button 
                variant="secondary" 
                className="flex items-center" 
                onClick={() => {
                  setShowOperatorMenu(!showOperatorMenu);
                  setShowFieldMenu(false);
                  setShowConstantInput(false);
                }}
              >
                <PlusCircle size={16} className="mr-1" /> Add Operator
              </Button>
              
              {showOperatorMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-gray-200 z-10 w-48">
                  <div className="p-2 border-b border-gray-200 bg-gray-50">
                    <h5 className="font-medium">Operators</h5>
                  </div>
                  <div>
                    {operators.map(operator => (
                      <button
                        key={operator.value}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center"
                        onClick={() => addOperator(operator)}
                      >
                        <span className="w-8 h-5 bg-gray-200 rounded-sm mr-2 flex items-center justify-center font-bold">
                          {operator.displayValue}
                        </span>
                        {operator.value === '+' && 'Addition'}
                        {operator.value === '-' && 'Subtraction'}
                        {operator.value === '*' && 'Multiplication'}
                        {operator.value === '/' && 'Division'}
                        {operator.value === '(' && 'Open Parenthesis'}
                        {operator.value === ')' && 'Close Parenthesis'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="relative">
              <Button 
                variant="secondary" 
                className="flex items-center" 
                onClick={() => {
                  setShowConstantInput(!showConstantInput);
                  setShowFieldMenu(false);
                  setShowOperatorMenu(false);
                }}
              >
                <PlusCircle size={16} className="mr-1" /> Add Constant
              </Button>
              
              {showConstantInput && (
                <div className="absolute left-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-gray-200 z-10 w-64 p-3">
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      className="border border-gray-300 rounded p-2 flex-grow"
                      value={constantValue}
                      onChange={(e) => setConstantValue(e.target.value)}
                      placeholder="Enter a number"
                      autoFocus
                    />
                    <Button onClick={addConstant}>Add</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="text-sm text-gray-600 flex items-start">
            <Info size={16} className="mr-1 mt-0.5 flex-shrink-0" />
            <div>
              <p className="mb-1">Create your formula by adding fields, operators, and constants. Drag items to rearrange them.</p>
              <p>Example: (Sale Price - Amazon Fee - Supplier Cost) * 0.9</p>
            </div>
          </div>
        </div>
        
        {calculationResult && exampleProduct && (
          <div className="border-t pt-4 mt-4">
            <h4 className="font-semibold mb-3 flex items-center">
              <Calculator size={18} className="mr-2 text-green-600" />
              Example Calculation
            </h4>
            <p className="mb-2 text-sm">
              Using product: <span className="font-medium">{exampleProduct.title}</span>
            </p>
            
            <div className="bg-gray-50 p-4 rounded mb-4 border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="font-medium mb-2">Values Used</h5>
                  {calculationResult.steps.slice(0, -1).map((step, index) => (
                    <div key={index} className="flex justify-between py-1 border-b">
                      <span>{step.description}:</span>
                      <span className="font-medium">${step.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                
                <div>
                  <h5 className="font-medium mb-2">Formula Result</h5>
                  <div className="bg-green-50 p-4 rounded border border-green-200">
                    <div className="mb-3">
                      <div className="text-sm mb-1">Your Formula:</div>
                      <div className="font-medium">
                        {formulaItems.map(item => item.displayValue).join(' ')}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-t border-green-200">
                      <span className="font-medium">Net Profit:</span>
                      <span className="text-lg font-bold text-green-700">
                        ${calculationResult.result.toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-t border-green-200">
                      <span className="font-medium">Profit Margin:</span>
                      <span className="text-lg font-bold text-green-700">
                        {((calculationResult.result / exampleProduct.salePrice) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Database Calculation Button */}
        <div className="border-t pt-4 mt-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold flex items-center">
              <Calculator size={18} className="mr-2 text-blue-600" />
              Real Data Calculations
            </h4>
            <Button 
              onClick={calculateAllProductProfits} 
              disabled={isCalculating || !!formulaError}
              className="flex items-center"
            >
              {isCalculating ? (
                <>Calculating...</>
              ) : (
                <>
                  <Calculator size={16} className="mr-1" /> 
                  Calculate All Products
                </>
              )}
            </Button>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            Apply the formula to all your products to see real profit calculations based on your database data.
          </p>
        </div>
        
        {/* Results Table */}
        {showResultsTable && dataResults.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold">Profit Analysis Results</h4>
              <Button 
                variant="secondary" 
                onClick={exportToCSV}
                className="flex items-center"
              >
                <Download size={16} className="mr-1" /> Export CSV
              </Button>
            </div>
            
            {/* Profit Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-blue-50 p-3 rounded border border-blue-100">
                <div className="text-sm text-blue-700 font-medium">Average Profit</div>
                <div className="text-xl font-bold">${profitStats.avg.toFixed(2)}</div>
              </div>
              <div className="bg-red-50 p-3 rounded border border-red-100">
                <div className="text-sm text-red-700 font-medium">Minimum Profit</div>
                <div className="text-xl font-bold">${profitStats.min.toFixed(2)}</div>
              </div>
              <div className="bg-green-50 p-3 rounded border border-green-100">
                <div className="text-sm text-green-700 font-medium">Maximum Profit</div>
                <div className="text-xl font-bold">${profitStats.max.toFixed(2)}</div>
              </div>
              <div className="bg-purple-50 p-3 rounded border border-purple-100">
                <div className="text-sm text-purple-700 font-medium">Total Profit</div>
                <div className="text-xl font-bold">${profitStats.total.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="bg-white rounded border overflow-x-auto max-h-96">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th 
                      className={`px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer ${sortField === 'productTitle' ? 'bg-gray-100' : ''}`}
                      onClick={() => handleSort('productTitle')}
                    >
                      Product
                      {sortField === 'productTitle' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className={`px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer ${sortField === 'salePrice' ? 'bg-gray-100' : ''}`}
                      onClick={() => handleSort('salePrice')}
                    >
                      Sale Price
                      {sortField === 'salePrice' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className={`px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer ${sortField === 'amazonFee' ? 'bg-gray-100' : ''}`}
                      onClick={() => handleSort('amazonFee')}
                    >
                      Amazon Fee
                      {sortField === 'amazonFee' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className={`px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer ${sortField === 'referralFee' ? 'bg-gray-100' : ''}`}
                      onClick={() => handleSort('referralFee')}
                    >
                      Referral Fee
                      {sortField === 'referralFee' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className={`px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer ${sortField === 'supplierCost' ? 'bg-gray-100' : ''}`}
                      onClick={() => handleSort('supplierCost')}
                    >
                      Supplier Cost
                      {sortField === 'supplierCost' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    {/* Custom attributes columns */}
                    {Object.keys(dataResults[0]?.customValues || {}).map(attrName => (
                      <th key={attrName} className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                        {attrName}
                      </th>
                    ))}
                    <th 
                      className={`px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer ${sortField === 'profit' ? 'bg-gray-100' : ''}`}
                      onClick={() => handleSort('profit')}
                    >
                      Profit
                      {sortField === 'profit' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className={`px-4 py-2 text-left text-sm font-medium text-gray-500 cursor-pointer ${sortField === 'profitMargin' ? 'bg-gray-100' : ''}`}
                      onClick={() => handleSort('profitMargin')}
                    >
                      Margin %
                      {sortField === 'profitMargin' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map(result => (
                    <tr key={result.productId} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="truncate max-w-xs">{result.productTitle}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-900">${result.salePrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-red-600">${result.amazonFee.toFixed(2)}</td>
                      <td className="px-4 py-2 text-red-600">${result.referralFee.toFixed(2)}</td>
                      <td className="px-4 py-2 text-red-600">${result.supplierCost.toFixed(2)}</td>
                      {/* Custom attribute values */}
                      {Object.values(result.customValues).map((value, idx) => (
                        <td key={idx} className="px-4 py-2 text-gray-600">
                          ${(value as number).toFixed(2)}
                        </td>
                      ))}
                      <td className={`px-4 py-2 font-medium ${result.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${result.profit.toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 font-medium ${result.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {result.profitMargin.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="text-sm text-gray-500 mt-2">
              Showing {sortedResults.length} products. Click column headers to sort.
            </div>
          </div>
        )}
        
        <div className="border-t pt-4 mt-6">
          <h4 className="font-medium mb-2 flex items-center">
            <HelpCircle size={16} className="mr-2 text-blue-600" />
            Formula Tips
          </h4>
          <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
            <li>Drag items to reorder them in your formula</li>
            <li>Click the X to remove an item from the formula</li>
            <li>Click the pencil icon to edit constant values</li>
            <li>Use parentheses to control the order of operations</li>
            <li>Save your formula to see it applied across all reports</li>
          </ul>
        </div>
      </Card>
    </DndProvider>
  );
};

export default ProfitFormulaEditor;