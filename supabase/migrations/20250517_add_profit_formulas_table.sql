-- Create profit_formulas table
CREATE TABLE IF NOT EXISTS profit_formulas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL DEFAULT 'Custom Formula',
    formula_items JSONB NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_profit_formulas_user ON profit_formulas(user_id);
CREATE INDEX IF NOT EXISTS idx_profit_formulas_default ON profit_formulas(is_default);

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_profit_formula_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update timestamp
CREATE TRIGGER set_profit_formula_timestamp
BEFORE UPDATE ON profit_formulas
FOR EACH ROW
EXECUTE FUNCTION update_profit_formula_timestamp();

-- Set permissions for authenticated users
ALTER TABLE profit_formulas ENABLE ROW LEVEL SECURITY;

-- Policy for selecting formulas (users can see their own or default formulas)
CREATE POLICY select_profit_formulas ON profit_formulas
    FOR SELECT USING (
        auth.uid() = user_id OR is_default = TRUE
    );

-- Policy for inserting formulas (authenticated users can insert)
CREATE POLICY insert_profit_formulas ON profit_formulas
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR auth.uid() IS NOT NULL
    );

-- Policy for updating formulas (users can only update their own)
CREATE POLICY update_profit_formulas ON profit_formulas
    FOR UPDATE USING (
        auth.uid() = user_id
    );

-- Policy for deleting formulas (users can only delete their own)
CREATE POLICY delete_profit_formulas ON profit_formulas
    FOR DELETE USING (
        auth.uid() = user_id
    );

-- Insert default profit formula
INSERT INTO profit_formulas (name, formula_items, is_default)
VALUES (
    'Default Profit Formula',
    '[
        {"id": "1", "type": "field", "value": "salePrice", "displayValue": "Sale Price"},
        {"id": "2", "type": "operator", "value": "-", "displayValue": "-"},
        {"id": "3", "type": "field", "value": "amazonFee", "displayValue": "Amazon Fee"},
        {"id": "4", "type": "operator", "value": "-", "displayValue": "-"},
        {"id": "5", "type": "field", "value": "supplierCost", "displayValue": "Supplier Cost"}
    ]'::jsonb,
    TRUE
); 