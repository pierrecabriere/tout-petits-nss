-- Create the processing_status enum type
CREATE TYPE file_processing_status AS ENUM ('pending', 'processing', 'completed', 'error');

-- Add the processing_status column to the files table
ALTER TABLE public.files
ADD COLUMN processing_status file_processing_status NOT NULL DEFAULT 'pending';
