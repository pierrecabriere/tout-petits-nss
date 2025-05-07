-- Create the metric_data_status enum type
CREATE TYPE metric_data_status AS ENUM ('public', 'private', 'draft');

-- Add the status column to the metric_data table
ALTER TABLE public.metric_data
ADD COLUMN status metric_data_status NOT NULL DEFAULT 'public';