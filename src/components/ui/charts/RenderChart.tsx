import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Skeleton } from '@/components/ui/skeleton';
import { Tables } from '@/types/database';

// Type for chart data structure
type ChartDataPoint = {
  timestamp: string;
  formattedDate: string;
  [key: string]: string | number;
};

// Type for the color schemes
type ColorScheme = {
  [key: string]: string[];
};

// Base chart configuration
type BaseChartConfig = {
  metricIds: string[];
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
  showLegend: boolean;
  showAxisLabels?: boolean;
  colorScheme: 'default' | 'pastel' | 'vibrant' | 'orange';
  aggregation: 'none' | 'sum' | 'avg' | 'min' | 'max';
  regionIds?: string[];
  hideDots?: boolean;
  separateRegions?: boolean;
};

// Chart-specific configurations
type LineChartConfig = BaseChartConfig & {
  chartType: 'line';
  curveType?: 'linear' | 'monotone' | 'step';
};

type BarChartConfig = BaseChartConfig & {
  chartType: 'bar';
  stacked?: boolean;
};

type AreaChartConfig = BaseChartConfig & {
  chartType: 'area';
  stacked?: boolean;
};

type PieChartConfig = BaseChartConfig & {
  chartType: 'pie';
  innerRadius?: number;
  outerRadius?: number;
};

// Combined type for all chart configurations
type RenderChartProps = LineChartConfig | BarChartConfig | AreaChartConfig | PieChartConfig;

// Color schemes definition
const COLOR_SCHEMES: ColorScheme = {
  // Bleu, vert, orange, violet, rouge, cyan, jaune
  default: ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#e11d48', '#0891b2', '#a16207'],
  // Versions plus claires, pastel de ces mêmes couleurs
  pastel: ['#93c5fd', '#86efac', '#fdba74', '#c4b5fd', '#fda4af', '#a5f3fc', '#fde68a'],
  // Versions plus vives, saturées de ces mêmes couleurs
  vibrant: ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#f43f5e', '#06b6d4', '#ca8a04'],
  // Custom scheme starting with #f16b1e
  orange: ['#f16b1e', '#3498db', '#2ecc71', '#9b59b6', '#e74c3c', '#1abc9c', '#f39c12'],
};

