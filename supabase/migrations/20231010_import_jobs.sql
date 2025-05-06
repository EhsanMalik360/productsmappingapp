-- Create a table for tracking import jobs
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('supplier', 'product')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    status_message TEXT,
    progress INTEGER DEFAULT 0,
    field_mapping JSONB,
    match_options JSONB,
    batch_size INTEGER DEFAULT 100,
    total_rows INTEGER,
    results JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Add appropriate indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_type ON import_jobs(type);

-- Add RLS policies
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own import jobs
CREATE POLICY view_own_import_jobs ON import_jobs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own import jobs (especially for cancellation)
CREATE POLICY update_own_import_jobs ON import_jobs
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Only service role can insert or delete import jobs
CREATE POLICY service_manage_import_jobs ON import_jobs
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Insert triggers for capturing events
CREATE OR REPLACE FUNCTION on_import_job_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        -- Set started_at when job begins processing
        IF NEW.status = 'processing' AND OLD.status = 'pending' THEN
            NEW.started_at = now();
        END IF;
        
        -- Set completed_at when job finishes
        IF (NEW.status = 'completed' OR NEW.status = 'failed') AND 
           (OLD.status = 'processing' OR OLD.status = 'pending') THEN
            NEW.completed_at = now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER import_job_status_change
    BEFORE UPDATE ON import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION on_import_job_status_change(); 