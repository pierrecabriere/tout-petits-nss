'use client';

import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, BarChart, Edit, Save, ChevronDown } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
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
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

  // State for chart configuration
  const [chartName, setChartName] = useState('');
  const [chartDescription, setChartDescription] = useState('');
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie' | 'area'>('line');
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });
  const [showLegend, setShowLegend] = useState(true);
  const [stacked, setStacked] = useState(false);
  const [colorScheme, setColorScheme] = useState<'default' | 'pastel' | 'vibrant'>('default');
  const [aggregation, setAggregation] = useState<'none' | 'sum' | 'avg' | 'min' | 'max'>('none');
  const [curveType, setCurveType] = useState<'linear' | 'monotone' | 'step'>('monotone');
  const [innerRadius, setInnerRadius] = useState<number>(0);
  const [outerRadius, setOuterRadius] = useState<number>(80);

  // Fetch chart details and associated metrics
  const { data: chartData, isLoading } = useQuery({
    queryKey: ['chart-detail', chartId],
    queryFn: async () => {
      // Get chart details
      const { data: chart, error } = await supabaseClient
        .from('charts')
        .select('*')
        .eq('id', chartId)
        .single();

      if (error) throw error;

      // Get associated metrics
      const { data: chartMetrics, error: metricsError } = await supabaseClient
        .from('chart_metrics')
        .select('metric_id')
        .eq('chart_id', chartId);

      if (metricsError) throw metricsError;

      // Return combined data
      return {
        ...chart,
        metrics: chartMetrics.map(cm => cm.metric_id),
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
          chart_type: chartType,
          config: {
            title: chartName,
            description: chartDescription,
            type: chartType,
            dateRange: {
              from: dateRange.from?.toISOString(),
              to: dateRange.to?.toISOString(),
            },
            showLegend,
            stacked,
            colorScheme,
            aggregation,
            curveType: chartType === 'line' ? curveType : undefined,
            innerRadius: chartType === 'pie' ? innerRadius : undefined,
            outerRadius: chartType === 'pie' ? outerRadius : undefined,
          },
          updated_at: new Date().toISOString(),
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
      setDateRange({
        from: chartConfig?.dateRange?.from ? new Date(chartConfig.dateRange.from) : undefined,
        to: chartConfig?.dateRange?.to ? new Date(chartConfig.dateRange.to) : undefined,
      });
      setShowLegend(chartConfig?.showLegend ?? true);
      setStacked(chartConfig?.stacked ?? false);
      setColorScheme(chartConfig?.colorScheme || 'default');
      setAggregation(chartConfig?.aggregation || 'none');
      setCurveType(chartConfig?.curveType || 'monotone');
      setInnerRadius(chartConfig?.innerRadius ?? 0);
      setOuterRadius(chartConfig?.outerRadius ?? 80);
    }
  }, [chartData, chartConfig]);

  // Handle chart update
  const handleUpdateChart = () => {
    updateChartMutation.mutate();
  };

  // Fonction pour voir les changements en temps réel
  const getPreviewConfig = () => {
    return {
      type: chartType,
      dateRange: {
        from: dateRange.from,
        to: dateRange.to,
      },
      showLegend,
      stacked,
      colorScheme,
      aggregation,
      curveType: chartType === 'line' ? curveType : undefined,
      innerRadius: chartType === 'pie' ? innerRadius : undefined,
      outerRadius: chartType === 'pie' ? outerRadius : undefined,
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBackClick} className="-ml-2">
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('library.detail.backToLibrary')}
        </Button>
        {chartData && (
          <Popover open={editOpen} onOpenChange={setEditOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                {t('library.detail.editChart')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-4" align="end">
              <div className="space-y-4">
                <h3 className="font-medium">{t('library.detail.editChart')}</h3>

                <Tabs defaultValue="default" onValueChange={setActiveTab} value={activeTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="default">Basic Settings</TabsTrigger>
                    <TabsTrigger value="options">Chart Options</TabsTrigger>
                  </TabsList>

                  <TabsContent value="default" className="space-y-4 pt-4">
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
                  </TabsContent>

                  <TabsContent value="options" className="space-y-4 pt-4">
                    <div className="space-y-4">
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

                      {/* Options specific to bar and line charts */}
                      {(chartType === 'bar' || chartType === 'line' || chartType === 'area') && (
                        <>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="stacked">Stacked</Label>
                            <Switch id="stacked" checked={stacked} onCheckedChange={setStacked} />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="aggregation">Data Aggregation</Label>
                            <Select
                              value={aggregation}
                              onValueChange={(value: string) => setAggregation(value as any)}
                            >
                              <SelectTrigger id="aggregation">
                                <SelectValue placeholder="Select aggregation" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="sum">Sum</SelectItem>
                                <SelectItem value="avg">Average</SelectItem>
                                <SelectItem value="min">Minimum</SelectItem>
                                <SelectItem value="max">Maximum</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}

                      {/* Line chart specific options */}
                      {chartType === 'line' && (
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
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : chartData ? (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart className="h-6 w-6" />
              <h1 className="text-3xl font-bold tracking-tight">{chartData.name}</h1>
            </div>
            {chartConfig?.description && (
              <p className="mt-1 text-muted-foreground">{chartConfig.description}</p>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{editOpen ? chartName : chartData.name}</CardTitle>
              {(editOpen ? chartDescription : chartConfig?.description) && (
                <CardDescription>
                  {editOpen ? chartDescription : chartConfig.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {chartData.metrics.length > 0 && (
                  <RenderChart
                    metricIds={chartData.metrics}
                    chartType={editOpen ? chartType : chartConfig?.type || 'line'}
                    dateRange={{
                      from: editOpen
                        ? dateRange.from
                        : chartConfig?.dateRange?.from
                          ? new Date(chartConfig.dateRange.from)
                          : undefined,
                      to: editOpen
                        ? dateRange.to
                        : chartConfig?.dateRange?.to
                          ? new Date(chartConfig.dateRange.to)
                          : undefined,
                    }}
                    showLegend={editOpen ? showLegend : chartConfig?.showLegend || true}
                    stacked={editOpen ? stacked : chartConfig?.stacked || false}
                    colorScheme={editOpen ? colorScheme : chartConfig?.colorScheme || 'default'}
                    aggregation={editOpen ? aggregation : chartConfig?.aggregation || 'none'}
                    curveType={editOpen ? curveType : chartConfig?.curveType}
                    innerRadius={editOpen ? innerRadius : chartConfig?.innerRadius}
                    outerRadius={editOpen ? outerRadius : chartConfig?.outerRadius}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex h-96 items-center justify-center">
          <p className="text-muted-foreground">{t('library.detail.chartNotFound')}</p>
        </div>
      )}
    </div>
  );
}
