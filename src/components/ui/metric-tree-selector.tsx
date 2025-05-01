'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TreeView, type TreeDataItem } from '@/components/tree-view';
import { Folder, FileText, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';

// Type for metrics with additional data count
type MetricWithStats = Tables<'metrics'> & {
  data_count: number;
  last_data_point: string | null;
};

// Extended TreeDataItem with custom data field
interface MetricTreeDataItem extends TreeDataItem {
  data?: {
    metric: MetricWithStats;
    isSelectable: boolean;
    hasDataPoints: boolean;
    hasChildWithDataPoints: boolean;
  };
}

interface MetricTreeSelectorProps {
  selectedMetrics: string[];
  onSelectMetrics: (metricIds: string[]) => void;
  buttonLabel?: string;
  disableEmptyMetrics?: boolean;
}

export function MetricTreeSelector({
  selectedMetrics,
  onSelectMetrics,
  buttonLabel,
  disableEmptyMetrics = true,
}: MetricTreeSelectorProps) {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);

  // Fetch metrics data with stats to check which have values
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

          return {
            ...metric,
            data_count: count || 0,
            last_data_point: latestData && latestData.length > 0 ? latestData[0].date : null,
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
      (metric.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Transform metrics to tree structure
  const transformMetricsToTree = (metrics: MetricWithStats[] | undefined): MetricTreeDataItem[] => {
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
    const buildTree = (metricId: string): MetricTreeDataItem => {
      const metric = metricsMap.get(metricId)!;
      const childrenIds = childrenMap.get(metricId) || [];

      // Check if this metric has data points or if any of its children have data points
      const hasDataPoints = metric.data_count > 0;
      const hasChildWithDataPoints = childrenIds.some(childId => {
        const childMetric = metricsMap.get(childId);
        return childMetric && childMetric.data_count > 0;
      });

      // Determine if this node is selectable based on whether it or its children have data
      const isSelectable = !disableEmptyMetrics || hasDataPoints;

      const treeItem: MetricTreeDataItem = {
        id: metric.id,
        name: `${metric.name}${metric.unit ? ` (${metric.unit})` : ''}`,
        icon: childrenIds.length > 0 ? Folder : FileText,
        selectedIcon: childrenIds.length > 0 ? Folder : FileText,
        openIcon: childrenIds.length > 0 ? Folder : FileText,
        // Add custom data for rendering in the tree view
        data: {
          metric,
          isSelectable,
          hasDataPoints,
          hasChildWithDataPoints,
        },
      };

      if (childrenIds.length > 0) {
        treeItem.children = childrenIds.map(id => buildTree(id)) as TreeDataItem[];
      }

      return treeItem;
    };

    // Find root level metrics (no parent_id or parent_id that doesn't exist in our metrics)
    const rootMetrics = metrics.filter(
      metric => !metric.parent_id || !metricsMap.has(metric.parent_id)
    );

    // Build the tree starting from root metrics
    return rootMetrics.map(metric => buildTree(metric.id));
  };

  // Get tree data from filtered metrics
  const treeData = transformMetricsToTree(filteredMetrics);

  const handleSelectMetric = (metricId: string) => {
    if (!metrics) return;

    const metric = metrics.find(m => m.id === metricId);
    if (!metric) return;

    // If disableEmptyMetrics is true, only allow selection of metrics with data
    if (disableEmptyMetrics && metric.data_count === 0) {
      return;
    }

    // Check if this metric is already selected
    if (selectedMetrics.includes(metricId)) {
      onSelectMetrics(selectedMetrics.filter(id => id !== metricId));
    } else {
      // If this is the first metric being selected, simply add it
      if (selectedMetrics.length === 0) {
        onSelectMetrics([metricId]);
        return;
      }

      // Check if all currently selected metrics have the same unit
      const firstMetric = metrics.find(m => m.id === selectedMetrics[0]);
      if (firstMetric && metric.unit !== firstMetric.unit) {
        // Don't allow selection of metrics with different units
        return;
      }

      onSelectMetrics([...selectedMetrics, metricId]);
    }
  };

  // Auto-expand parent nodes of any selected metrics
  useEffect(() => {
    if (!metrics) return;

    const findParentPaths = (metricId: string, path: string[] = []): string[][] => {
      const metric = metrics.find(m => m.id === metricId);
      if (!metric) return [path];

      if (metric.parent_id) {
        return findParentPaths(metric.parent_id, [metric.parent_id, ...path]);
      }

      return [path];
    };

    // Get all parent paths for selected metrics
    const allPaths = selectedMetrics.flatMap(id => findParentPaths(id));
    // Flatten and deduplicate all parent IDs
    const parentIds = [...new Set(allPaths.flat())];

    setExpandedNodes(parentIds);
  }, [selectedMetrics, metrics]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{t('metrics.configurator.selectMetrics')}</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedMetrics.length} {t('metrics.selected', { count: selectedMetrics.length })}
          </span>
          {selectedMetrics.length > 0 && (
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              {(() => {
                const firstMetric = metrics?.find(m => m.id === selectedMetrics[0]);
                return firstMetric?.unit ? `(${firstMetric.unit})` : null;
              })()}
            </span>
          )}
        </div>
      </div>

      <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={dropdownOpen}
            className="w-full justify-between"
          >
            {selectedMetrics.length > 0
              ? `${selectedMetrics.length} ${t('metrics.selected', { count: selectedMetrics.length })}`
              : buttonLabel || t('metrics.selectMetrics')}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder={t('metrics.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array(3)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
            </div>
          ) : (
            <Card className="border-0 shadow-none">
              <CardContent className="max-h-[300px] overflow-y-auto p-1">
                {treeData.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    {t('metrics.noResults')}
                  </div>
                ) : (
                  <TreeView
                    data={treeData as TreeDataItem[]}
                    defaultNodeIcon={Folder}
                    defaultLeafIcon={FileText}
                    expandAll
                    initialSelectedItemId={
                      selectedMetrics.length === 1 ? selectedMetrics[0] : undefined
                    }
                    onSelectChange={item => {
                      if (item) {
                        const metricId = item.id;
                        handleSelectMetric(metricId);
                      }
                    }}
                    selectedIds={selectedMetrics}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </PopoverContent>
      </Popover>

      {selectedMetrics.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1">
            {selectedMetrics.map(metricId => {
              const metric = metrics?.find(m => m.id === metricId);
              return (
                <div
                  key={metricId}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium"
                >
                  {metric?.name}
                  <button
                    className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                    onClick={() => handleSelectMetric(metricId)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3 w-3"
                    >
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
