import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';

// Types
export type OperatorType = '+' | '-' | '*' | '/' | '(' | ')';
export type FormulaItemType = 'field' | 'customAttribute' | 'operator' | 'constant';

export interface FormulaItem {
  id: string;
  type: FormulaItemType;
  value: string;
  displayValue?: string;
}

// Storage key for database
export const FORMULA_STORAGE_KEY = 'profit-formula';

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
  saveFormula: () => Promise<void>;
  resetFormula: () => Promise<void>;
  evaluateFormula: (values: Record<string, number>) => number;
  isLoading: boolean;
}

// Create context
const ProfitFormulaContext = createContext<ProfitFormulaContextType | undefined>(undefined);

// Provider component
export const ProfitFormulaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for formula
  const [formulaItems, setFormulaItems] = useState<FormulaItem[]>(DEFAULT_FORMULA);
  const [isSaved, setIsSaved] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load formula from database
  useEffect(() => {
    fetchFormula();
  }, []);
  
  // Fetch formula from database
  const fetchFormula = async () => {
    try {
      setIsLoading(true);
      
      // Check if formula exists in database
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', FORMULA_STORAGE_KEY);
      
      if (error) {
        console.error('Error fetching formula from database:', error);
        // Fall back to default formula
        setFormulaItems(DEFAULT_FORMULA);
        return;
      }
      
      // If we got data but it's empty or not an array
      if (!data || !Array.isArray(data) || data.length === 0) {
        // Initialize with default formula
        await saveFormulaToDB(DEFAULT_FORMULA);
        setFormulaItems(DEFAULT_FORMULA);
      } else {
        // Load formula from database (first matching record)
        setFormulaItems(data[0].value as FormulaItem[]);
      }
    } catch (err) {
      console.error('Error loading formula:', err);
      // Fall back to default formula
      setFormulaItems(DEFAULT_FORMULA);
    } finally {
      setIsLoading(false);
      setIsSaved(true);
    }
  };
  
  // Save formula to database
  const saveFormulaToDB = async (formula: FormulaItem[]) => {
    try {
      // First check if the record exists
      const { data, error: fetchError } = await supabase
        .from('settings')
        .select('*')
        .eq('key', FORMULA_STORAGE_KEY);
      
      if (fetchError) {
        throw fetchError;
      }
      
      let error;
      
      if (data && data.length > 0) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('settings')
          .update({ 
            value: formula,
            updated_at: new Date().toISOString()
          })
          .eq('key', FORMULA_STORAGE_KEY);
          
        error = updateError;
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('settings')
          .insert({ 
            key: FORMULA_STORAGE_KEY,
            value: formula,
            updated_at: new Date().toISOString()
          });
          
        error = insertError;
      }
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error saving formula to database:', err);
      throw err;
    }
  };

  // Update isSaved state when formula changes
  useEffect(() => {
    if (!isLoading) {
      setIsSaved(false);
    }
  }, [formulaItems, isLoading]);
  
  // Save formula to database
  const saveFormula = async () => {
    try {
      await saveFormulaToDB(formulaItems);
      setIsSaved(true);
      toast.success('Formula saved');
    } catch (error) {
      console.error('Error saving formula:', error);
      toast.error('Failed to save formula');
    }
  };
  
  // Reset formula to default
  const resetFormula = async () => {
    if (window.confirm('Are you sure you want to reset the formula to default?')) {
      try {
        setFormulaItems(DEFAULT_FORMULA);
        await saveFormulaToDB(DEFAULT_FORMULA);
        setIsSaved(true);
        toast.success('Formula reset to default');
      } catch (error) {
        console.error('Error resetting formula:', error);
        toast.error('Failed to reset formula');
      }
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
        evaluateFormula,
        isLoading
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