export default function RenderChart(props: RenderChartProps) {
  const {
    metricIds,
    chartType,
    dateRange,
    showLegend,
    colorScheme,
    aggregation,
    regionIds,
    separateRegions = false,
  } = props;
  const showAxisLabels = props.showAxisLabels !== undefined ? props.showAxisLabels : true;

  // Extraire les propriétés spécifiques au type de graphique avec des valeurs par défaut
  const curveType =
    chartType === 'line' ? (props as LineChartConfig).curveType || 'monotone' : undefined;
  const stacked =
    chartType === 'bar' || chartType === 'area'
      ? (props as BarChartConfig | AreaChartConfig).stacked || false
      : undefined;
  const innerRadius = chartType === 'pie' ? (props as PieChartConfig).innerRadius || 0 : undefined;
  const outerRadius = chartType === 'pie' ? (props as PieChartConfig).outerRadius || 80 : undefined;
  const hideDots = props.hideDots || false;

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [metricNames, setMetricNames] = useState<{ [key: string]: string }>({});
  const [metricUnits, setMetricUnits] = useState<{ [key: string]: string | null }>({});
  const [regionNames, setRegionNames] = useState<{ [key: string]: string }>({});
  const [visibleSeries, setVisibleSeries] = useState<{ [key: string]: boolean }>({});

  // Fetch metrics info (names and units) for the chart
  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['chart-metrics', metricIds],
    queryFn: async () => {
      if (!metricIds.length) return [];

      const { data, error } = await supabaseClient
        .from('metrics')
        .select('id, name, unit')
        .in('id', metricIds);

      if (error) throw error;
      return data as Tables<'metrics'>[];
    },
    enabled: metricIds.length > 0,
  });

  // Fetch regions info for the chart
  const { data: regions, isLoading: isLoadingRegions } = useQuery({
    queryKey: ['chart-regions', regionIds],
    queryFn: async () => {
      if (!regionIds || !regionIds.length) return [];

      const { data, error } = await supabaseClient
        .from('regions')
        .select('id, name')
        .in('id', regionIds);

      if (error) throw error;
      return data as Tables<'regions'>[];
    },
    enabled: separateRegions && regionIds !== undefined && regionIds.length > 0,
  });

  // Fetch data points for selected metrics and date range
  const { data: dataPoints, isLoading: isLoadingData } = useQuery({
    queryKey: ['chart-data-points', metricIds, dateRange, regionIds],
    queryFn: async () => {
      if (!metricIds.length || !dateRange.from || !dateRange.to) return [];
      if (regionIds && regionIds.length === 0) return [];
      const fromDate = dateRange.from.toISOString().split('T')[0];
      const toDate = dateRange.to.toISOString().split('T')[0];
      const dataPromises = metricIds.map(metricId => {
        let query = supabaseClient
          .from('metric_data')
          .select('*')
          .eq('metric_id', metricId)
          .gte('date', fromDate)
          .lte('date', toDate)
          .order('date', { ascending: true });
        if (regionIds && regionIds.length > 0) {
          query = query.in('region_id', regionIds);
        }
        return query;
      });
      const results = await Promise.all(dataPromises);
      const errors = results.filter(result => result.error);
      if (errors.length) throw errors[0].error;
      return results.map((result, index) => ({
        metricId: metricIds[index],
        data: result.data || [],
      }));
    },
    enabled:
      metricIds.length > 0 &&
      !!dateRange.from &&
      !!dateRange.to &&
      (regionIds === undefined || regionIds.length > 0),
  });

  // Process the fetched data into the format needed for charts
  useEffect(() => {
    if (!dataPoints || !metrics) return;

    // Create a map of metric IDs to names and units
    const namesMap: { [key: string]: string } = {};
    const unitsMap: { [key: string]: string | null } = {};

    metrics.forEach(metric => {
      namesMap[metric.id] = metric.name;
      unitsMap[metric.id] = metric.unit;
    });

    setMetricNames(namesMap);
    setMetricUnits(unitsMap);

    // Create a map of region IDs to names if separateRegions is enabled
    if (separateRegions && regions) {
      const regionsMap: { [key: string]: string } = {};
      regions.forEach(region => {
        regionsMap[region.id] = region.name;
      });
      setRegionNames(regionsMap);
    }

    if (separateRegions) {
      // For separate regions mode, organize data by date, metric and region
      const dataByTimestampMetricAndRegion: {
        [timestamp: string]: {
          [metricRegionKey: string]: number;
        };
      } = {};

      dataPoints.forEach(({ metricId, data }) => {
        data.forEach(point => {
          const timestamp = point.date;
          const regionId = point.region_id;

          if (!dataByTimestampMetricAndRegion[timestamp]) {
            dataByTimestampMetricAndRegion[timestamp] = {};
          }

          // Create a unique key for each metric-region combination
          const metricRegionKey = `${metricId}:${regionId}`;
          dataByTimestampMetricAndRegion[timestamp][metricRegionKey] = Number(point.value);

          // Initialize all series as visible in the first render
          if (visibleSeries[metricRegionKey] === undefined) {
            setVisibleSeries(prev => ({ ...prev, [metricRegionKey]: true }));
          }
        });
      });

      const processedData: ChartDataPoint[] = Object.keys(dataByTimestampMetricAndRegion).map(
        timestamp => {
          const date = new Date(timestamp);
          const formattedDate = date.getUTCFullYear().toString();

          const dataPoint: ChartDataPoint = {
            timestamp,
            formattedDate,
          };

          // Add each metric-region combination as a separate series
          Object.entries(dataByTimestampMetricAndRegion[timestamp]).forEach(
            ([metricRegionKey, value]) => {
              dataPoint[metricRegionKey] = value;
            }
          );

          return dataPoint;
        }
      );

      // Sort by timestamp
      processedData.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      setChartData(processedData);
    } else {
      // Original aggregated data processing for non-separate regions mode
      // Organize data points by date and metric
      const dataByTimestampAndMetric: {
        [timestamp: string]: {
          [metricId: string]: {
            sum: number;
            count: number;
          };
        };
      } = {};

      dataPoints.forEach(({ metricId, data }) => {
        data.forEach(point => {
          const timestamp = point.date; // Use date as timestamp

          if (!dataByTimestampAndMetric[timestamp]) {
            dataByTimestampAndMetric[timestamp] = {};
          }

          if (!dataByTimestampAndMetric[timestamp][metricId]) {
            dataByTimestampAndMetric[timestamp][metricId] = {
              sum: 0,
              count: 0,
            };
          }

          dataByTimestampAndMetric[timestamp][metricId].sum += Number(point.value);
          dataByTimestampAndMetric[timestamp][metricId].count += 1;
        });
      });

      // Transform the data into an array for Recharts
      const processedData: ChartDataPoint[] = Object.keys(dataByTimestampAndMetric).map(
        timestamp => {
          const date = new Date(timestamp);
          // Afficher uniquement l'année
          const formattedDate = date.getUTCFullYear().toString();

          const dataPoint: ChartDataPoint = {
            timestamp,
            formattedDate,
          };

          // Add values for each metric based on the aggregation method
          metricIds.forEach(metricId => {
            const metricData = dataByTimestampAndMetric[timestamp][metricId];
            if (metricData) {
              // Apply region aggregation based on selected method
              if (aggregation === 'avg' && metricData.count > 0) {
                dataPoint[metricId] = metricData.sum / metricData.count;
              } else {
                // Default to sum for other aggregation types or when none is specified
                dataPoint[metricId] = metricData.sum;
              }
            } else {
              dataPoint[metricId] = 0;
            }
          });

          return dataPoint;
        }
      );

      // Sort by timestamp
      processedData.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Apply time aggregation if needed for pie charts
      if (chartType === 'pie' && processedData.length > 0) {
        const aggregatedData: ChartDataPoint = {
          timestamp: 'aggregated',
          formattedDate: 'Total',
        };

        metricIds.forEach(metricId => {
          const values = processedData.map(d => Number(d[metricId] || 0));

          let aggregatedValue = 0;
          // We're already applying region aggregation above, this is just for time aggregation in pie charts
          aggregatedValue = values.reduce((sum, val) => sum + val, 0);

          aggregatedData[metricId] = aggregatedValue;
        });

        setChartData([aggregatedData]);
      } else {
        setChartData(processedData);
      }
    }
  }, [dataPoints, metrics, metricIds, aggregation, chartType, regions, separateRegions]);

  // If loading or no data, show placeholder
  if (isLoadingMetrics || isLoadingData || (separateRegions && isLoadingRegions)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">No data available for the selected criteria</p>
      </div>
    );
  }

  // Get colors from the selected scheme
  const colors = COLOR_SCHEMES[colorScheme];
  console.log('Using color scheme:', colorScheme, 'with colors:', colors);

  // Custom interactive legend component
  const CustomizedLegend = ({ payload }: any) => {
    if (!payload || payload.length === 0) return null;

    return (
      <ul className="mt-2 flex flex-wrap justify-center gap-2 px-4">
        {payload.map((entry: any, index: number) => {
          const { value, color } = entry;
          const isActive = separateRegions
            ? visibleSeries[value] !== false
            : visibleSeries[value] !== false;

          return (
            <li
              key={`item-${index}`}
              className={`flex cursor-pointer items-center rounded border px-2 py-1 ${isActive ? 'border-gray-300 bg-background' : 'border-gray-200 bg-gray-50 dark:bg-gray-800'}`}
              onClick={() => {
                setVisibleSeries(prev => ({
                  ...prev,
                  [value]: !prev[value],
                }));
              }}
            >
              <span
                className="mr-2 inline-block h-3 w-3 rounded-sm"
                style={{
                  backgroundColor: isActive ? color : 'transparent',
                  borderColor: color,
                  borderWidth: 1,
                  borderStyle: 'solid',
                }}
              />
              <span className={`text-xs ${isActive ? 'font-medium' : 'font-normal text-gray-500'}`}>
                {separateRegions && typeof value === 'string' && value.includes(':')
                  ? (() => {
                      const [metricId, regionId] = value.split(':');
                      const metricName = metricNames[metricId] || metricId;
                      const regionName = regionNames[regionId] || regionId;
                      return `${metricName} (${regionName})`;
                    })()
                  : metricNames[value] || value}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  // Render different chart types
  switch (chartType) {
    case 'line': {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="formattedDate" tick={{ fontSize: 12 }} hide={!showAxisLabels} />
            <YAxis tick={{ fontSize: 12 }} hide={!showAxisLabels} />
            <Tooltip
              formatter={(value, name) => {
                // Handle both normal metric IDs and metric:region format
                if (separateRegions && typeof name === 'string' && name.includes(':')) {
                  const [metricId, regionId] = (name as string).split(':');
                  const unit = metricUnits[metricId] || '';
                  const metricName = metricNames[metricId] || metricId;
                  const regionName = regionNames[regionId] || regionId;
                  return [`${value} ${unit}`, `${metricName} (${regionName})`];
                } else {
                  const metricId = name as string;
                  const unit = metricUnits[metricId] || '';
                  return [`${value} ${unit}`, metricNames[metricId] || name];
                }
              }}
            />
            {showLegend && <Legend content={<CustomizedLegend />} />}
            {separateRegions
              ? // Generate lines for each metric-region combination
                Object.keys(chartData[0] || {})
                  .filter(key => key !== 'timestamp' && key !== 'formattedDate')
                  .map((metricRegionKey, index) => {
                    const isVisible = visibleSeries[metricRegionKey] !== false;
                    return (
                      <Line
                        key={metricRegionKey}
                        type={curveType}
                        dataKey={metricRegionKey}
                        name={metricRegionKey}
                        stroke={colors[index % colors.length]}
                        activeDot={hideDots || !isVisible ? false : { r: 8 }}
                        dot={hideDots || !isVisible ? false : true}
                        strokeWidth={isVisible ? 2 : 0}
                        hide={!isVisible}
                      />
                    );
                  })
              : // Standard lines for each metric with aggregated region data
                metricIds.map((metricId, index) => {
                  const isVisible = visibleSeries[metricId] !== false;
                  return (
                    <Line
                      key={metricId}
                      type={curveType}
                      dataKey={metricId}
                      name={metricId}
                      stroke={colors[index % colors.length]}
                      activeDot={hideDots || !isVisible ? false : { r: 8 }}
                      dot={hideDots || !isVisible ? false : true}
                      strokeWidth={isVisible ? 2 : 0}
                      hide={!isVisible}
                    />
                  );
                })}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    case 'bar': {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="formattedDate" tick={{ fontSize: 12 }} hide={!showAxisLabels} />
            <YAxis tick={{ fontSize: 12 }} hide={!showAxisLabels} />
            <Tooltip
              formatter={(value, name) => {
                // Handle both normal metric IDs and metric:region format
                if (separateRegions && typeof name === 'string' && name.includes(':')) {
                  const [metricId, regionId] = (name as string).split(':');
                  const unit = metricUnits[metricId] || '';
                  const metricName = metricNames[metricId] || metricId;
                  const regionName = regionNames[regionId] || regionId;
                  return [`${value} ${unit}`, `${metricName} (${regionName})`];
                } else {
                  const metricId = name as string;
                  const unit = metricUnits[metricId] || '';
                  return [`${value} ${unit}`, metricNames[metricId] || name];
                }
              }}
            />
            {showLegend && <Legend content={<CustomizedLegend />} />}
            {separateRegions
              ? // Generate bars for each metric-region combination
                Object.keys(chartData[0] || {})
                  .filter(key => key !== 'timestamp' && key !== 'formattedDate')
                  .map((metricRegionKey, index) => {
                    const isVisible = visibleSeries[metricRegionKey] !== false;
                    return (
                      <Bar
                        key={metricRegionKey}
                        dataKey={metricRegionKey}
                        name={metricRegionKey}
                        fill={colors[index % colors.length]}
                        stackId={stacked ? 'stack' : undefined}
                        fillOpacity={isVisible ? 1 : 0}
                        hide={!isVisible}
                      />
                    );
                  })
              : // Standard bars for each metric with aggregated region data
                metricIds.map((metricId, index) => {
                  const isVisible = visibleSeries[metricId] !== false;
                  return (
                    <Bar
                      key={metricId}
                      dataKey={metricId}
                      name={metricId}
                      fill={colors[index % colors.length]}
                      stackId={stacked ? 'stack' : undefined}
                      fillOpacity={isVisible ? 1 : 0}
                      hide={!isVisible}
                    />
                  );
                })}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case 'area': {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="formattedDate" tick={{ fontSize: 12 }} hide={!showAxisLabels} />
            <YAxis tick={{ fontSize: 12 }} hide={!showAxisLabels} />
            <Tooltip
              formatter={(value, name) => {
                // Handle both normal metric IDs and metric:region format
                if (separateRegions && typeof name === 'string' && name.includes(':')) {
                  const [metricId, regionId] = (name as string).split(':');
                  const unit = metricUnits[metricId] || '';
                  const metricName = metricNames[metricId] || metricId;
                  const regionName = regionNames[regionId] || regionId;
                  return [`${value} ${unit}`, `${metricName} (${regionName})`];
                } else {
                  const metricId = name as string;
                  const unit = metricUnits[metricId] || '';
                  return [`${value} ${unit}`, metricNames[metricId] || name];
                }
              }}
            />
            {showLegend && <Legend content={<CustomizedLegend />} />}
            {separateRegions
              ? // Generate areas for each metric-region combination
                Object.keys(chartData[0] || {})
                  .filter(key => key !== 'timestamp' && key !== 'formattedDate')
                  .map((metricRegionKey, index) => {
                    const isVisible = visibleSeries[metricRegionKey] !== false;
                    return (
                      <Area
                        key={metricRegionKey}
                        type="monotone"
                        dataKey={metricRegionKey}
                        name={metricRegionKey}
                        fill={colors[index % colors.length]}
                        stroke={colors[index % colors.length]}
                        fillOpacity={isVisible ? 0.6 : 0}
                        strokeOpacity={isVisible ? 1 : 0}
                        stackId={stacked ? 'stack' : undefined}
                        hide={!isVisible}
                      />
                    );
                  })
              : // Standard areas for each metric with aggregated region data
                metricIds.map((metricId, index) => {
                  const isVisible = visibleSeries[metricId] !== false;
                  return (
                    <Area
                      key={metricId}
                      type="monotone"
                      dataKey={metricId}
                      name={metricId}
                      fill={colors[index % colors.length]}
                      stroke={colors[index % colors.length]}
                      fillOpacity={isVisible ? 0.6 : 0}
                      strokeOpacity={isVisible ? 1 : 0}
                      stackId={stacked ? 'stack' : undefined}
                      hide={!isVisible}
                    />
                  );
                })}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    case 'pie': {
      // Filter only visible metrics for pie chart
      const visibleMetricIds = metricIds.filter(metricId => visibleSeries[metricId] !== false);

      // For pie charts, we need to restructure the data
      const pieData = visibleMetricIds.map((metricId, index) => {
        const value = Number(chartData[0][metricId] || 0);
        return {
          id: metricId,
          name: metricNames[metricId] || metricId,
          value: value,
        };
      });

      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              label={({ name, value, percent }) => {
                const metricId = pieData.find(d => d.name === name)?.id || '';
                const unit = metricUnits[metricId] || '';
                return `${name}: ${value} ${unit} (${(percent * 100).toFixed(0)}%)`;
              }}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            {showLegend && <Legend content={<CustomizedLegend />} />}
            <Tooltip
              formatter={(value, name) => {
                const metricId = pieData.find(d => d.name === name)?.id || '';
                const unit = metricUnits[metricId] || '';
                return [`${value} ${unit}`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    default:
      return null;
  }
}
