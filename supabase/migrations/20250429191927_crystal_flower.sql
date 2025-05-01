/*
  # Add import history tracking

  1. New Tables
    - `import_history`
      - `id` (uuid, primary key)
      - `type` (text) - Type of import (Amazon/Supplier)
      - `file_name` (text)
      - `status` (text)
      - `total_records` (integer)
      - `successful_records` (integer)
      - `failed_records` (integer)
      - `error_message` (text)
      - `created_at` (timestamptz)
      - `created_by` (uuid) - Reference to auth.users
      
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create import_history table
CREATE TABLE import_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('Amazon Data', 'Supplier Data')),
  file_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('Completed', 'Failed', 'In Progress')),
  total_records integer NOT NULL DEFAULT 0,
  successful_records integer NOT NULL DEFAULT 0,
  failed_records integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own import history"
  ON import_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own import history"
  ON import_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);