'use client';

import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ArrowUpDown, ChevronDown, ChevronUp, FilterIcon } from 'lucide-react';
import {
  ColumnDef,
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  SortingState,
  flexRender,
  ColumnFiltersState,
  getFilteredRowModel,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { YearRangeSlider } from '@/components/ui/year-range-slider';
import { Label } from '@/components/ui/label';

// Data point type with additional typing for JSON metadata
type DataPoint = Tables<'metric_data'> & {
  formatted_metadata?: string;
  formatted_date?: string;
  region_name?: string;
  year?: string;
};

export default function MetricDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  // Filter states
  const currentYear = new Date().getUTCFullYear();
  const minYear = 1980;
  const [yearRange, setYearRange] = useState<[number, number]>([minYear, currentYear]);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');

  // Get the current metric ID from the URL
  const metricId = params.id as string;

  // Fetch metric details
  const { data: metric, isLoading: isLoadingMetric } = useQuery({
    queryKey: ['metric', metricId],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('metrics')
        .select('*')
        .eq('id', metricId)
        .single();

      if (error) throw error;

      // Fetch source information if available in metadata
      let source = null;
      if (
        data.metadata &&
        typeof data.metadata === 'object' &&
        data.metadata !== null &&
        'source_id' in data.metadata
      ) {
        const sourceId = (data.metadata as { source_id: string }).source_id;

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

      return { ...data, source };
    },
  });

  // Fetch regions to use for data point lookup
  const { data: regions } = useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('regions').select('*');

      if (error) throw error;

      // Create a lookup map for easier access
      const regionsMap = new Map();
      data.forEach(region => {
        regionsMap.set(region.id, region);
      });

      return regionsMap;
    },
  });

  // Fetch data points with server-side sorting and filtering
  const { data: dataPointsResult, isLoading: isLoadingData } = useQuery({
    queryKey: [
      'metric-data',
      metricId,
      sorting,
      yearRange,
      selectedRegion,
      pageSize,
      pagination.pageIndex,
    ],
    queryFn: async () => {
      const activeSorting = sorting[0];
      const currentPageIndex = pagination.pageIndex;

      // Start building the query
      let query = supabaseClient
        .from('metric_data')
        .select('*', { count: 'exact' })
        .eq('metric_id', metricId);

      // Apply year range filter
      const [fromYear, toYear] = yearRange;
      const fromDate = new Date(Date.UTC(fromYear, 0, 1));
      const toDate = new Date(Date.UTC(toYear, 11, 31, 23, 59, 59, 999));
      query = query.gte('date', fromDate.toISOString().split('T')[0]);
      query = query.lte('date', toDate.toISOString().split('T')[0]);

      // Apply region filter if selected
      if (selectedRegion !== 'all') {
        query = query.eq('region_id', selectedRegion);
      }

      // Apply sorting - map year to date for server-side sorting
      if (activeSorting) {
        const sortField = activeSorting.id === 'year' ? 'date' : activeSorting.id;
        // On vérifie que le champ existe bien dans la table
        if (['date', 'value', 'created_at', 'updated_at'].includes(sortField)) {
          query = query.order(sortField, {
            ascending: !activeSorting.desc,
          });
        }
      }

      // Apply pagination
      const start = currentPageIndex * pageSize;
      query = query.range(start, start + pageSize - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // Process the data to format JSON metadata and timestamps
      const formattedData = data.map(point => {
        // Get region name from the lookup map
        const region = point.region_id && regions ? regions.get(point.region_id) : null;

        // Extract just the year from the date
        const date = new Date(point.date);
        const year = date.getUTCFullYear().toString();

        return {
          ...point,
          formatted_metadata: point.metadata ? JSON.stringify(point.metadata) : '',
          formatted_date: formatDatetime(date),
          region_name: region ? region.name : '',
          year: year,
        };
      }) as DataPoint[];

      return {
        data: formattedData,
        pageCount: Math.ceil((count || 0) / pageSize),
      };
    },
    enabled: !!regions, // Only run this query after regions are loaded
  });

  // Format datetime based on the current locale
  const formatDatetime = (date: Date) => {
    return format(date, 'PPpp', {
      locale: locale === 'fr' ? fr : undefined,
    });
  };

  // Go back to metrics explorer
  const handleBackClick = () => {
    router.push('/explorer');
  };

  // Reset filters
  const resetFilters = () => {
    setYearRange([minYear, currentYear]);
    setSelectedRegion('all');
  };

  // Table columns definition
  const columns: ColumnDef<DataPoint>[] = [
    {
      accessorKey: 'year',
      header: ({ column }) => {
        const isSorted = column.getIsSorted();
        return (
          <Button
            variant="ghost"
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('common.year')}
            {isSorted === 'asc' && <ChevronUp className="ml-2 h-4 w-4" />}
            {isSorted === 'desc' && <ChevronDown className="ml-2 h-4 w-4" />}
            {!isSorted && <ArrowUpDown className="ml-2 h-4 w-4" />}
          </Button>
        );
      },
      cell: ({ row }) => <div>{row.original.year}</div>,
    },
    {
      accessorKey: 'region_name',
      header: () => <div className="font-medium">{t('common.region')}</div>,
      cell: ({ row }) => <div>{row.original.region_name || '-'}</div>,
      enableSorting: false, // Désactiver le tri sur cette colonne
    },
    {
      accessorKey: 'value',
      header: ({ column }) => {
        const isSorted = column.getIsSorted();
        return (
          <Button
            variant="ghost"
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('metrics.detail.value')}
            {isSorted === 'asc' && <ChevronUp className="ml-2 h-4 w-4" />}
            {isSorted === 'desc' && <ChevronDown className="ml-2 h-4 w-4" />}
            {!isSorted && <ArrowUpDown className="ml-2 h-4 w-4" />}
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.value}
          {metric?.unit && <span className="ml-1 text-muted-foreground">{metric.unit}</span>}
        </div>
      ),
    },
    // Metadata column is hidden
  ];

  // Initialize the table
  const table = useReactTable({
    data: dataPointsResult?.data || [],
    columns,
    pageCount: dataPointsResult?.pageCount || 0,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualSorting: true, // Tell the table that we're sorting on the server
    manualFiltering: true, // Tell the table that we're filtering on the server
    manualPagination: true, // Tell the table that we're handling pagination on the server
  });

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" onClick={handleBackClick} className="-ml-2">
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('metrics.detail.backToExplorer')}
        </Button>
      </div>

      {isLoadingMetric ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : metric ? (
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{metric.name}</h1>
            {metric.unit && <Badge variant="outline">{metric.unit}</Badge>}
          </div>
          {metric.description && <p className="mt-1 text-muted-foreground">{metric.description}</p>}
          {metric.source && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('metrics.explorer.source')}: {metric.source.name}
            </p>
          )}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>{t('metrics.detail.dataPoints')}</CardTitle>
              <CardDescription>{metric?.description}</CardDescription>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              {/* Reset Filters Button */}
              <Button
                variant="ghost"
                onClick={resetFilters}
                disabled={
                  yearRange[0] === minYear &&
                  yearRange[1] === currentYear &&
                  selectedRegion === 'all'
                }
              >
                {t('common.resetFilters')}
              </Button>

              {/* Year Range Filter Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full md:w-auto">
                    <FilterIcon className="mr-2 h-4 w-4" />
                    {yearRange[0] === minYear && yearRange[1] === currentYear
                      ? t('common.allYears') || 'All Years'
                      : `${yearRange[0]} - ${yearRange[1]}`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-2">
                    <Label>{t('metrics.configurator.yearRange') || 'Year Range'}</Label>
                    <YearRangeSlider
                      minYear={minYear}
                      maxYear={currentYear}
                      value={yearRange}
                      onChange={setYearRange}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Region Filter */}
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder={t('common.allRegions')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allRegions')}</SelectItem>
                  {regions &&
                    Array.from(regions.values()).map(region => (
                      <SelectItem key={region.id} value={region.id}>
                        {region.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingData ? (
            <div className="flex h-96 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                <p className="text-muted-foreground">{t('metrics.detail.loading')}</p>
              </div>
            </div>
          ) : dataPointsResult?.data.length ? (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map(headerGroup => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length ? (
                      table.getRowModel().rows.map(row => (
                        <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                          {row.getVisibleCells().map(cell => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center">
                          {t('metrics.detail.noData')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium">{t('metrics.detail.rowsPerPage')}</p>
                  <Select
                    value={`${pageSize}`}
                    onValueChange={value => {
                      const size = Number(value);
                      setPageSize(size);
                      setPagination(prev => ({ ...prev, pageSize: size }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue placeholder={pageSize} />
                    </SelectTrigger>
                    <SelectContent side="top">
                      {[5, 10, 20, 50, 100].map(size => (
                        <SelectItem key={size} value={`${size}`}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-6 lg:space-x-8">
                  <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                    {t('common.page')} {table.getState().pagination.pageIndex + 1}{' '}
                    {t('metrics.detail.of')} {table.getPageCount()}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <span className="sr-only">Previous page</span>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 w-8 p-0"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      <span className="sr-only">Next page</span>
                      <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center">
              <p className="text-muted-foreground">{t('metrics.detail.noData')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
