'use client';

import { useTranslations } from 'next-intl';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Check, CalendarIcon, Save, ChevronDown, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import RenderChart from '@/components/ui/charts/RenderChart';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangePicker } from '@/components/ui/date-range-picker';

// Temporary implementations for missing components (remove once you've created the actual components)
const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
  />
);

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

// Wrapper component to ensure date values persist
function DateRangePickerWithPersistence({
  value,
  onChange,
}: {
  value: { from: Date | undefined; to: Date | undefined };
  onChange: (value: { from: Date | undefined; to: Date | undefined }) => void;
}) {
  // Using refs to store the current value to use as initialDate props
  const [currentDateFrom, setCurrentDateFrom] = useState<Date | undefined>(value.from);
  const [currentDateTo, setCurrentDateTo] = useState<Date | undefined>(value.to);

  // Update internal state when parent values change
  useEffect(() => {
    setCurrentDateFrom(value.from);
    setCurrentDateTo(value.to);
  }, [value.from, value.to]);

  return (
    <DateRangePicker
      initialDateFrom={currentDateFrom}
      initialDateTo={currentDateTo}
      onUpdate={({ range }) => {
        // Update both the parent state and our internal reference
        onChange({
          from: range.from,
          to: range.to,
        });
        setCurrentDateFrom(range.from);
        setCurrentDateTo(range.to);
      }}
      align="start"
      locale="en-US"
      showCompare={false}
      className="w-full justify-start px-3 py-2"
    />
  );
}

