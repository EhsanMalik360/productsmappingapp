import React, { createContext, useContext, useState, useEffect } from 'react';

// Types
export type OperatorType = '+' | '-' | '*' | '/' | '(' | ')';
export type FormulaItemType = 'field' | 'customAttribute' | 'operator' | 'constant';

export interface FormulaItem {
  id: string;
  type: FormulaItemType;
  value: string;
  displayValue?: string;
}

// Storage key for localStorage
export const FORMULA_STORAGE_KEY = 'profit-formula-items';

// Default profit formula
export const DEFAULT_FORMULA: FormulaItem[] = [
  { id: '1', type: 'field', value: 'salePrice', displayValue: 'Sale Price' },
  { id: '2', type: 'operator', value: '-', displayValue: '-' },
  { id: '3', type: 'field', value: 'amazonFee', displayValue: 'Amazon Fee' },
  { id: '4', type: 'operator', value: '-', displayValue: '-' },
  { id: '5', type: 'field', value: 'supplierCost', displayValue: 'Supplier Cost' }
];

// Context type
interface ProfitFormulaContextType {
  formulaItems: FormulaItem[];
  setFormulaItems: React.Dispatch<React.SetStateAction<FormulaItem[]>>;
  isSaved: boolean;
  saveFormula: () => void;
  resetFormula: () => void;
  evaluateFormula: (values: Record<string, number>) => number;
}

// Create context
const ProfitFormulaContext = createContext<ProfitFormulaContextType | undefined>(undefined);

// Provider component
export const ProfitFormulaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load formula from localStorage
  const [formulaItems, setFormulaItems] = useState<FormulaItem[]>(() => {
    const savedFormula = localStorage.getItem(FORMULA_STORAGE_KEY);
    if (savedFormula) {
      try {
        return JSON.parse(savedFormula);
      } catch (e) {
        console.error('Failed to parse saved formula', e);
      }
    }
    
    // Return default formula if nothing found
    return DEFAULT_FORMULA;
  });
  
  const [isSaved, setIsSaved] = useState(true);
  
  // Update isSaved state when formula changes
  useEffect(() => {
    setIsSaved(false);
  }, [formulaItems]);
  
  // Save formula to localStorage
  const saveFormula = () => {
    localStorage.setItem(FORMULA_STORAGE_KEY, JSON.stringify(formulaItems));
    setIsSaved(true);
  };
  
  // Reset formula to default
  const resetFormula = () => {
    if (window.confirm('Are you sure you want to reset the formula to default?')) {
      setFormulaItems(DEFAULT_FORMULA);
      localStorage.setItem(FORMULA_STORAGE_KEY, JSON.stringify(DEFAULT_FORMULA));
      setIsSaved(true);
    }
  };
  
  // Evaluate formula with given values
  const evaluateFormula = (values: Record<string, number>): number => {
    if (formulaItems.length === 0) {
      return 0;
    }
    
    try {
      // Build formula string for evaluation
      let formulaStr = '';
      formulaItems.forEach(item => {
        if (item.type === 'field' || item.type === 'customAttribute') {
          formulaStr += values[item.value] || 0;
        } else if (item.type === 'operator') {
          formulaStr += item.value;
        } else if (item.type === 'constant') {
          formulaStr += item.value;
        }
      });
      
      // Evaluate the formula
      // eslint-disable-next-line no-eval
      return eval(formulaStr);
    } catch (error) {
      console.error('Error evaluating formula:', error);
      return 0;
    }
  };
  
  return (
    <ProfitFormulaContext.Provider
      value={{
        formulaItems,
        setFormulaItems,
        isSaved,
        saveFormula,
        resetFormula,
        evaluateFormula
      }}
    >
      {children}
    </ProfitFormulaContext.Provider>
  );
};

// Custom hook to use the context
export const useProfitFormula = () => {
  const context = useContext(ProfitFormulaContext);
  if (context === undefined) {
    throw new Error('useProfitFormula must be used within a ProfitFormulaProvider');
  }
  return context;
}; 