-- Create a function that will be called by the trigger
CREATE OR REPLACE FUNCTION public.handle_new_file()
RETURNS TRIGGER AS $$
DECLARE
  result RECORD;
BEGIN
  -- Set initial processing status
  NEW.metadata = jsonb_set(
    COALESCE(NEW.metadata, '{}'::jsonb),
    '{processing_status}',
    '"pending"'
  );

  -- Insert the updated record first
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger that runs before insert
CREATE TRIGGER before_file_insert
BEFORE INSERT ON public.files
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_file();

-- Create a function to process new files after they are inserted
CREATE OR REPLACE FUNCTION public.process_new_file()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the Edge Function to process the file
  -- This uses pg_net to make an HTTP request to our Edge Function
  PERFORM
    net.http_post(
      url := CONCAT(current_setting('app.supabase_url'), '/functions/v1/process-spreadsheet'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CONCAT('Bearer ', current_setting('app.supabase_service_role_key'))
      ),
      body := jsonb_build_object(
        'fileId', NEW.id,
        'filePath', NEW.path,
        'fileName', NEW.filename,
        'metadata', NEW.metadata
      )
    );

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger that runs after insert
CREATE TRIGGER after_file_insert
AFTER INSERT ON public.files
FOR EACH ROW
EXECUTE FUNCTION public.process_new_file();

-- Add pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- Add supabase_url and service_role_key settings if they don't exist
DO $$
BEGIN
  -- Only add if they don't exist
  BEGIN
    PERFORM current_setting('app.supabase_url');
  EXCEPTION
    WHEN undefined_object THEN
      PERFORM set_config('app.supabase_url', 'https://your-project-ref.supabase.co', false);
  END;

  BEGIN
    PERFORM current_setting('app.supabase_service_role_key');
  EXCEPTION
    WHEN undefined_object THEN
      PERFORM set_config('app.supabase_service_role_key', 'your-service-role-key', false);
  END;
END;
$$;