export default function ConfiguratorPage() {
  const t = useTranslations();
  const { toast } = useToast();
  const router = useRouter();

  // State for metric selection
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // State for chart configuration
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie' | 'area'>('line');
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: new Date(),
    to: new Date(new Date().setDate(new Date().getDate() + 7)),
  });

  // Chart specific configuration
  const [showLegend, setShowLegend] = useState(true);
  const [stacked, setStacked] = useState(false);
  const [colorScheme, setColorScheme] = useState<'default' | 'pastel' | 'vibrant'>('default');
  const [aggregation, setAggregation] = useState<'none' | 'sum' | 'avg' | 'min' | 'max'>('none');
  const [curveType, setCurveType] = useState<'linear' | 'monotone' | 'step'>('monotone');
  const [innerRadius, setInnerRadius] = useState<number>(0);
  const [outerRadius, setOuterRadius] = useState<number>(80);

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [chartName, setChartName] = useState('');
  const [chartDescription, setChartDescription] = useState('');

  // Default active tab
  const [activeTab, setActiveTab] = useState('default');

  // Fetch metrics data
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('metrics').select('*');

      if (error) throw error;
      return data as Tables<'metrics'>[];
    },
  });

  const handleSelectMetric = (metricId: string) => {
    if (selectedMetrics.includes(metricId)) {
      setSelectedMetrics(selectedMetrics.filter(id => id !== metricId));
    } else {
      setSelectedMetrics([...selectedMetrics, metricId]);
    }
  };

  const filteredMetrics = metrics?.filter(
    metric =>
      metric.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (metric.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSaveChart = async () => {
    try {
      // Create chart record
      const { data: chart, error } = await supabaseClient
        .from('charts')
        .insert({
          name: chartName,
          description: chartDescription,
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
          created_by: null, // Will be replaced by the user ID in a real implementation
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Associate metrics with the chart
      const chartMetricsPromises = selectedMetrics.map(metricId =>
        supabaseClient.from('chart_metrics').insert({
          chart_id: chart.id,
          metric_id: metricId,
          series_cfg: null,
        })
      );

      await Promise.all(chartMetricsPromises);

      toast({
        title: 'Chart saved successfully',
        description: 'Your chart has been created and saved to the library.',
      });

      setSaveDialogOpen(false);
      router.push('/library');
    } catch (error) {
      console.error('Error saving chart:', error);
      toast({
        title: 'Error saving chart',
        description: 'An error occurred while saving your chart.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('metrics.configurator.title')}</h1>
        <p className="text-muted-foreground">{t('metrics.configurator.description')}</p>
      </div>

      {/* Single main content card */}
      <Card>
        <CardHeader>
          <CardTitle>Chart Configuration & Preview</CardTitle>
          <CardDescription>Configure metrics and customize your chart</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="default" onValueChange={setActiveTab} value={activeTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="default">Basic Settings</TabsTrigger>
              <TabsTrigger value="options">Chart Options</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="default" className="space-y-6 pt-4">
              {/* Metrics selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('metrics.configurator.selectMetrics')}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedMetrics.length} metrics selected
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
                        ? `${selectedMetrics.length} metric${selectedMetrics.length > 1 ? 's' : ''} selected`
                        : 'Select metrics...'}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="flex items-center border-b px-3 py-2">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <Input
                        placeholder="Search metrics..."
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
                      <div className="max-h-[300px] overflow-y-auto p-1">
                        {filteredMetrics?.length === 0 && (
                          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                            No metrics found.
                          </div>
                        )}
                        {filteredMetrics?.map(metric => {
                          const firstSelectedMetric =
                            selectedMetrics.length > 0
                              ? metrics?.find(m => m.id === selectedMetrics[0])
                              : undefined;
                          const isDisabled =
                            selectedMetrics.length > 0 &&
                            firstSelectedMetric?.unit !== metric.unit &&
                            !selectedMetrics.includes(metric.id);
                          return (
                            <div
                              key={metric.id}
                              className={cn(
                                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                                selectedMetrics.includes(metric.id) &&
                                  'bg-accent text-accent-foreground',
                                isDisabled && 'pointer-events-none opacity-50'
                              )}
                              onClick={() => !isDisabled && handleSelectMetric(metric.id)}
                            >
                              <div className="flex flex-1 items-center gap-2">
                                <Checkbox
                                  checked={selectedMetrics.includes(metric.id)}
                                  className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                  disabled={isDisabled}
                                />
                                <div className="text-sm">
                                  <p className="font-medium">
                                    {metric.name}
                                    {metric.unit && (
                                      <span className="ml-1 text-xs text-muted-foreground">
                                        ({metric.unit})
                                      </span>
                                    )}
                                  </p>
                                  {metric.description && (
                                    <p className="max-w-[250px] truncate text-xs text-muted-foreground">
                                      {metric.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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

              {/* Date Range Selection */}
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="w-full">
                  <DateRangePickerWithPersistence value={dateRange} onChange={setDateRange} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="options" className="space-y-6 pt-4">
              <div className="space-y-4">
                {/* Common options */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-legend">Show Legend</Label>
                  <Switch id="show-legend" checked={showLegend} onCheckedChange={setShowLegend} />
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
                        onClick={() => {
                          console.log('Color scheme changed to:', scheme);
                          setColorScheme(scheme);
                        }}
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

            <TabsContent value="preview" className="space-y-4 pt-4">
              <div>
                <h3 className="mb-2 text-lg font-medium">Chart Preview</h3>
                <div className="h-[400px] rounded-md border bg-muted/30">
                  {selectedMetrics.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-muted-foreground">Select metrics to preview chart</p>
                    </div>
                  ) : (
                    <RenderChart
                      metricIds={selectedMetrics}
                      chartType={chartType}
                      dateRange={dateRange}
                      showLegend={showLegend}
                      stacked={stacked}
                      colorScheme={colorScheme}
                      aggregation={aggregation}
                      curveType={curveType}
                      innerRadius={innerRadius}
                      outerRadius={outerRadius}
                    />
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={selectedMetrics.length === 0}>
                <Save className="mr-2 h-4 w-4" />
                Save to Library
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Chart to Library</DialogTitle>
                <DialogDescription>
                  Provide a name and description for your chart to save it to your library.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="chart-name">Chart Name</Label>
                  <Input
                    id="chart-name"
                    value={chartName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setChartName(e.target.value)
                    }
                    placeholder="Enter chart name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chart-description">Description</Label>
                  <Textarea
                    id="chart-description"
                    value={chartDescription}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setChartDescription(e.target.value)
                    }
                    placeholder="Enter chart description"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveChart} disabled={!chartName}>
                  Save Chart
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  );
}
