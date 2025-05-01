/*
  # Fix Product Import RLS Policies

  1. Changes
    - Update RLS policies for products table to properly handle imports
    - Add policy for upsert operations
    - Ensure authenticated users can perform imports

  2. Security
    - Maintains RLS enabled on products table
    - Adds specific policy for upsert operations
    - Ensures only authenticated users can perform imports
*/

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Allow authenticated users to insert products" ON "public"."products";
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON "public"."products";

-- Create new unified insert policy that handles both regular inserts and upserts
CREATE POLICY "Allow authenticated users to insert and upsert products"
ON "public"."products"
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Update policy for updates to handle upserts properly
DROP POLICY IF EXISTS "Allow authenticated users to update products" ON "public"."products";

CREATE POLICY "Allow authenticated users to update products"
ON "public"."products"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);