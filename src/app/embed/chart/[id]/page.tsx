'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import RenderChart from '@/components/ui/charts/RenderChart';

type ChartWithMetrics = Tables<'charts'> & {
  metrics: string[];
  regions?: string[];
};

export default function EmbedChartPage() {
  const params = useParams();
  const chartId = params.id as string;

  // Fetch chart details and associated metrics
  const { data: chartData, isLoading } = useQuery({
    queryKey: ['embed-chart', chartId],
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
        <div className="h-full max-h-[90vh] w-full">
          <RenderChart
            metricIds={chartData.metrics}
            chartType={chartConfig?.type || 'line'}
            dateRange={{
              from: chartConfig?.dateRange?.from ? new Date(chartConfig.dateRange.from) : undefined,
              to: chartConfig?.dateRange?.to ? new Date(chartConfig.dateRange.to) : undefined,
            }}
            showLegend={chartConfig?.showLegend || true}
            colorScheme={chartConfig?.colorScheme || 'default'}
            curveType={chartConfig?.curveType}
            innerRadius={chartConfig?.innerRadius}
            outerRadius={chartConfig?.outerRadius}
            stacked={chartConfig?.stacked || false}
            regionIds={chartData.regions}
            hideDots={chartConfig?.hideDots || false}
            aggregation="none"
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">Chart not found or no metrics selected</p>
        </div>
      )}
    </div>
  );
}
