'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import RenderTable from '@/components/ui/tables/RenderTable';

type ChartWithMetrics = Tables<'charts'> & {
  metrics: string[];
  regions?: string[];
};

export default function EmbedTablePage() {
  const params = useParams();
  const chartId = params.id as string;

  // Fetch chart details and associated metrics
  const { data: chartData, isLoading } = useQuery({
    queryKey: ['embed-table', chartId],
    queryFn: async () => {
      // Get chart details
      const { data: chart, error } = await supabaseClient
        .from('charts')
        .select('*')
        .eq('id', chartId)
        .single();

      if (error) throw error;

      // Parse the config and extract metrics
      const config = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;

      // Return combined data
      return {
        ...chart,
        metrics: config.metrics || [],
        regions: config.regions || [],
        config,
      } as ChartWithMetrics;
    },
  });

  // Parse chart configuration
  const chartConfig = chartData?.config as any;

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : chartData && chartData.metrics.length > 0 ? (
        <div className="h-full max-h-[90vh] w-full overflow-auto">
          <RenderTable
            metricIds={chartData.metrics}
            dateRange={{
              from: chartConfig?.dateRange?.from ? new Date(chartConfig.dateRange.from) : undefined,
              to: chartConfig?.dateRange?.to ? new Date(chartConfig.dateRange.to) : undefined,
            }}
            regionIds={chartData.regions}
            tableConfig={
              chartConfig?.tableView || {
                showRowNumbers: true,
                showFilters: true,
                pageSize: 10,
                enableSorting: true,
                enablePagination: true,
                density: 'default',
                groupBy: 'year-metric',
              }
            }
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">Table not found or no metrics selected</p>
        </div>
      )}
    </div>
  );
}
