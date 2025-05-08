-- Create a function to process new files after they are inserted
CREATE OR REPLACE FUNCTION public.process_new_file()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the Edge Function to process the file
  -- This uses pg_net to make an HTTP request to our Edge Function
  PERFORM
    net.http_post(
      url := CONCAT(current_setting('app.functions_base_url'), '/process-spreadsheet'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CONCAT('Bearer ', current_setting('app.functions_bearer_token'))
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