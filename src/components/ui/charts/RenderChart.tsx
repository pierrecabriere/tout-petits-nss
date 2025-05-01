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
  colorScheme: 'default' | 'pastel' | 'vibrant';
  aggregation: 'none' | 'sum' | 'avg' | 'min' | 'max';
  regionIds?: string[];
  hideDots?: boolean;
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
};

export default function RenderChart(props: RenderChartProps) {
  const { metricIds, chartType, dateRange, showLegend, colorScheme, aggregation, regionIds } =
    props;
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

    // Organize data points by date (used as timestamp)
    const dataByTimestamp: { [timestamp: string]: { [metricId: string]: number } } = {};

    dataPoints.forEach(({ metricId, data }) => {
      data.forEach(point => {
        const timestamp = point.date; // Use date as timestamp

        if (!dataByTimestamp[timestamp]) {
          dataByTimestamp[timestamp] = {};
        }

        if (!dataByTimestamp[timestamp][metricId]) {
          dataByTimestamp[timestamp][metricId] = 0;
        }

        dataByTimestamp[timestamp][metricId] += Number(point.value);
      });
    });

    // Transform the data into an array for Recharts
    const processedData: ChartDataPoint[] = Object.keys(dataByTimestamp).map(timestamp => {
      const date = new Date(timestamp);
      // Afficher uniquement l'année
      const formattedDate = date.getUTCFullYear().toString();

      const dataPoint: ChartDataPoint = {
        timestamp,
        formattedDate,
      };

      // Add values for each metric
      metricIds.forEach(metricId => {
        dataPoint[metricId] = dataByTimestamp[timestamp][metricId] || 0;
      });

      return dataPoint;
    });

    // Sort by timestamp
    processedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Apply aggregation if needed
    if (aggregation !== 'none' && processedData.length > 0) {
      // For pie charts, we'll aggregate all values for each metric
      if (chartType === 'pie') {
        const aggregatedData: ChartDataPoint = {
          timestamp: 'aggregated',
          formattedDate: 'Total',
        };

        metricIds.forEach(metricId => {
          const values = processedData.map(d => Number(d[metricId] || 0));

          let aggregatedValue = 0;
          switch (aggregation) {
            case 'sum':
              aggregatedValue = values.reduce((sum, val) => sum + val, 0);
              break;
            case 'avg':
              aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
              break;
            case 'min':
              aggregatedValue = Math.min(...values);
              break;
            case 'max':
              aggregatedValue = Math.max(...values);
              break;
          }

          aggregatedData[metricId] = aggregatedValue;
        });

        setChartData([aggregatedData]);
      } else {
        setChartData(processedData);
      }
    } else {
      setChartData(processedData);
    }
  }, [dataPoints, metrics, metricIds, aggregation, chartType, colorScheme]);

  // If loading or no data, show placeholder
  if (isLoadingMetrics || isLoadingData) {
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
                const metricId = name as string;
                const unit = metricUnits[metricId] || '';
                return [`${value} ${unit}`, metricNames[metricId] || name];
              }}
            />
            {showLegend && <Legend formatter={value => metricNames[value] || value} />}
            {metricIds.map((metricId, index) => (
              <Line
                key={metricId}
                type={curveType}
                dataKey={metricId}
                name={metricId}
                stroke={colors[index % colors.length]}
                activeDot={hideDots ? false : { r: 8 }}
                dot={hideDots ? false : true}
                strokeWidth={2}
              />
            ))}
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
                const metricId = name as string;
                const unit = metricUnits[metricId] || '';
                return [`${value} ${unit}`, metricNames[metricId] || name];
              }}
            />
            {showLegend && <Legend formatter={value => metricNames[value] || value} />}
            {metricIds.map((metricId, index) => (
              <Bar
                key={metricId}
                dataKey={metricId}
                name={metricId}
                fill={colors[index % colors.length]}
                stackId={stacked ? 'stack' : undefined}
              />
            ))}
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
                const metricId = name as string;
                const unit = metricUnits[metricId] || '';
                return [`${value} ${unit}`, metricNames[metricId] || name];
              }}
            />
            {showLegend && <Legend formatter={value => metricNames[value] || value} />}
            {metricIds.map((metricId, index) => (
              <Area
                key={metricId}
                type="monotone"
                dataKey={metricId}
                name={metricId}
                fill={colors[index % colors.length]}
                stroke={colors[index % colors.length]}
                fillOpacity={0.6}
                stackId={stacked ? 'stack' : undefined}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    case 'pie': {
      // For pie charts, we need to restructure the data
      const pieData = metricIds.map((metricId, index) => {
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
            {showLegend && <Legend />}
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
