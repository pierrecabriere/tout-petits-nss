import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronUp, FilterX, ArrowUpDown } from 'lucide-react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
} from '@tanstack/react-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// For handling metric unit type compatibility
type MetricUnit = string | null;

// Type for table data structure
type TableDataPoint = {
  id: string;
  timestamp: string;
  formattedDate: string;
  region?: string;
  regionId?: string;
  year: string;
  metric: string;
  value: string;
  unit: string;
  [key: string]: string | number | undefined;
};

// Type for the grouped table data
type GroupedTableData = {
  id: string;
  region: string;
  [key: string]: string | number | undefined;
};

// Type for grouping options
type GroupByOption = 'year' | 'metric' | 'year-metric' | 'metric-year';

// Type for table configuration
type TableViewConfig = {
  showRowNumbers: boolean;
  showFilters: boolean;
  pageSize: number;
  enableSorting: boolean;
  enablePagination: boolean;
  density: 'compact' | 'default' | 'comfortable';
  groupBy: GroupByOption;
};

// Helper function to generate all years in range
function getAllYearsInRange(from: Date, to: Date): string[] {
  const years: string[] = [];
  const startYear = from.getFullYear();
  const endYear = to.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    years.push(year.toString());
  }

  return years;
}

// Base table configuration
type RenderTableProps = {
  metricIds: string[];
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
  regionIds?: string[];
  tableConfig: TableViewConfig;
  onConfigChange?: (config: TableViewConfig) => void;
};

