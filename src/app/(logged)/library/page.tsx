'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, BarChart, BarChart2, PieChart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RenderChart from '@/components/ui/charts/RenderChart';
import { Search } from 'lucide-react';

// Define valid chart types to match RenderChart requirements
type ChartType = 'line' | 'bar' | 'pie' | 'area';

// Function to validate and return a valid chart type
const getValidChartType = (chartType: string | null): ChartType => {
  const validTypes: ChartType[] = ['line', 'bar', 'pie', 'area'];
  return chartType && validTypes.includes(chartType as ChartType)
    ? (chartType as ChartType)
    : 'line';
};

type ChartWithMetrics = Tables<'charts'> & {
  metrics: string[];
  config: any;
  description?: string;
};

export default function LibraryPage() {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  // Fetch charts data
  const { data: charts, isLoading } = useQuery({
    queryKey: ['charts'],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('charts').select('*');

      if (error) throw error;

      // Transform data to include metrics array and parse config
      return data.map(chart => {
        const config = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;
        return {
          ...chart,
          metrics: config.metrics || [],
          config,
        };
      }) as ChartWithMetrics[];
    },
  });

  // Filter charts based on search query
  const filteredCharts = charts?.filter(chart =>
    chart.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle chart click to navigate to detail page
  const handleChartClick = (chartId: string) => {
    router.push(`/library/${chartId}`);
  };

  const getChartIcon = (chartType: string) => {
    switch (chartType) {
      case 'line':
        return <BarChart className="h-6 w-6" />;
      case 'bar':
        return <BarChart2 className="h-6 w-6" />;
      case 'pie':
        return <PieChart className="h-6 w-6" />;
      default:
        return <BarChart className="h-6 w-6" />;
    }
  };

  return (
    <div className="mt-8 space-y-8">
      {/* Header Section */}
      <div className="mb-4 flex flex-col gap-4 border-b pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              {t('metrics.library.title')}
            </h1>
            <p className="text-base text-muted-foreground">{t('metrics.library.description')}</p>
          </div>
          <Button asChild className="w-full md:w-auto">
            <Link href="/configurator">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('metrics.library.createNew')}
            </Link>
          </Button>
        </div>
        <div className="relative mt-2 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('metrics.library.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label={t('metrics.library.searchPlaceholder')}
          />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="w-full">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array(6)
              .fill(0)
              .map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-lg" />
              ))}
          </div>
        ) : filteredCharts?.length ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredCharts.map(chart => (
              <Card
                key={chart.id}
                className="group flex cursor-pointer flex-col overflow-hidden transition-all hover:shadow-md"
                onClick={() => handleChartClick(chart.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center">
                    {getChartIcon(chart.config?.type || 'line')}
                    <span className="ml-2 max-w-[180px] truncate" title={chart.name}>
                      {chart.name}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {chart.description && (
                      <p className="max-w-[220px] truncate" title={chart.description}>
                        {chart.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs">
                      {chart.config?.dateRange?.from
                        ? new Date(chart.config.dateRange.from).toLocaleDateString()
                        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}{' '}
                      -
                      {chart.config?.dateRange?.to
                        ? new Date(chart.config.dateRange.to).toLocaleDateString()
                        : new Date().toLocaleDateString()}
                    </p>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="h-24">
                    {chart.metrics && chart.metrics.length > 0 && (
                      <RenderChart
                        metricIds={chart.metrics}
                        chartType={getValidChartType(chart.config?.type || null)}
                        dateRange={{
                          from: chart.config?.dateRange?.from
                            ? new Date(chart.config.dateRange.from)
                            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                          to: chart.config?.dateRange?.to
                            ? new Date(chart.config.dateRange.to)
                            : new Date(),
                        }}
                        showLegend={false}
                        showAxisLabels={false}
                        colorScheme={chart.config?.colorScheme || 'default'}
                        aggregation={chart.config?.aggregation || 'none'}
                        hideDots={true}
                        {...(chart.config?.stacked !== undefined && {
                          stacked: chart.config.stacked,
                        })}
                        {...(chart.config?.curveType !== undefined && {
                          curveType: chart.config.curveType,
                        })}
                        {...(chart.config?.innerRadius !== undefined && {
                          innerRadius: chart.config.innerRadius,
                        })}
                        {...(chart.config?.outerRadius !== undefined && {
                          outerRadius: chart.config.outerRadius,
                        })}
                        regionIds={chart.config?.regions}
                        separateRegions={chart.config?.separateRegions || false}
                      />
                    )}
                    {(!chart.metrics || chart.metrics.length === 0) && (
                      <div className="flex h-full items-center justify-center rounded-md bg-muted">
                        <p className="text-sm text-muted-foreground">No metrics available</p>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end bg-muted/50 p-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/library/${chart.id}`}>View</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-10">
            <BarChart2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">{t('metrics.library.noCharts')}</p>
            <Button asChild>
              <Link href="/configurator">
                <PlusCircle className="mr-2 h-4 w-4" />
                {t('metrics.library.createNew')}
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
