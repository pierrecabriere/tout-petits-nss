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
import { MetricTreeSelector } from '@/components/ui/metric-tree-selector';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { YearRangeSlider } from '@/components/ui/year-range-slider';

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

export default function ConfiguratorPage() {
  const t = useTranslations();
  const { toast } = useToast();
  const router = useRouter();

  // State for metric selection
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // State for chart configuration
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie' | 'area'>('line');
  const [yearRange, setYearRange] = useState<[number, number]>([
    new Date().getFullYear() - 5,
    new Date().getFullYear(),
  ]);

  // For backwards compatibility with components expecting date objects
  const dateRange = {
    from: new Date(yearRange[0], 0, 1), // January 1st of start year
    to: new Date(yearRange[1], 11, 31), // December 31st of end year
  };

  // Chart specific configuration
  const [showLegend, setShowLegend] = useState(true);
  const [colorScheme, setColorScheme] = useState<'default' | 'pastel' | 'vibrant'>('default');
  const [curveType, setCurveType] = useState<'linear' | 'monotone' | 'step'>('monotone');
  const [innerRadius, setInnerRadius] = useState<number>(0);
  const [outerRadius, setOuterRadius] = useState<number>(80);
  const [hideDots, setHideDots] = useState(false);

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [chartName, setChartName] = useState('');
  const [chartDescription, setChartDescription] = useState('');

  // Default active tab
  const [activeTab, setActiveTab] = useState('default');

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

  const handleSaveChart = async () => {
    try {
      // Create chart record with metrics embedded in the config
      const { data: chart, error } = await supabaseClient
        .from('charts')
        .insert({
          name: chartName,
          description: chartDescription,
          config: {
            title: chartName,
            description: chartDescription,
            type: chartType,
            dateRange: {
              from: new Date(yearRange[0], 0, 1).toISOString(), // January 1st of start year
              to: new Date(yearRange[1], 11, 31).toISOString(), // December 31st of end year
            },
            yearRange: yearRange,
            metrics: selectedMetrics,
            regions: selectedRegions,
            showLegend,
            colorScheme,
            curveType: chartType === 'line' ? curveType : undefined,
            innerRadius: chartType === 'pie' ? innerRadius : undefined,
            outerRadius: chartType === 'pie' ? outerRadius : undefined,
            hideDots: chartType === 'line' ? hideDots : undefined,
          },
          metadata: null,
        })
        .select()
        .single();

      if (error) throw error;

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
          <CardTitle>{t('metrics.configurator.chartConfiguration')}</CardTitle>
          <CardDescription>{t('metrics.configurator.configureCustomize')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="default" onValueChange={setActiveTab} value={activeTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="default">{t('metrics.configurator.basicSettings')}</TabsTrigger>
              <TabsTrigger value="options">{t('metrics.configurator.chartOptions')}</TabsTrigger>
              <TabsTrigger value="preview">{t('metrics.configurator.preview')}</TabsTrigger>
            </TabsList>

            <TabsContent value="default" className="space-y-6 pt-4">
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
                        <div className="my-1 border-b" />
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
                {selectedRegions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedRegions.length === regions.length ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium">
                        {t('metrics.configurator.allRegions')}
                        <button
                          className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                          onClick={() => setSelectedRegions([])}
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
                      </span>
                    ) : (
                      selectedRegions.map(regionId => {
                        const region = regions.find(r => r.id === regionId);
                        return (
                          <span
                            key={regionId}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium"
                          >
                            {region?.name || regionId}
                            <button
                              className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                              onClick={() =>
                                setSelectedRegions(prev => prev.filter(id => id !== regionId))
                              }
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
                          </span>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="options" className="space-y-4 pt-4">
              <div className="space-y-4">
                {/* Chart Type Selection */}
                <div className="space-y-2">
                  <Label htmlFor="chartType">{t('metrics.configurator.chartType')}</Label>
                  <Select
                    value={chartType}
                    onValueChange={(value: string) => setChartType(value as any)}
                  >
                    <SelectTrigger id="chartType">
                      <SelectValue placeholder={t('metrics.configurator.selectChartType')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="line">
                        {t('metrics.configurator.chartTypes.line')}
                      </SelectItem>
                      <SelectItem value="area">
                        {t('metrics.configurator.chartTypes.area')}
                      </SelectItem>
                      <SelectItem value="bar">
                        {t('metrics.configurator.chartTypes.bar')}
                      </SelectItem>
                      <SelectItem value="pie">
                        {t('metrics.configurator.chartTypes.pie')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Common options */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-legend">{t('metrics.configurator.showLegend')}</Label>
                  <Switch id="show-legend" checked={showLegend} onCheckedChange={setShowLegend} />
                </div>

                {/* Color scheme selection */}
                <div className="space-y-2">
                  <Label>{t('metrics.configurator.colorScheme')}</Label>
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

                {/* Line chart specific options */}
                {chartType === 'line' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="curveType">{t('metrics.configurator.curveType')}</Label>
                      <Select
                        value={curveType}
                        onValueChange={(value: string) => setCurveType(value as any)}
                      >
                        <SelectTrigger id="curveType">
                          <SelectValue placeholder={t('metrics.configurator.selectCurveType')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="linear">
                            {t('metrics.configurator.curves.linear')}
                          </SelectItem>
                          <SelectItem value="monotone">
                            {t('metrics.configurator.curves.monotone')}
                          </SelectItem>
                          <SelectItem value="step">
                            {t('metrics.configurator.curves.step')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="hide-dots">
                        {t('metrics.configurator.hideDots') || 'Hide dots'}
                      </Label>
                      <Switch id="hide-dots" checked={hideDots} onCheckedChange={setHideDots} />
                    </div>
                  </>
                )}

                {/* Pie chart specific options */}
                {chartType === 'pie' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="innerRadius">
                        {t('metrics.configurator.innerRadius')} ({innerRadius})
                      </Label>
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
                      <Label htmlFor="outerRadius">
                        {t('metrics.configurator.outerRadius')} ({outerRadius})
                      </Label>
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
                <h3 className="mb-2 text-lg font-medium">
                  {t('metrics.configurator.chartPreview')}
                </h3>
                <div className="h-[400px] rounded-md border bg-muted/30">
                  {selectedMetrics.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-muted-foreground">
                        {t('metrics.configurator.selectMetricsToPreview')}
                      </p>
                    </div>
                  ) : (
                    <RenderChart
                      metricIds={selectedMetrics}
                      chartType={chartType}
                      dateRange={dateRange}
                      showLegend={showLegend}
                      colorScheme={colorScheme}
                      curveType={curveType}
                      innerRadius={innerRadius}
                      outerRadius={outerRadius}
                      regionIds={selectedRegions}
                      hideDots={chartType === 'line' ? hideDots : undefined}
                      aggregation="none"
                      stacked={false}
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
                {t('metrics.configurator.saveToLibrary')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('metrics.configurator.saveChartToLibrary')}</DialogTitle>
                <DialogDescription>
                  {t('metrics.configurator.saveChartDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="chart-name">{t('metrics.configurator.chartName')}</Label>
                  <Input
                    id="chart-name"
                    value={chartName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setChartName(e.target.value)
                    }
                    placeholder={t('metrics.configurator.enterChartName')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chart-description">{t('metrics.configurator.description')}</Label>
                  <Textarea
                    id="chart-description"
                    value={chartDescription}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setChartDescription(e.target.value)
                    }
                    placeholder={t('metrics.configurator.enterChartDescription')}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                  {t('metrics.configurator.cancel')}
                </Button>
                <Button onClick={handleSaveChart} disabled={!chartName}>
                  {t('metrics.configurator.saveChart')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  );
}
