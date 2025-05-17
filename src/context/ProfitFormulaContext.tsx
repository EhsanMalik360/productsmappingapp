import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabaseClient } from '../utils/supabaseClient';

// Types
export type OperatorType = '+' | '-' | '*' | '/' | '(' | ')';
export type FormulaItemType = 'field' | 'customAttribute' | 'operator' | 'constant';

export interface FormulaItem {
  id: string;
  type: FormulaItemType;
  value: string;
  displayValue?: string;
}

export interface ProfitFormulaData {
  id: string;
  name: string;
  formula_items: FormulaItem[];
  is_default: boolean;
  user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Storage key for localStorage (kept for backward compatibility)
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
  currentFormulaId: string | null;
}

// Create context
const ProfitFormulaContext = createContext<ProfitFormulaContextType | undefined>(undefined);

// Provider component
export const ProfitFormulaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for formula items
  const [formulaItems, setFormulaItems] = useState<FormulaItem[]>(DEFAULT_FORMULA);
  // Store the ID of the current formula (if it exists in the database)
  const [currentFormulaId, setCurrentFormulaId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  
  // Load formula from Supabase
  useEffect(() => {
    const fetchFormula = async () => {
      try {
        // Try to fetch from Supabase first
        const { data, error } = await supabaseClient
          .from('profit_formulas')
          .select('*')
          .order('is_default', { ascending: false })
          .limit(1)
          .single();
        
        if (error) {
          console.error('Error fetching profit formula:', error);
          throw error;
        }
        
        if (data) {
          // Use the formula from Supabase
          setFormulaItems(data.formula_items);
          setCurrentFormulaId(data.id);
          setIsSaved(true);
          return;
        }
      } catch (error) {
        console.error('Error fetching from Supabase, falling back to localStorage:', error);
        
        // Fallback to localStorage if Supabase fails
        const savedFormula = localStorage.getItem(FORMULA_STORAGE_KEY);
        if (savedFormula) {
          try {
            setFormulaItems(JSON.parse(savedFormula));
          } catch (e) {
            console.error('Failed to parse saved formula', e);
            setFormulaItems(DEFAULT_FORMULA);
          }
        }
      }
    };
    
    fetchFormula();
  }, []);
  
  // Update isSaved state when formula changes
  useEffect(() => {
    setIsSaved(false);
  }, [formulaItems]);
  
  // Save formula to Supabase
  const saveFormula = async () => {
    try {
      // Create formula name from the first few items
      const formulaName = formulaItems
        .filter(item => item.type !== 'operator')
        .slice(0, 3)
        .map(item => item.displayValue || item.value)
        .join(' ');
      
      // Save to localStorage as backup
      localStorage.setItem(FORMULA_STORAGE_KEY, JSON.stringify(formulaItems));
      
      // Get user session
      const { data: { session } } = await supabaseClient.auth.getSession();
      
      // Prepare data for Supabase
      const formulaData: Partial<ProfitFormulaData> = {
        name: formulaName,
        formula_items: formulaItems,
        is_default: true
      };
      
      if (session?.user?.id) {
        formulaData.user_id = session.user.id;
      }
      
      let result;
      
      if (currentFormulaId) {
        // Update existing formula
        result = await supabaseClient
          .from('profit_formulas')
          .update(formulaData)
          .eq('id', currentFormulaId)
          .select()
          .single();
      } else {
        // Create new formula
        result = await supabaseClient
          .from('profit_formulas')
          .insert(formulaData)
          .select()
          .single();
      }
      
      if (result.error) {
        throw result.error;
      }
      
      setCurrentFormulaId(result.data.id);
      setIsSaved(true);
      console.log('Formula saved successfully');
    } catch (error) {
      console.error('Error saving formula:', error);
    }
  };
  
  // Reset formula to default
  const resetFormula = async () => {
    if (window.confirm('Are you sure you want to reset the formula to default?')) {
      // Reset state
      setFormulaItems(DEFAULT_FORMULA);
      setIsSaved(false);
      
      // If we have a current formula ID, update it
      if (currentFormulaId) {
        try {
          const result = await supabaseClient
            .from('profit_formulas')
            .update({ 
              formula_items: DEFAULT_FORMULA,
              name: 'Default Profit Formula',
              is_default: true
            })
            .eq('id', currentFormulaId)
            .select();
            
          if (result.error) {
            throw result.error;
          }
          
          setIsSaved(true);
        } catch (error) {
          console.error('Error resetting formula:', error);
        }
      }
      
      // Clear localStorage
      localStorage.removeItem(FORMULA_STORAGE_KEY);
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
        currentFormulaId
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