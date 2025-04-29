'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, BarChart, ChevronRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

type MetricWithStats = Tables<'metrics'> & {
  data_sources: Tables<'data_sources'> | null;
  data_count: number;
  last_data_point: string | null;
};

export default function ExplorerPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch metrics data with stats
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics-with-stats'],
    queryFn: async () => {
      // First get all metrics
      const { data: metricsData, error: metricsError } = await supabaseClient
        .from('metrics')
        .select('*, data_sources(*)');

      if (metricsError) throw metricsError;

      // For each metric, get count and latest data point
      const metricsWithStats = await Promise.all(
        metricsData.map(async metric => {
          // Get count of data points
          const { count, error: countError } = await supabaseClient
            .from('data_points')
            .select('*', { count: 'exact', head: true })
            .eq('metric_id', metric.id);

          if (countError) throw countError;

          // Get latest data point
          const { data: latestData, error: latestError } = await supabaseClient
            .from('data_points')
            .select('ts')
            .eq('metric_id', metric.id)
            .order('ts', { ascending: false })
            .limit(1);

          if (latestError) throw latestError;

          return {
            ...metric,
            data_count: count || 0,
            last_data_point: latestData && latestData.length > 0 ? latestData[0].ts : null,
          } as MetricWithStats;
        })
      );

      return metricsWithStats;
    },
  });

  // Filter metrics based on search query
  const filteredMetrics = metrics?.filter(
    metric =>
      metric.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      metric.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format date based on current locale
  const formatDate = (date: Date) => {
    return formatDistanceToNow(date, {
      addSuffix: true,
      locale: locale === 'fr' ? fr : undefined,
    });
  };

  // Navigate to metric detail page
  const handleMetricClick = (metricId: string) => {
    router.push(`/explorer/${metricId}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('metrics.explorer.title')}</h1>
        <p className="text-muted-foreground">{t('metrics.explorer.description')}</p>
      </div>

      <Input
        placeholder={t('metrics.explorer.searchPlaceholder')}
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="max-w-md"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-[200px] w-full rounded-lg" />
            ))}
        </div>
      ) : filteredMetrics?.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMetrics.map(metric => (
            <Card
              key={metric.id}
              className="group cursor-pointer overflow-hidden transition-all hover:shadow-md"
              onClick={() => handleMetricClick(metric.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span>{metric.name}</span>
                  {metric.unit && <Badge variant="outline">{metric.unit}</Badge>}
                </CardTitle>
                <CardDescription>
                  {metric.description || t('metrics.explorer.noDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-sm text-muted-foreground">
                  {t('metrics.explorer.source')}:{' '}
                  {metric.data_sources?.name || t('metrics.explorer.noSource')}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <BarChart className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {metric.data_count} {t('metrics.explorer.dataPoints')}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between border-t bg-muted/50 px-6 py-3">
                <div className="flex items-center text-xs text-muted-foreground">
                  <CalendarIcon className="mr-2 h-3 w-3" />
                  {metric.last_data_point
                    ? t('metrics.explorer.lastUpdated', {
                        time: formatDate(new Date(metric.last_data_point)),
                      })
                    : t('metrics.explorer.noDataYet')}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-muted-foreground">{t('metrics.explorer.noMetrics')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
