/*
  # Add unique constraint to suppliers table

  1. Changes
    - Add unique constraint to 'name' column in suppliers table
    - This enables upsert operations based on supplier name

  2. Security
    - No security changes required
*/

-- Add unique constraint to suppliers table for the name column
ALTER TABLE suppliers 
ADD CONSTRAINT suppliers_name_key UNIQUE (name);