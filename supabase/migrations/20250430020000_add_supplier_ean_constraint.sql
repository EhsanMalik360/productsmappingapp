-- Add supplier_id + ean unique constraint for supplier_products
-- This helps with the upsert operation in bulk imports

-- First make sure ean field exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'supplier_products' AND column_name = 'ean'
    ) THEN
        ALTER TABLE supplier_products ADD COLUMN ean text;
    END IF;

    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'supplier_products' AND column_name = 'product_name'
    ) THEN
        ALTER TABLE supplier_products ADD COLUMN product_name text;
    END IF;

    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'supplier_products' AND column_name = 'mpn'
    ) THEN
        ALTER TABLE supplier_products ADD COLUMN mpn text;
    END IF;

    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'supplier_products' AND column_name = 'supplier_stock'
    ) THEN
        ALTER TABLE supplier_products ADD COLUMN supplier_stock integer DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'supplier_products' AND column_name = 'brand'
    ) THEN
        ALTER TABLE supplier_products ADD COLUMN brand text;
    END IF;

    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'supplier_products' AND column_name = 'match_method'
    ) THEN
        ALTER TABLE supplier_products ADD COLUMN match_method text DEFAULT 'none';
    END IF;
END $$;

-- Add unique constraint for supplier_id + ean (only for non-null EANs)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'supplier_products_supplier_id_ean_key'
    ) THEN
        -- Create partial unique constraint that only applies when ean is not null
        ALTER TABLE supplier_products 
        ADD CONSTRAINT supplier_products_supplier_id_ean_key 
        UNIQUE (supplier_id, ean) 
        WHERE ean IS NOT NULL AND ean != '';
    END IF;
END $$; 