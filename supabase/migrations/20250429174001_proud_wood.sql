/*
  # Fix RLS policies for product imports

  1. Changes
    - Update RLS policies on products table to properly handle imports
    - Ensure authenticated users can perform upserts during import
    - Maintain security while allowing bulk operations

  2. Security
    - Maintains RLS enabled on products table
    - Updates policies to properly handle upsert operations
    - Ensures only authenticated users can perform imports
*/

-- First drop existing policies
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON "public"."products";
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON "public"."products";
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON "public"."products";
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON "public"."products";

-- Create new policies with proper upsert support
CREATE POLICY "Enable read access for authenticated users" 
ON "public"."products"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert access for authenticated users" 
ON "public"."products"
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" 
ON "public"."products"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users" 
ON "public"."products"
FOR DELETE
TO authenticated
USING (true);