export default function RenderTable({
  metricIds,
  dateRange,
  regionIds,
  tableConfig,
  onConfigChange,
}: RenderTableProps) {
  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  // Table data state
  const [tableData, setTableData] = useState<TableDataPoint[]>([]);
  // Sorting state
  const [sorting, setSorting] = useState<SortingState>([]);

  // Get class based on density setting
  const getDensityClass = () => {
    switch (tableConfig.density) {
      case 'compact':
        return 'py-1 px-3';
      case 'comfortable':
        return 'py-4 px-4';
      default:
        return 'py-2 px-3';
    }
  };

  // Fetch metric data
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!metricIds.length || !dateRange.from || !dateRange.to) {
        setIsLoading(false);
        return;
      }

      if (regionIds && regionIds.length === 0) {
        setIsLoading(false);
        return;
      }

      try {
        // First get metric info
        const metricsResponse = await supabaseClient
          .from('metrics')
          .select('id, name, unit')
          .in('id', metricIds);

        if (metricsResponse.error) throw metricsResponse.error;

        const metrics = metricsResponse.data;
        const metricNames: Record<string, string> = {};
        const metricUnits: Record<string, string> = {};

        metrics.forEach(metric => {
          metricNames[metric.id] = metric.name;
          metricUnits[metric.id] = metric.unit || '';
        });

        // Get region names if needed
        let regionNames: Record<string, string> = {};

        if (regionIds && regionIds.length > 0) {
          const regionsResponse = await supabaseClient
            .from('regions')
            .select('id, name')
            .in('id', regionIds);

          if (regionsResponse.error) throw regionsResponse.error;

          regionsResponse.data.forEach(region => {
            regionNames[region.id] = region.name;
          });
        }

        // Fetch data points
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

        // Process data into table format
        const tableRows: TableDataPoint[] = [];

        results.forEach((result, index) => {
          const metricId = metricIds[index];

          result.data?.forEach(point => {
            const date = new Date(point.date);
            const year = date.getFullYear().toString();

            tableRows.push({
              id: `${metricId}-${point.date}-${point.region_id || 'global'}`,
              year,
              metric: metricNames[metricId],
              value: Number(point.value).toLocaleString(),
              unit: metricUnits[metricId],
              region: point.region_id ? regionNames[point.region_id] || point.region_id : 'Global',
              timestamp: point.date,
              formattedDate: point.date,
              regionId: point.region_id || undefined,
            });
          });
        });

        if (isMounted) {
          setTableData(tableRows);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error fetching table data:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    setIsLoading(true);
    fetchData();

    return () => {
      isMounted = false;
    };
  }, [metricIds, dateRange, regionIds]);

  // Group data based on the selected grouping option
  const groupedData = useMemo(() => {
    if (tableData.length === 0)
      return {
        data: [],
        groupKeys: [],
        groupKeyToColumn: {},
        yearMetricStructure: { years: [], metricsByYear: {} },
        metricYearStructure: { metrics: [], yearsByMetric: {} },
        emptyColumns: new Set<string>(),
      };

    const grouped: GroupedTableData[] = [];
    const regions = new Set<string>();
    const groupKeys = new Set<string>();
    const groupKeyToColumn: Record<string, { year?: string; metric?: string }> = {};
    // Track columns with no data
    const emptyColumns = new Set<string>();

    // Generate all years in range
    const allYears =
      dateRange.from && dateRange.to ? getAllYearsInRange(dateRange.from, dateRange.to) : [];

    // For year-metric and metric-year hierarchical structures
    const years = new Set<string>(allYears);
    const metrics = new Set<string>();
    const metricsByYear: Record<string, string[]> = {};
    const yearsByMetric: Record<string, string[]> = {};

    // Get unique regions and metrics
    tableData.forEach(data => {
      if (data.region) {
        regions.add(data.region);
      }

      if (data.metric) {
        metrics.add(data.metric);
      }
    });

    // For year-metric group, organize metrics by year
    if (tableConfig.groupBy === 'year-metric') {
      Array.from(years).forEach(year => {
        metricsByYear[year] = [];
      });

      // First add all metrics to all years
      Array.from(years).forEach(year => {
        Array.from(metrics).forEach(metric => {
          if (!metricsByYear[year].includes(metric)) {
            metricsByYear[year].push(metric);
          }
        });
      });
    }

    // For metric-year group, organize years by metric
    if (tableConfig.groupBy === 'metric-year') {
      Array.from(metrics).forEach(metric => {
        yearsByMetric[metric] = [...allYears];
      });
    }

    // Generate group keys based on groupBy option
    // For year and year-metric, use all years in range
    if (tableConfig.groupBy === 'year') {
      allYears.forEach(year => {
        const groupKey = year;
        groupKeys.add(groupKey);
        groupKeyToColumn[groupKey] = { year };
      });
    } else if (tableConfig.groupBy === 'metric') {
      Array.from(metrics).forEach(metric => {
        const groupKey = metric;
        groupKeys.add(groupKey);
        groupKeyToColumn[groupKey] = { metric };
      });
    } else if (tableConfig.groupBy === 'year-metric') {
      allYears.forEach(year => {
        Array.from(metrics).forEach(metric => {
          const groupKey = `${year} - ${metric}`;
          groupKeys.add(groupKey);
          groupKeyToColumn[groupKey] = { year, metric };
        });
      });
    } else if (tableConfig.groupBy === 'metric-year') {
      Array.from(metrics).forEach(metric => {
        allYears.forEach(year => {
          const groupKey = `${metric} - ${year}`;
          groupKeys.add(groupKey);
          groupKeyToColumn[groupKey] = { metric, year };
        });
      });
    }

    // Create a map to track which columns have data
    const columnsWithData = new Set<string>();

    // Create a row for each region
    for (const region of regions) {
      const row: GroupedTableData = {
        id: region,
        region,
      };

      // Initialize all group keys with empty values
      for (const groupKey of groupKeys) {
        row[groupKey] = '';
      }

      // Fill in values for this region
      tableData.forEach(data => {
        if (data.region === region) {
          let groupKey: string;

          switch (tableConfig.groupBy) {
            case 'year':
              groupKey = data.year;
              break;
            case 'metric':
              groupKey = data.metric;
              break;
            case 'year-metric':
              groupKey = `${data.year} - ${data.metric}`;
              break;
            case 'metric-year':
              groupKey = `${data.metric} - ${data.year}`;
              break;
            default:
              groupKey = `${data.year} - ${data.metric}`;
          }

          row[groupKey] = `${data.value} ${data.unit}`;
          columnsWithData.add(groupKey);
        }
      });

      grouped.push(row);
    }

    // Identify columns without data (to be grayed out)
    groupKeys.forEach(key => {
      if (!columnsWithData.has(key)) {
        emptyColumns.add(key);
      }
    });

    return {
      data: grouped,
      groupKeys: Array.from(groupKeys),
      groupKeyToColumn,
      yearMetricStructure: {
        years: Array.from(years),
        metricsByYear,
      },
      metricYearStructure: {
        metrics: Array.from(metrics),
        yearsByMetric,
      },
      emptyColumns,
    };
  }, [tableData, tableConfig.groupBy, dateRange]);

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<GroupedTableData>[]>(() => {
    if (!groupedData.groupKeys || groupedData.groupKeys.length === 0) return [];

    const cols: ColumnDef<GroupedTableData>[] = [];

    // Add row numbers column if configured
    if (tableConfig.showRowNumbers) {
      cols.push({
        id: 'index',
        header: '#',
        cell: ({ row }) => <div>{row.index + 1}</div>,
        meta: {
          isRowHeader: false,
        },
      });
    }

    // Add region column
    cols.push({
      accessorKey: 'region',
      header: ({ column }) => {
        if (tableConfig.enableSorting) {
          return (
            <Button
              variant="ghost"
              className="-ml-4"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Region
              {column.getIsSorted() === 'asc' && <ChevronUp className="ml-2 h-4 w-4" />}
              {column.getIsSorted() === 'desc' && <ChevronDown className="ml-2 h-4 w-4" />}
              {!column.getIsSorted() && <ArrowUpDown className="ml-2 h-4 w-4" />}
            </Button>
          );
        }
        return 'Region';
      },
      cell: ({ row }) => <div className="font-medium">{row.getValue('region')}</div>,
      meta: {
        isRowHeader: true,
        isSticky: true,
      },
    });

    // Add columns based on group keys
    if (tableConfig.groupBy === 'year-metric') {
      // For year-metric, we create hierarchical headers
      const { years, metricsByYear } = groupedData.yearMetricStructure;

      years.forEach(year => {
        const metrics = metricsByYear[year] || [];

        // For each metric in this year, create a column
        metrics.forEach(metric => {
          const groupKey = `${year} - ${metric}`;
          const isEmpty = groupedData.emptyColumns.has(groupKey);

          cols.push({
            id: groupKey,
            accessorKey: groupKey,
            header: metric,
            meta: {
              year,
              metric,
              isEmpty,
            },
            cell: info => (info.getValue() as string) || '',
          });
        });
      });
    } else if (tableConfig.groupBy === 'metric-year') {
      // For metric-year, we create hierarchical headers
      const { metrics, yearsByMetric } = groupedData.metricYearStructure;

      metrics.forEach(metric => {
        const years = yearsByMetric[metric] || [];

        // For each year for this metric, create a column
        years.forEach(year => {
          const groupKey = `${metric} - ${year}`;
          const isEmpty = groupedData.emptyColumns.has(groupKey);

          cols.push({
            id: groupKey,
            accessorKey: groupKey,
            header: year,
            meta: {
              year,
              metric,
              isEmpty,
            },
            cell: info => (info.getValue() as string) || '',
          });
        });
      });
    } else {
      // Normal columns for other grouping options
      groupedData.groupKeys.forEach((groupKey: string) => {
        const columnInfo = groupedData.groupKeyToColumn[groupKey] || {};
        const isEmpty = groupedData.emptyColumns.has(groupKey);

        let headerLabel = groupKey;
        if (columnInfo.year) {
          headerLabel = columnInfo.year;
        } else if (columnInfo.metric) {
          headerLabel = columnInfo.metric;
        }

        cols.push({
          id: groupKey,
          accessorKey: groupKey,
          header: ({ column }) => {
            if (tableConfig.enableSorting) {
              return (
                <Button
                  variant="ghost"
                  className="-ml-4"
                  onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                >
                  {headerLabel}
                  {column.getIsSorted() === 'asc' && <ChevronUp className="ml-2 h-4 w-4" />}
                  {column.getIsSorted() === 'desc' && <ChevronDown className="ml-2 h-4 w-4" />}
                  {!column.getIsSorted() && <ArrowUpDown className="ml-2 h-4 w-4" />}
                </Button>
              );
            }
            return headerLabel;
          },
          cell: info => (info.getValue() as string) || '',
          meta: {
            isEmpty,
          },
        });
      });
    }

    return cols;
  }, [groupedData, tableConfig.showRowNumbers, tableConfig.enableSorting, tableConfig.groupBy]);

  // Create header groups for hierarchical grouping
  const headerGroups = useMemo(() => {
    const groups: { id: string; title: string; colSpan: number }[] = [];

    // First add a placeholder for region column and row numbers if present
    let initialColSpan = 1; // Region column
    if (tableConfig.showRowNumbers) {
      initialColSpan = 2; // Row numbers + Region
    }

    if (initialColSpan > 0) {
      groups.push({
        id: 'region-group',
        title: '',
        colSpan: initialColSpan,
      });
    }

    if (tableConfig.groupBy === 'year-metric') {
      // Add a group for each year
      const { years, metricsByYear } = groupedData.yearMetricStructure;
      years.forEach(year => {
        const metrics = metricsByYear[year] || [];
        groups.push({
          id: `year-${year}`,
          title: year,
          colSpan: metrics.length,
        });
      });
    } else if (tableConfig.groupBy === 'metric-year') {
      // Add a group for each metric
      const { metrics, yearsByMetric } = groupedData.metricYearStructure;
      metrics.forEach(metric => {
        const years = yearsByMetric[metric] || [];
        groups.push({
          id: `metric-${metric}`,
          title: metric,
          colSpan: years.length,
        });
      });
    }

    return groups;
  }, [
    tableConfig.groupBy,
    groupedData.yearMetricStructure,
    groupedData.metricYearStructure,
    tableConfig.showRowNumbers,
  ]);

  // Initialize TanStack Table
  const table = useReactTable({
    data: groupedData.data || [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: tableConfig.enableSorting ? getSortedRowModel() : undefined,
    getPaginationRowModel: tableConfig.enablePagination ? getPaginationRowModel() : undefined,
    manualPagination: false,
    pageCount:
      tableConfig.enablePagination && groupedData.data
        ? Math.ceil(groupedData.data.length / tableConfig.pageSize)
        : undefined,
  });

  // Set page size when configuration changes
  useEffect(() => {
    if (tableConfig.enablePagination) {
      table.setPageSize(tableConfig.pageSize);
    }
  }, [tableConfig.pageSize, tableConfig.enablePagination, table]);

  // Show loading state
  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-4 h-8 w-full" />
        <Skeleton className="mb-2 h-8 w-full" />
        <Skeleton className="mb-2 h-8 w-full" />
        <Skeleton className="mb-2 h-8 w-full" />
        <Skeleton className="mb-2 h-8 w-full" />
      </>
    );
  }

  // Show empty state if no metrics selected
  if (metricIds.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Please select metrics to display data</p>
      </div>
    );
  }

  // Show empty state if no data
  if (tableData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">
          No data available for the selected metrics and filters
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="border-collapse">
          {/* Custom Header for hierarchical grouping */}
          {((tableConfig.groupBy as string) === 'year-metric' ||
            (tableConfig.groupBy as string) === 'metric-year') &&
            headerGroups.length > 0 && (
              <thead className="bg-muted/50 [&_tr]:border-b">
                <tr className="border-b transition-colors">
                  {headerGroups.map(group => {
                    // Check if this is a year group that's empty
                    const isEmptyGroup =
                      tableConfig.groupBy === 'year-metric' &&
                      group.title &&
                      group.id.startsWith('year-')
                        ? Array.from(groupedData.emptyColumns).some(key =>
                            key.startsWith(`${group.title} - `)
                          )
                        : false;

                    return (
                      <th
                        key={group.id}
                        colSpan={group.colSpan}
                        className={`h-12 border-r px-2 text-center align-middle text-sm font-bold uppercase tracking-wider text-foreground last:border-r-0 ${
                          isEmptyGroup ? 'bg-gray-100 text-gray-400' : ''
                        }`}
                      >
                        {group.title}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}

          {/* Standard Table Header */}
          <TableHeader className="bg-muted/30">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  // Check if this column is empty
                  const isEmptyColumn = (header.column.columnDef.meta as any)?.isEmpty;

                  return (
                    <TableHead
                      key={header.id}
                      className={`h-10 border-r font-semibold last:border-r-0 ${
                        isEmptyColumn ? 'bg-gray-100' : ''
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={`hover:bg-muted/40 ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-muted/10'}`}
                >
                  {row.getVisibleCells().map(cell => {
                    // Check if this is a header cell
                    const isRowHeader = (cell.column.columnDef.meta as any)?.isRowHeader;
                    const isSticky = (cell.column.columnDef.meta as any)?.isSticky;
                    const isEmptyColumn = (cell.column.columnDef.meta as any)?.isEmpty;
                    const isEvenRow = rowIndex % 2 === 0;

                    return (
                      <TableCell
                        key={cell.id}
                        className={` ${getDensityClass()} border-r last:border-r-0 ${
                          isRowHeader ? 'font-medium' : ''
                        } ${
                          isSticky
                            ? `sticky left-0 z-10 ${isEvenRow ? 'bg-white' : 'bg-gray-50'} shadow-[1px_0_0_0_#e5e5e5]`
                            : ''
                        } ${isEmptyColumn ? 'bg-gray-100 text-gray-400' : ''} `}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {tableConfig.enablePagination && table.getPageCount() > 1 && (
        <div className="mt-4 flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>

          <div className="flex items-center">
            {Array.from({ length: Math.min(5, table.getPageCount()) }, (_, i) => {
              // Calculate which page numbers to show
              let pageNum;
              if (table.getPageCount() <= 5) {
                pageNum = i + 1;
              } else if (table.getState().pagination.pageIndex <= 2) {
                pageNum = i + 1;
              } else if (table.getState().pagination.pageIndex >= table.getPageCount() - 3) {
                pageNum = table.getPageCount() - 4 + i;
              } else {
                pageNum = table.getState().pagination.pageIndex - 1 + i;
              }

              return (
                <Button
                  key={i}
                  variant={
                    table.getState().pagination.pageIndex === pageNum - 1 ? 'default' : 'outline'
                  }
                  size="sm"
                  className="mx-1 h-8 w-8"
                  onClick={() => table.setPageIndex(pageNum - 1)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}
