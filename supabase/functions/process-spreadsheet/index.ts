// Supabase Edge Function to validate and convert spreadsheet files to JSON
// Follow the Supabase Edge Function docs: https://supabase.com/docs/guides/functions
import { serve } from 'std/http/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get request body
    const body = await req.json();
    const { fileId, filePath, fileName } = body;

    if (!fileId || !filePath) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: fileId and filePath' }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          status: 400,
        }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check file extension
    const fileExtension = fileName?.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['csv', 'xlsx', 'xls'];

    if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
      // Update the file record with error status
      await supabase
        .from('files')
        .update({
          metadata: {
            ...body.metadata,
            processing_status: 'error',
            error_message: 'Unsupported file format. Only CSV and Excel files are supported.',
          },
        })
        .eq('id', fileId);

      return new Response(
        JSON.stringify({
          error: 'Unsupported file format. Only CSV and Excel files are supported.',
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          status: 400,
        }
      );
    }

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('metrics-import')
      .download(filePath);

    if (downloadError || !fileData) {
      // Update the file record with error status
      await supabase
        .from('files')
        .update({
          metadata: {
            ...body.metadata,
            processing_status: 'error',
            error_message: `Failed to download file: ${downloadError?.message || 'Unknown error'}`,
          },
        })
        .eq('id', fileId);

      return new Response(
        JSON.stringify({ error: `Failed to download file: ${downloadError?.message}` }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          status: 500,
        }
      );
    }

    // Parse the file based on its type
    let jsonData;
    try {
      // Convert file to ArrayBuffer
      const arrayBuffer = await fileData.arrayBuffer();

      // Parse with xlsx library
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Get the first worksheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert to JSON with headers
      jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Extract headers from the first row
      const headers: string[] = jsonData[0] as string[];

      // Convert to objects with headers as keys
      const formattedData = jsonData.slice(1).map((row: any) => {
        const obj: Record<string, any> = {};
        headers.forEach((header: string, index: number) => {
          obj[header] = row[index];
        });
        return obj;
      });

      // Get the JSON path for storage
      const jsonPath = `processed/${fileId}.json`;

      // Save the JSON to storage
      const { error: uploadError } = await supabase.storage
        .from('metrics-import')
        .upload(jsonPath, JSON.stringify(formattedData), {
          contentType: 'application/json',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to save processed JSON: ${uploadError.message}`);
      }

      // Update the file record with success status and JSON path
      await supabase
        .from('files')
        .update({
          metadata: {
            ...body.metadata,
            processing_status: 'success',
            processed_at: new Date().toISOString(),
            json_path: jsonPath,
            row_count: formattedData.length,
            column_count: headers.length,
            headers: headers,
          },
        })
        .eq('id', fileId);

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          message: 'File processed successfully',
          data: {
            rowCount: formattedData.length,
            headers: headers,
            jsonPath: jsonPath,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    } catch (error) {
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      // Update the file record with error status
      await supabase
        .from('files')
        .update({
          metadata: {
            ...body.metadata,
            processing_status: 'error',
            error_message: `Error processing file: ${errorMessage}`,
          },
        })
        .eq('id', fileId);

      return new Response(JSON.stringify({ error: `Error processing file: ${errorMessage}` }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 500,
      });
    }
  } catch (error) {
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 500,
    });
  }
});
