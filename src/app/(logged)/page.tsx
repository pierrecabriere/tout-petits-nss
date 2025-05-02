'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart2,
  Folder,
  FileText,
  Grid,
  List,
  InfoIcon,
  CalendarIcon,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TreeView, type TreeDataItem } from '@/components/tree-view';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLocale } from 'next-intl';

type MetricWithStats = Tables<'metrics'> & {
  source: Tables<'sources'> | null;
  data_count: number;
  last_data_point: string | null;
};

export default function MetricTreePage() {
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MetricWithStats | null>(null);

  // Fetch metrics data with stats
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics-with-stats-tree'],
    queryFn: async () => {
      // Get all metrics
      const { data: metricsData, error: metricsError } = await supabaseClient
        .from('metrics')
        .select('*');

      if (metricsError) throw metricsError;

      // For each metric, get count and latest data point
      const metricsWithStats = await Promise.all(
        metricsData.map(async metric => {
          // Get count of data points
          const { count, error: countError } = await supabaseClient
            .from('metric_data')
            .select('*', { count: 'exact', head: true })
            .eq('metric_id', metric.id);

          if (countError) throw countError;

          // Get latest data point
          const { data: latestData, error: latestError } = await supabaseClient
            .from('metric_data')
            .select('date')
            .eq('metric_id', metric.id)
            .order('date', { ascending: false })
            .limit(1);

          if (latestError) throw latestError;

          // Get source info if available
          let source = null;

          // Check if metadata exists and is an object containing source_id
          if (
            metric.metadata &&
            typeof metric.metadata === 'object' &&
            metric.metadata !== null &&
            'source_id' in metric.metadata
          ) {
            const sourceId = (metric.metadata as { source_id: string }).source_id;

            if (sourceId) {
              const { data: sourceData, error: sourceError } = await supabaseClient
                .from('sources')
                .select('*')
                .eq('id', sourceId)
                .maybeSingle();

              if (!sourceError) {
                source = sourceData;
              }
            }
          }

          return {
            ...metric,
            source,
            data_count: count || 0,
            last_data_point: latestData && latestData.length > 0 ? latestData[0].date : null,
          } as MetricWithStats;
        })
      );

      return metricsWithStats;
    },
  });

  // Format date based on current locale
  const formatDate = (date: Date) => {
    return formatDistanceToNow(date, {
      addSuffix: true,
      locale: locale === 'fr' ? fr : undefined,
    });
  };

  // Function to transform metrics into tree data structure
  const transformMetricsToTree = (metrics: MetricWithStats[] | undefined): TreeDataItem[] => {
    if (!metrics) return [];

    // Create a map of metrics by id for quick reference
    const metricsMap = new Map<string, MetricWithStats>();
    metrics.forEach(metric => {
      metricsMap.set(metric.id, metric);
    });

    // Create a map to store parent-child relationships
    const childrenMap = new Map<string, string[]>();

    // Initial pass to organize the child-parent relationships
    metrics.forEach(metric => {
      if (metric.parent_id) {
        if (!childrenMap.has(metric.parent_id)) {
          childrenMap.set(metric.parent_id, []);
        }
        childrenMap.get(metric.parent_id)?.push(metric.id);
      }
    });

    // Function to build tree recursively
    const buildTree = (metricId: string): TreeDataItem => {
      const metric = metricsMap.get(metricId)!;
      const childrenIds = childrenMap.get(metricId) || [];

      const treeItem: TreeDataItem = {
        id: metric.id,
        name: metric.name,
        icon: childrenIds.length > 0 ? Folder : FileText,
        selectedIcon: childrenIds.length > 0 ? Folder : FileText,
        openIcon: childrenIds.length > 0 ? Folder : FileText,
      };

      if (childrenIds.length > 0) {
        treeItem.children = childrenIds.map(id => buildTree(id));
      }

      return treeItem;
    };

    // Find root level metrics (no parent_id or parent_id that doesn't exist in our metrics)
    const rootMetrics = metrics.filter(
      metric => !metric.parent_id || !metricsMap.has(metric.parent_id)
    );

    // Build the tree starting from root metrics
    return rootMetrics.map(metric => {
      return buildTree(metric.id);
    });
  };

  // Filter metrics based on search query
  const filteredMetrics = metrics?.filter(
    metric =>
      metric.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      metric.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Convert filtered metrics to tree structure
  const treeData = transformMetricsToTree(filteredMetrics);

  // Navigate to metric detail page
  const handleMetricClick = (metricId: string) => {
    router.push(`/explorer/${metricId}`);
  };

  // Navigate to grid view
  const handleGridViewClick = () => {
    router.push('/');
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Header Section */}
      <div className="mb-4 flex flex-col gap-4 border-b pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-3xl font-bold tracking-tight">
              {t('metrics.explorer.title')}
            </h1>
            <p className="text-base text-muted-foreground">{t('metrics.explorer.treeView')}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGridViewClick}
              title={t('metrics.explorer.gridView')}
              aria-label={t('metrics.explorer.gridView')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="active"
              title={t('metrics.explorer.treeView')}
              aria-label={t('metrics.explorer.treeView')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('metrics.explorer.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label={t('metrics.explorer.searchPlaceholder')}
          />
        </div>
      </div>

      {/* Main Content Section */}
      <div className="w-full">
        {isLoading ? (
          <Skeleton className="h-[400px] w-full rounded-lg" />
        ) : treeData.length > 0 ? (
          <Card className="p-0">
            <CardContent className="flex flex-col gap-8 p-6 md:flex-row">
              <div className="min-w-[250px] max-w-xs flex-1">
                <TreeView
                  data={treeData}
                  defaultNodeIcon={Folder}
                  defaultLeafIcon={FileText}
                  expandAll
                  onSelectChange={item => {
                    if (item && metrics) {
                      const metric = metrics.find(m => m.id === item.id);
                      if (metric) {
                        setSelectedMetric(metric);
                      }
                    }
                  }}
                />
              </div>
              {selectedMetric && (
                <div className="flex-1">
                  <Card className="border bg-muted/50 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex w-full flex-col gap-2">
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-lg font-semibold">{selectedMetric.name}</h3>
                          <div className="flex items-center gap-2">
                            {selectedMetric.unit && (
                              <Badge variant="outline">{selectedMetric.unit}</Badge>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-2"
                              aria-label={t('metrics.explorer.deselect')}
                              title={t('metrics.explorer.deselect')}
                              onClick={() => setSelectedMetric(null)}
                            >
                              <span aria-hidden="true">×</span>
                            </Button>
                          </div>
                        </div>
                        <p className="mb-2 text-sm text-muted-foreground">
                          {selectedMetric.description || t('metrics.explorer.noDescription')}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-4">
                          <div className="flex items-center text-sm">
                            <InfoIcon className="mr-2 h-3 w-3" />
                            <span>
                              {t('metrics.explorer.source')}:{' '}
                              {selectedMetric.source?.name || t('metrics.explorer.noSource')}
                            </span>
                          </div>
                          <div className="flex items-center text-sm">
                            <BarChart2 className="mr-2 h-3 w-3" />
                            <span>
                              {selectedMetric.data_count} {t('metrics.explorer.dataPoints')}
                            </span>
                          </div>
                          {selectedMetric.last_data_point && (
                            <div className="flex items-center text-sm">
                              <CalendarIcon className="mr-2 h-3 w-3" />
                              <span>
                                {t('metrics.explorer.lastUpdated', {
                                  time: formatDate(new Date(selectedMetric.last_data_point)),
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                        {selectedMetric.parent_id && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('metrics.explorer.parentMetric')}:{' '}
                            {metrics?.find(m => m.id === selectedMetric.parent_id)?.name}
                          </div>
                        )}
                        <div className="mt-4 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleMetricClick(selectedMetric.id)}
                            disabled={selectedMetric.data_count === 0}
                            aria-label={t('metrics.explorer.viewData')}
                          >
                            {t('metrics.explorer.viewData')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/explorer/${selectedMetric.id}/edit`)}
                            aria-label={t('metrics.explorer.edit')}
                          >
                            {t('metrics.explorer.edit')}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-10">
            <BarChart2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">{t('metrics.explorer.noMetrics')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
