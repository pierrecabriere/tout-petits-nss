// Avoid using deno-types that may cause circular reference issues
import XLSX from 'xlsx';
import { corsHeaders } from './cors.ts';
import { createClient } from '@supabase/supabase-js';
import { ChatOpenAI } from 'npm:@langchain/openai';
import { z } from 'npm:zod';

// Define types for metrics data
interface Region {
  id: string;
  code: string;
  name: string;
}

interface MetricDataPoint {
  region: string;
  year: number;
  value: number;
}

interface Metric {
  name: string;
  unit: string;
  data: MetricDataPoint[];
}

interface ProcessedOutput {
  metrics: Metric[];
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { fileId, filePath, fileName } = body;

    if (!fileId || !filePath) {
      return new Response(JSON.stringify({ error: 'File ID and path are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing file: ${fileName} (ID: ${fileId})`);
    console.log(`File path: ${filePath}`);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('metrics-import')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);

      // Update file with error status
      await updateFileStatus(fileId, 'error', {
        error: downloadError?.message || 'Failed to download file',
      });

      return new Response(
        JSON.stringify({ error: 'Failed to download file', details: downloadError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update file status to processing
    await updateFileStatus(fileId, 'processing');

    // Process the Excel file
    const arrayBuffer = await fileData.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Convert to JSON
    const rawData: Record<string, Array<Record<string, unknown>>> = {};

    // Process each sheet in the workbook
    workbook.SheetNames.forEach((sheetName: string) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      rawData[sheetName] = jsonData;
    });

    // Log the parsed JSON data
    console.log(
      'Raw parsed spreadsheet data (sample):',
      Object.keys(rawData).map(sheet => `${sheet}: ${rawData[sheet].length} rows`)
    );

    const regions = await getRegions();

    // Process the data with OpenAI
    const processedData = await processSpreadsheetData(rawData, regions, fileId);

    console.log('Processed data metrics count:', processedData.metrics.length);

    // Update file with processed status and the data
    await updateFileStatus(fileId, 'completed', {
      metrics_count: processedData.metrics.length,
      data_points_count: processedData.metrics.reduce((acc, metric) => acc + metric.data.length, 0),
    });

    return new Response(JSON.stringify({ success: true, data: processedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error processing spreadsheet:', error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getRegions(): Promise<Region[]> {
  const { data, error } = await supabase.from('regions').select('*');
  if (error) {
    console.error('Error fetching regions:', error);
    throw new Error(`Error fetching regions: ${error.message}`);
  }

  return data;
}

/**
 * Process spreadsheet data using OpenAI API and save metrics to database
 */
async function processSpreadsheetData(
  rawData: Record<string, Array<Record<string, unknown>>>,
  regions: Region[],
  fileId: string
): Promise<ProcessedOutput> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const model = new ChatOpenAI({
    openAIApiKey,
    temperature: 0,
    modelName: 'gpt-4.1-mini',
  });

  try {
    // Create a prompt with clear instructions
    const systemPrompt = {
      role: 'system',
      content: `Tu es un expert en analyse de données. Ton rôle est de transformer les données d'un fichier Excel en données structurées pour une base de données.

Pour chaque feuille du fichier Excel, identifie les métriques suivantes:
- Le nom de la métrique (cherche dans les en-têtes ou les premières lignes)
- L'unité de la métrique (comme %, €, nombre, etc.)
- Les données associées à chaque métrique avec:
  * La région (utilise uniquement les codes de région fournis)
  * L'année (convertie en nombre entier)
  * La valeur numérique (convertie en nombre)

IMPORTANT:
- Une feuille peut contenir plusieurs métriques différentes
- Assure-toi que les codes de région correspondent exactement à ceux fournis
- Convertis les années en nombres entiers (2022 et non "2022")
- Convertis les valeurs en nombres (pas de chaînes de caractères)

Voici la liste des codes de région disponibles:
${JSON.stringify(regions.map(r => ({ code: r.code, name: r.name })))}

Ta réponse doit être un JSON valide avec exactement cette structure:
{
  "metrics": [
    {
      "name": "Nom de la métrique",
      "unit": "Unité de mesure",
      "data": [
        {
          "region": "CODE_REGION",
          "year": 2023,
          "value": 42.5
        },
        // Plus de données
      ]
    },
    // Plus de métriques
  ]
}

Ne retourne rien d'autre que ce JSON.`,
    };

    const userPrompt = {
      role: 'user',
      content: `Voici les données brutes du fichier Excel par feuille:\n${JSON.stringify(rawData, null, 2)}`,
    };

    // Call the API
    const response = await model.invoke([systemPrompt, userPrompt]);

    // Extract and parse the JSON from the response
    let responseText = '';
    if (typeof response.content === 'string') {
      responseText = response.content;
    } else if (Array.isArray(response.content)) {
      responseText = response.content.map(part => (typeof part === 'string' ? part : '')).join('');
    }

    // Extract JSON from the response (in case there's any extra text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No valid JSON found in response');
      return { metrics: [] };
    }

    const jsonResponse = JSON.parse(jsonMatch[0]) as ProcessedOutput;

    // Validate the response with Zod schema
    const schema = z.object({
      metrics: z.array(
        z.object({
          name: z.string(),
          unit: z.string(),
          data: z.array(
            z.object({
              region: z.string(),
              year: z.number().int(),
              value: z.number(),
            })
          ),
        })
      ),
    });

    let validatedData: ProcessedOutput;

    // Validate and handle any validation errors
    try {
      schema.parse(jsonResponse);
      console.log(`Successfully processed ${jsonResponse.metrics.length} metrics`);
      validatedData = jsonResponse;
    } catch (validationError) {
      console.error('Validation error:', validationError);
      // If validation fails, try to recover what we can
      validatedData = {
        metrics: (jsonResponse.metrics || []).map(metric => ({
          name: String(metric.name || 'Unknown metric'),
          unit: String(metric.unit || 'Unknown unit'),
          data: Array.isArray(metric.data)
            ? metric.data
                .filter(dp => dp && typeof dp === 'object')
                .map(dp => ({
                  region: String(dp.region || ''),
                  year:
                    typeof dp.year === 'number'
                      ? Math.floor(dp.year)
                      : typeof dp.year === 'string'
                        ? parseInt(dp.year, 10) || 0
                        : 0,
                  value:
                    typeof dp.value === 'number'
                      ? dp.value
                      : typeof dp.value === 'string'
                        ? parseFloat(dp.value) || 0
                        : 0,
                }))
                .filter(dp => dp.region && dp.year > 0)
            : [],
        })),
      };
    }

    // Region code to ID mapping
    const regionCodeToId: Record<string, string> = {};
    regions.forEach(region => {
      regionCodeToId[region.code] = region.id;
    });

    // Save metrics and data to database
    const createdMetrics = await saveMetricsToDatabase(
      validatedData.metrics,
      regionCodeToId,
      fileId
    );

    return createdMetrics;
  } catch (error) {
    console.error('Error processing data:', error);
    return { metrics: [] };
  }
}

/**
 * Save metrics and data points to database
 */
async function saveMetricsToDatabase(
  metrics: Metric[],
  regionCodeToId: Record<string, string>,
  fileId: string
): Promise<ProcessedOutput> {
  const savedMetrics: Metric[] = [];
  const now = new Date().toISOString();

  // For each metric in the processed data
  for (const metric of metrics) {
    try {
      // 1. Create metric record
      const { data: metricData, error: metricError } = await supabase
        .from('metrics')
        .insert({
          name: metric.name,
          unit: metric.unit,
          created_at: now,
          updated_at: now,
          metadata: { source_file_id: fileId },
        })
        .select()
        .single();

      if (metricError || !metricData) {
        console.error('Error creating metric:', metricError);
        continue;
      }

      const metricId = metricData.id;
      console.log(`Created metric: ${metric.name} (ID: ${metricId})`);

      // 2. Create metric data points
      const dataPoints = metric.data.filter(dp => dp.region && regionCodeToId[dp.region]);

      if (dataPoints.length === 0) {
        console.log(`No valid data points found for metric: ${metric.name}`);
        savedMetrics.push({ ...metric, data: [] });
        continue;
      }

      const metricDataInserts = dataPoints.map(dp => ({
        metric_id: metricId,
        region_id: regionCodeToId[dp.region],
        date: new Date(dp.year, 0, 1).toISOString().split('T')[0], // Convert year to date format (YYYY-01-01)
        value: dp.value,
        status: 'draft',
        created_at: now,
        updated_at: now,
        metadata: {
          source_file_id: fileId,
          original_year: dp.year,
        },
      }));

      const { data: insertedDataPoints, error: dataPointsError } = await supabase
        .from('metric_data')
        .insert(metricDataInserts)
        .select();

      if (dataPointsError) {
        console.error('Error inserting data points:', dataPointsError);
      } else {
        console.log(`Inserted ${insertedDataPoints.length} data points for metric: ${metric.name}`);
      }

      // Add to saved metrics with actual saved data
      savedMetrics.push({
        ...metric,
        data: dataPoints,
      });
    } catch (error) {
      console.error(`Error saving metric ${metric.name}:`, error);
    }
  }

  return { metrics: savedMetrics };
}

// Helper function to update file processing status
async function updateFileStatus(
  fileId: string,
  processing_status: 'pending' | 'processing' | 'completed' | 'error',
  metadata: Record<string, unknown> = {}
) {
  const { error } = await supabase
    .from('files')
    .update({
      processing_status,
      metadata,
    })
    .eq('id', fileId);

  if (error) {
    console.error('Error updating file status:', error);
  }
}
