'use client';

import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, BarChart, Edit, Save, ChevronDown, Link, Trash2 } from 'lucide-react';
import RenderChart from '@/components/ui/charts/RenderChart';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MetricTreeSelector } from '@/components/ui/metric-tree-selector';
import { YearRangeSlider } from '@/components/ui/year-range-slider';
import RenderTable from '@/components/ui/tables/RenderTable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Simple switch component
const Switch = ({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <div className="flex items-center">
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onCheckedChange(e.target.checked)}
      className="h-5 w-10 rounded-full bg-muted focus:ring-primary"
    />
  </div>
);

// Temporary implementations for missing components (remove once you've created the actual components)
const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
  />
);

type ChartWithMetrics = Tables<'charts'> & {
  metrics: string[];
  regions?: string[];
};

export default function ChartDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get the chart ID from the URL
  const chartId = params.id as string;

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('default');
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // State for chart configuration
  const [chartName, setChartName] = useState('');
  const [chartDescription, setChartDescription] = useState('');
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie' | 'area'>('line');
  const [yearRange, setYearRange] = useState<[number, number]>([
    new Date().getFullYear() - 5,
    new Date().getFullYear(),
  ]);
  const [showLegend, setShowLegend] = useState(true);
  const [colorScheme, setColorScheme] = useState<'default' | 'pastel' | 'vibrant'>('default');
  const [curveType, setCurveType] = useState<'linear' | 'monotone' | 'step'>('monotone');
  const [innerRadius, setInnerRadius] = useState<number>(0);
  const [outerRadius, setOuterRadius] = useState<number>(80);
  const [stacked, setStacked] = useState<boolean>(false);
  const [hideDots, setHideDots] = useState(false);
  const [separateRegions, setSeparateRegions] = useState(false);

  // State for table options
  const [tableView, setTableView] = useState({
    showRowNumbers: true,
    showFilters: true,
    pageSize: 10,
    enableSorting: true,
    enablePagination: true,
    density: 'default' as 'default' | 'compact' | 'comfortable',
    groupBy: 'year-metric' as 'year' | 'metric' | 'year-metric' | 'metric-year',
  });

  // State for metric selection
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // State for region selection
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(true);

  // Fetch regions on mount
  useEffect(() => {
    let isMounted = true;
    supabaseClient
      .from('regions')
      .select('id, name')
      .then(({ data, error }) => {
        if (!error && isMounted && data) {
          setRegions(data);
        }
        setLoadingRegions(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch chart details and associated metrics
  const { data: chartData, isLoading } = useQuery<ChartWithMetrics | undefined>({
    queryKey: ['chart-detail', chartId],
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

  // Update chart mutation
  const updateChartMutation = useMutation({
    mutationFn: async () => {
      // Update chart record
      const { error } = await supabaseClient
        .from('charts')
        .update({
          name: chartName,
          description: chartDescription,
          config: {
            title: chartName,
            description: chartDescription,
            type: chartType,
            metrics: selectedMetrics,
            regions: selectedRegions,
            dateRange: {
              from: new Date(yearRange[0], 0, 1).toISOString(), // January 1st of start year
              to: new Date(yearRange[1], 11, 31).toISOString(), // December 31st of end year
            },
            yearRange: yearRange,
            showLegend,
            colorScheme,
            curveType: chartType === 'line' ? curveType : undefined,
            innerRadius: chartType === 'pie' ? innerRadius : undefined,
            outerRadius: chartType === 'pie' ? outerRadius : undefined,
            stacked: chartType === 'bar' || chartType === 'area' ? stacked : undefined,
            hideDots: chartType === 'line' ? hideDots : undefined,
            separateRegions,
            tableView: {
              showRowNumbers: tableView.showRowNumbers,
              showFilters: tableView.showFilters,
              pageSize: tableView.pageSize,
              enableSorting: tableView.enableSorting,
              enablePagination: tableView.enablePagination,
              density: tableView.density,
              groupBy: tableView.groupBy,
            },
          },
        })
        .eq('id', chartId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-detail', chartId] });
      toast({
        title: 'Chart updated successfully',
        description: 'Your chart has been updated',
      });
      setEditOpen(false);
    },
    onError: error => {
      toast({
        title: 'Error updating chart',
        description: 'An error occurred while updating your chart.',
        variant: 'destructive',
      });
      console.error('Error updating chart:', error);
    },
  });

  // Delete chart mutation
  const deleteChartMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabaseClient.from('charts').delete().eq('id', chartId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Chart deleted successfully',
        description: 'Your chart has been permanently deleted',
      });
      router.push('/library');
    },
    onError: error => {
      toast({
        title: 'Error deleting chart',
        description: 'An error occurred while deleting your chart.',
        variant: 'destructive',
      });
      console.error('Error deleting chart:', error);
    },
  });

  // Go back to library
  const handleBackClick = () => {
    router.push('/library');
  };

  // Parse chart configuration
  const chartConfig = chartData?.config as any;

  // Initialize edit form with chart data when it loads
  useEffect(() => {
    if (chartData) {
      setChartName(chartData.name);
      setChartDescription(chartConfig?.description || '');
      setChartType(chartConfig?.type || 'line');

      // Handle year range/date range
      if (chartConfig?.yearRange) {
        setYearRange(chartConfig.yearRange);
      } else if (chartConfig?.dateRange?.from && chartConfig?.dateRange?.to) {
        const fromDate = new Date(chartConfig.dateRange.from);
        const toDate = new Date(chartConfig.dateRange.to);
        setYearRange([fromDate.getFullYear(), toDate.getFullYear()]);
      }

      setShowLegend(chartConfig?.showLegend ?? true);
      setColorScheme(chartConfig?.colorScheme || 'default');
      setCurveType(chartConfig?.curveType || 'monotone');
      setInnerRadius(chartConfig?.innerRadius ?? 0);
      setOuterRadius(chartConfig?.outerRadius ?? 80);
      setStacked(chartConfig?.stacked ?? false);
      setHideDots(chartConfig?.hideDots ?? false);
      setSeparateRegions(chartConfig?.separateRegions ?? false);
      setSelectedMetrics(chartData.metrics || []);
      setSelectedRegions(chartData.regions || []);

      // Initialize table options if available
      if (chartConfig?.tableView) {
        setTableView({
          showRowNumbers: chartConfig.tableView.showRowNumbers ?? true,
          showFilters: chartConfig.tableView.showFilters ?? true,
          pageSize: chartConfig.tableView.pageSize ?? 10,
          enableSorting: chartConfig.tableView.enableSorting ?? true,
          enablePagination: chartConfig.tableView.enablePagination ?? true,
          density: chartConfig.tableView.density ?? 'default',
          groupBy: chartConfig.tableView.groupBy ?? 'year-metric',
        });
      }
    }
  }, [chartData, chartConfig]);

  // Handle chart update
  const handleUpdateChart = () => {
    updateChartMutation.mutate();
  };

  // Handle chart delete
  const handleDeleteChart = () => {
    deleteChartMutation.mutate();
  };

  // Function to copy embed link to clipboard
  const copyEmbedLink = (type: 'chart' | 'table') => {
    const embedLink = `${window.location.origin}/embed/${type}/${chartId}`;
    navigator.clipboard.writeText(embedLink).then(() => {
      toast({
        title: 'Link copied',
        description: `Embed link for ${type} has been copied to clipboard`,
      });
    });
  };

  // For chart preview, convert year range to dateRange
  const previewDateRange = {
    from: new Date(yearRange[0], 0, 1), // January 1st of start year
    to: new Date(yearRange[1], 11, 31), // December 31st of end year
  };

  return (
    <div className="mt-8 space-y-8">
      <Card>
        <CardHeader className="flex flex-col gap-2 border-b pb-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={handleBackClick} className="-ml-2">
              <ChevronLeft className="mr-2 h-4 w-4" />
              {t('library.detail.backToLibrary')}
            </Button>
            {chartData && (
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="border-destructive text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('library.detail.deleteChart')}
                </Button>
                <Popover open={editOpen} onOpenChange={setEditOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <Edit className="mr-2 h-4 w-4" />
                      {t('library.detail.editChart')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[600px] border p-4 shadow-lg" align="end">
                    <div className="space-y-4">
                      <h3 className="font-medium">{t('library.detail.editChart')}</h3>

                      <Tabs defaultValue="global" onValueChange={setActiveTab} value={activeTab}>
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="global">Global Settings</TabsTrigger>
                          <TabsTrigger value="chart">Chart Options</TabsTrigger>
                          <TabsTrigger value="table">Table Options</TabsTrigger>
                        </TabsList>

                        <TabsContent value="global" className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label htmlFor="chart-name">Chart Name</Label>
                            <Input
                              id="chart-name"
                              value={chartName}
                              onChange={e => setChartName(e.target.value)}
                              placeholder="Enter chart name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="chart-description">Description</Label>
                            <Textarea
                              id="chart-description"
                              value={chartDescription}
                              onChange={e => setChartDescription(e.target.value)}
                              placeholder="Enter chart description"
                              rows={3}
                            />
                          </div>

                          {/* Metrics selection using the MetricTreeSelector component */}
                          <MetricTreeSelector
                            selectedMetrics={selectedMetrics}
                            onSelectMetrics={setSelectedMetrics}
                            disableEmptyMetrics={true}
                          />

                          {/* Date Range Selection */}
                          <div className="space-y-2">
                            <Label>{t('metrics.configurator.yearRange')}</Label>
                            <div className="w-full px-1 py-2">
                              <YearRangeSlider
                                minYear={1980}
                                maxYear={new Date().getFullYear()}
                                value={yearRange}
                                onChange={setYearRange}
                              />
                            </div>
                          </div>

                          {/* Region Multi-Select */}
                          <div className="space-y-2">
                            <Label>{t('metrics.configurator.regions')}</Label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full justify-between">
                                  {selectedRegions.length === 0
                                    ? t('metrics.configurator.selectRegions')
                                    : selectedRegions.length === regions.length
                                      ? t('metrics.configurator.allRegions')
                                      : `${selectedRegions.length} ${t('metrics.configurator.regionSelected', { count: selectedRegions.length })}`}
                                  <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="max-h-72 w-64 overflow-y-auto">
                                {loadingRegions ? (
                                  <div className="p-2 text-sm text-muted-foreground">
                                    {t('metrics.configurator.loading')}
                                  </div>
                                ) : regions.length === 0 ? (
                                  <div className="p-2 text-sm text-muted-foreground">
                                    {t('metrics.configurator.noRegions')}
                                  </div>
                                ) : (
                                  <>
                                    <DropdownMenuCheckboxItem
                                      key="all-regions"
                                      checked={selectedRegions.length === regions.length}
                                      onCheckedChange={checked => {
                                        if (checked) {
                                          setSelectedRegions(regions.map(r => r.id));
                                        } else {
                                          setSelectedRegions([]);
                                        }
                                      }}
                                    >
                                      {t('metrics.configurator.allRegions')}
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator />
                                    {regions.map(region => (
                                      <DropdownMenuCheckboxItem
                                        key={region.id}
                                        checked={selectedRegions.includes(region.id)}
                                        onCheckedChange={checked => {
                                          setSelectedRegions(prev => {
                                            let next;
                                            if (checked) {
                                              next = [...prev, region.id];
                                            } else {
                                              next = prev.filter(id => id !== region.id);
                                            }
                                            // Si tout est sélectionné individuellement, activer "Toutes les régions"
                                            if (next.length === regions.length) {
                                              return regions.map(r => r.id);
                                            }
                                            return next;
                                          });
                                        }}
                                      >
                                        {region.name}
                                      </DropdownMenuCheckboxItem>
                                    ))}
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TabsContent>

                        <TabsContent value="chart" className="space-y-4 pt-4">
                          <div className="space-y-4">
                            {/* Chart Type Selection */}
                            <div className="space-y-2">
                              <Label htmlFor="chartType">Chart Type</Label>
                              <Select
                                value={chartType}
                                onValueChange={(value: string) => setChartType(value as any)}
                              >
                                <SelectTrigger id="chartType">
                                  <SelectValue placeholder="Select chart type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="line">Line Chart</SelectItem>
                                  <SelectItem value="area">Area Chart</SelectItem>
                                  <SelectItem value="bar">Bar Chart</SelectItem>
                                  <SelectItem value="pie">Pie Chart</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Stacked option for bar and area charts */}
                            {(chartType === 'bar' || chartType === 'area') && (
                              <div className="flex items-center justify-between">
                                <Label htmlFor="stacked">Stacked Chart</Label>
                                <Switch
                                  id="stacked"
                                  checked={stacked}
                                  onCheckedChange={setStacked}
                                />
                              </div>
                            )}

                            {/* Separate regions option */}
                            <div className="flex items-center justify-between">
                              <Label htmlFor="separate-regions">
                                {t('metrics.configurator.separateRegions') || 'Separate Regions'}
                              </Label>
                              <Switch
                                id="separate-regions"
                                checked={separateRegions}
                                onCheckedChange={setSeparateRegions}
                              />
                            </div>

                            {/* Common options */}
                            <div className="flex items-center justify-between">
                              <Label htmlFor="show-legend">Show Legend</Label>
                              <Switch
                                id="show-legend"
                                checked={showLegend}
                                onCheckedChange={setShowLegend}
                              />
                            </div>

                            {/* Color scheme selection */}
                            <div className="space-y-2">
                              <Label>Color Scheme</Label>
                              <div className="flex gap-3">
                                {(['default', 'pastel', 'vibrant'] as const).map(scheme => (
                                  <Button
                                    key={scheme}
                                    type="button"
                                    variant={colorScheme === scheme ? 'default' : 'outline'}
                                    className="flex-1"
                                    onClick={() => setColorScheme(scheme)}
                                    size="sm"
                                  >
                                    {scheme.charAt(0).toUpperCase() + scheme.slice(1)}
                                  </Button>
                                ))}
                              </div>
                            </div>

                            {/* Line chart specific options */}
                            {chartType === 'line' && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="curveType">Curve Type</Label>
                                  <Select
                                    value={curveType}
                                    onValueChange={(value: string) => setCurveType(value as any)}
                                  >
                                    <SelectTrigger id="curveType">
                                      <SelectValue placeholder="Select curve type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="linear">Linear</SelectItem>
                                      <SelectItem value="monotone">Smooth</SelectItem>
                                      <SelectItem value="step">Step</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center justify-between">
                                  <Label htmlFor="hide-dots">Hide dots</Label>
                                  <Switch
                                    id="hide-dots"
                                    checked={hideDots}
                                    onCheckedChange={setHideDots}
                                  />
                                </div>
                              </>
                            )}

                            {/* Pie chart specific options */}
                            {chartType === 'pie' && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="innerRadius">Inner Radius ({innerRadius})</Label>
                                  <input
                                    id="innerRadius"
                                    type="range"
                                    min="0"
                                    max="80"
                                    value={innerRadius}
                                    onChange={e => setInnerRadius(Number(e.target.value))}
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="outerRadius">Outer Radius ({outerRadius})</Label>
                                  <input
                                    id="outerRadius"
                                    type="range"
                                    min="50"
                                    max="150"
                                    value={outerRadius}
                                    onChange={e => setOuterRadius(Number(e.target.value))}
                                    className="w-full"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="table" className="space-y-4 pt-4">
                          <div className="space-y-4">
                            <h3 className="text-lg font-medium">
                              {t('metrics.configurator.tableOptions') || 'Table Options'}
                            </h3>

                            {/* Table settings */}
                            <div className="flex items-center justify-between">
                              <Label htmlFor="show-row-numbers">
                                {t('metrics.configurator.showRowNumbers') || 'Show row numbers'}
                              </Label>
                              <Switch
                                id="show-row-numbers"
                                checked={tableView.showRowNumbers}
                                onCheckedChange={checked =>
                                  setTableView(prev => ({ ...prev, showRowNumbers: checked }))
                                }
                              />
                            </div>

                            <div className="flex items-center justify-between">
                              <Label htmlFor="show-filters">
                                {t('metrics.configurator.showFilters') || 'Show filters'}
                              </Label>
                              <Switch
                                id="show-filters"
                                checked={tableView.showFilters}
                                onCheckedChange={checked =>
                                  setTableView(prev => ({ ...prev, showFilters: checked }))
                                }
                              />
                            </div>

                            <div className="flex items-center justify-between">
                              <Label htmlFor="enable-sorting">
                                {t('metrics.configurator.enableSorting') || 'Enable sorting'}
                              </Label>
                              <Switch
                                id="enable-sorting"
                                checked={tableView.enableSorting}
                                onCheckedChange={checked =>
                                  setTableView(prev => ({ ...prev, enableSorting: checked }))
                                }
                              />
                            </div>

                            <div className="flex items-center justify-between">
                              <Label htmlFor="enable-pagination">
                                {t('metrics.configurator.enablePagination') || 'Enable pagination'}
                              </Label>
                              <Switch
                                id="enable-pagination"
                                checked={tableView.enablePagination}
                                onCheckedChange={checked =>
                                  setTableView(prev => ({ ...prev, enablePagination: checked }))
                                }
                              />
                            </div>

                            {/* Page size selection */}
                            <div className="space-y-2">
                              <Label htmlFor="page-size">
                                {t('metrics.configurator.pageSize') || 'Page size'}
                              </Label>
                              <Select
                                value={tableView.pageSize.toString()}
                                onValueChange={value =>
                                  setTableView(prev => ({ ...prev, pageSize: parseInt(value) }))
                                }
                              >
                                <SelectTrigger id="page-size">
                                  <SelectValue
                                    placeholder={
                                      t('metrics.configurator.selectPageSize') || 'Select page size'
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="5">5</SelectItem>
                                  <SelectItem value="10">10</SelectItem>
                                  <SelectItem value="25">25</SelectItem>
                                  <SelectItem value="50">50</SelectItem>
                                  <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Density selection */}
                            <div className="space-y-2">
                              <Label htmlFor="density">
                                {t('metrics.configurator.tableDensity') || 'Table density'}
                              </Label>
                              <Select
                                value={tableView.density}
                                onValueChange={(value: 'default' | 'compact' | 'comfortable') =>
                                  setTableView(prev => ({ ...prev, density: value }))
                                }
                              >
                                <SelectTrigger id="density">
                                  <SelectValue
                                    placeholder={
                                      t('metrics.configurator.selectDensity') || 'Select density'
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="compact">
                                    {t('metrics.configurator.densityOptions.compact') || 'Compact'}
                                  </SelectItem>
                                  <SelectItem value="default">
                                    {t('metrics.configurator.densityOptions.default') || 'Default'}
                                  </SelectItem>
                                  <SelectItem value="comfortable">
                                    {t('metrics.configurator.densityOptions.comfortable') ||
                                      'Comfortable'}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Group by selection */}
                            <div className="space-y-2">
                              <Label htmlFor="group-by">
                                {t('metrics.configurator.groupBy') || 'Group by'}
                              </Label>
                              <Select
                                value={tableView.groupBy}
                                onValueChange={(
                                  value: 'year' | 'metric' | 'year-metric' | 'metric-year'
                                ) => setTableView(prev => ({ ...prev, groupBy: value }))}
                              >
                                <SelectTrigger id="group-by">
                                  <SelectValue
                                    placeholder={
                                      t('metrics.configurator.selectGroupBy') || 'Select grouping'
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="year">
                                    {t('metrics.configurator.groupByOptions.year') || 'Year'}
                                  </SelectItem>
                                  <SelectItem value="metric">
                                    {t('metrics.configurator.groupByOptions.metric') || 'Metric'}
                                  </SelectItem>
                                  <SelectItem value="year-metric">
                                    {t('metrics.configurator.groupByOptions.yearMetric') ||
                                      'Year - Metric'}
                                  </SelectItem>
                                  <SelectItem value="metric-year">
                                    {t('metrics.configurator.groupByOptions.metricYear') ||
                                      'Metric - Year'}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>

                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setEditOpen(false)} size="sm">
                          Cancel
                        </Button>
                        <Button onClick={handleUpdateChart} disabled={!chartName} size="sm">
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : chartData ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <BarChart className="h-6 w-6" />
                <CardTitle className="text-3xl font-bold tracking-tight">
                  {chartData.name}
                </CardTitle>
              </div>
              {chartConfig?.description && (
                <CardDescription className="mt-1">{chartConfig.description}</CardDescription>
              )}
            </>
          ) : null}
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-80 w-full" />
            </div>
          ) : chartData ? (
            <Tabs defaultValue="chart">
              <div className="mb-4 flex justify-center">
                <TabsList>
                  <TabsTrigger value="chart">Chart</TabsTrigger>
                  <TabsTrigger value="table">Table</TabsTrigger>
                  <TabsTrigger value="api">API</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="chart">
                <div className="mb-4 flex justify-end">
                  <Button variant="outline" onClick={() => copyEmbedLink('chart')}>
                    <Link className="mr-2 h-4 w-4" />
                    {t('library.detail.copyEmbedLink')}
                  </Button>
                </div>
                <div className="h-80">
                  {selectedMetrics.length > 0 ? (
                    <RenderChart
                      metricIds={editOpen ? selectedMetrics : chartData.metrics}
                      chartType={editOpen ? chartType : chartConfig?.type || 'line'}
                      dateRange={
                        editOpen
                          ? previewDateRange
                          : {
                              from: chartConfig?.dateRange?.from
                                ? new Date(chartConfig.dateRange.from)
                                : undefined,
                              to: chartConfig?.dateRange?.to
                                ? new Date(chartConfig.dateRange.to)
                                : undefined,
                            }
                      }
                      showLegend={
                        editOpen
                          ? showLegend
                          : chartConfig?.showLegend !== undefined
                            ? chartConfig.showLegend
                            : true
                      }
                      colorScheme={editOpen ? colorScheme : chartConfig?.colorScheme || 'default'}
                      curveType={editOpen ? curveType : chartConfig?.curveType}
                      innerRadius={editOpen ? innerRadius : chartConfig?.innerRadius}
                      outerRadius={editOpen ? outerRadius : chartConfig?.outerRadius}
                      stacked={editOpen ? stacked : chartConfig?.stacked || false}
                      regionIds={editOpen ? selectedRegions : chartData.regions}
                      hideDots={editOpen ? hideDots : chartConfig?.hideDots || false}
                      aggregation="none"
                      separateRegions={
                        editOpen ? separateRegions : chartConfig?.separateRegions || false
                      }
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-muted-foreground">
                        {t('metrics.configurator.selectMetricsToPreview')}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="table">
                <div className="mb-4 flex justify-end">
                  <Button variant="outline" onClick={() => copyEmbedLink('table')}>
                    <Link className="mr-2 h-4 w-4" />
                    {t('library.detail.copyEmbedLink')}
                  </Button>
                </div>
                {selectedMetrics.length > 0 ? (
                  <RenderTable
                    metricIds={editOpen ? selectedMetrics : chartData.metrics}
                    dateRange={
                      editOpen
                        ? previewDateRange
                        : {
                            from: chartConfig?.dateRange?.from
                              ? new Date(chartConfig.dateRange.from)
                              : undefined,
                            to: chartConfig?.dateRange?.to
                              ? new Date(chartConfig.dateRange.to)
                              : undefined,
                          }
                    }
                    regionIds={editOpen ? selectedRegions : chartData.regions}
                    tableConfig={
                      editOpen
                        ? tableView
                        : chartConfig?.tableView || {
                            showRowNumbers: true,
                            showFilters: true,
                            pageSize: 10,
                            enableSorting: true,
                            enablePagination: true,
                            density: 'default',
                            groupBy: 'year-metric',
                          }
                    }
                    onConfigChange={newConfig => setTableView(newConfig)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-muted-foreground">
                      {t('metrics.configurator.selectMetricsToPreview')}
                    </p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="api">
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 text-lg font-semibold">API Integration</h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Use our REST API to integrate this dataset into your application.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-md mb-2 font-medium">Endpoint</h4>
                    <div className="rounded-md bg-muted p-2 font-mono text-sm">
                      GET /api/metrics/data
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md mb-2 font-medium">Query Parameters</h4>
                    <div className="divide-y rounded-md border">
                      <div className="grid grid-cols-3 p-2">
                        <div className="font-medium">Parameter</div>
                        <div className="font-medium">Description</div>
                        <div className="font-medium">Example</div>
                      </div>
                      <div className="grid grid-cols-3 p-2">
                        <div className="font-mono text-sm">chart_id</div>
                        <div className="text-sm">The ID of this chart</div>
                        <div className="font-mono text-sm">{chartId}</div>
                      </div>
                      <div className="grid grid-cols-3 p-2">
                        <div className="font-mono text-sm">metrics</div>
                        <div className="text-sm">Comma-separated metric IDs</div>
                        <div className="font-mono text-sm">{chartData?.metrics.join(',')}</div>
                      </div>
                      <div className="grid grid-cols-3 p-2">
                        <div className="font-mono text-sm">regions</div>
                        <div className="text-sm">Comma-separated region IDs (optional)</div>
                        <div className="font-mono text-sm">
                          {chartData?.regions?.join(',') || 'all'}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 p-2">
                        <div className="font-mono text-sm">from</div>
                        <div className="text-sm">Start date (ISO format)</div>
                        <div className="font-mono text-sm">
                          {chartConfig?.dateRange?.from ||
                            new Date(yearRange[0], 0, 1).toISOString()}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 p-2">
                        <div className="font-mono text-sm">to</div>
                        <div className="text-sm">End date (ISO format)</div>
                        <div className="font-mono text-sm">
                          {chartConfig?.dateRange?.to ||
                            new Date(yearRange[1], 11, 31).toISOString()}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 p-2">
                        <div className="font-mono text-sm">format</div>
                        <div className="text-sm">Response format (json or csv)</div>
                        <div className="font-mono text-sm">json</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md mb-2 font-medium">Example Request</h4>
                    <div className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-sm">
                      {`fetch('/api/metrics/data?chart_id=${chartId}&metrics=${chartData?.metrics.join(',')}&from=${encodeURIComponent(
                        chartConfig?.dateRange?.from || new Date(yearRange[0], 0, 1).toISOString()
                      )}&to=${encodeURIComponent(
                        chartConfig?.dateRange?.to || new Date(yearRange[1], 11, 31).toISOString()
                      )}')`}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md mb-2 font-medium">Example Response</h4>
                    <div className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-sm">
                      {`{
  "data": [
    {
      "metric_id": "${chartData?.metrics[0] || 'metric-id'}",
      "metric_name": "Example Metric",
      "region_id": "${chartData?.regions?.[0] || 'region-id'}",
      "region_name": "Example Region",
      "year": ${yearRange[0]},
      "value": 42.5
    },
    // Additional data points...
  ],
  "metadata": {
    "chart_id": "${chartId}",
    "chart_name": "${chartData?.name || 'Chart Name'}",
    "metrics_count": ${chartData?.metrics.length || 0},
    "regions_count": ${chartData?.regions?.length || 0},
    "date_range": {
      "from": "${chartConfig?.dateRange?.from || new Date(yearRange[0], 0, 1).toISOString()}",
      "to": "${chartConfig?.dateRange?.to || new Date(yearRange[1], 11, 31).toISOString()}"
    }
  }
}`}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md mb-2 font-medium">Authentication</h4>
                    <p className="mb-2 text-sm">
                      API requests require authentication using an API key.
                    </p>
                    <div className="rounded-md bg-muted p-2 font-mono text-sm">
                      {`fetch('/api/metrics/data?chart_id=${chartId}', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})`}
                    </div>
                    <p className="mt-2 text-sm">
                      You can generate an API key in your account settings.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-md mb-2 font-medium">Rate Limits</h4>
                    <p className="text-sm">
                      Free tier: 100 requests/hour
                      <br />
                      Premium tier: 1,000 requests/hour
                      <br />
                      Enterprise tier: Unlimited requests
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex h-96 items-center justify-center">
              <p className="text-muted-foreground">{t('library.detail.chartNotFound')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.detail.deleteChartConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.detail.deleteChartConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChart}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
