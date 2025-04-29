'use client';

import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
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

// Data point type with additional typing for JSON metadata
type DataPoint = Tables<'data_points'> & {
  formatted_meta?: string;
  formatted_ts?: string;
};

export default function MetricDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'ts', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Get the current metric ID from the URL
  const metricId = params.id as string;

  // Fetch metric details
  const { data: metric, isLoading: isLoadingMetric } = useQuery({
    queryKey: ['metric', metricId],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('metrics')
        .select('*, data_sources(*)')
        .eq('id', metricId)
        .single();

      if (error) throw error;
      return data as Tables<'metrics'> & { data_sources: Tables<'data_sources'> | null };
    },
  });

  // Fetch data points with server-side sorting
  const { data: dataPoints, isLoading: isLoadingData } = useQuery({
    queryKey: ['data-points', metricId, sorting],
    queryFn: async () => {
      const activeSorting = sorting[0];

      let query = supabaseClient.from('data_points').select('*').eq('metric_id', metricId);

      // Apply sorting from the TanStack Table state
      if (activeSorting) {
        query = query.order(activeSorting.id, {
          ascending: !activeSorting.desc,
        });
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process the data to format JSON metadata and timestamps
      return data.map(point => ({
        ...point,
        formatted_meta: point.meta ? JSON.stringify(point.meta) : '',
        formatted_ts: formatDatetime(new Date(point.ts)),
      })) as DataPoint[];
    },
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

  // Table columns definition
  const columns: ColumnDef<DataPoint>[] = [
    {
      accessorKey: 'ts',
      header: ({ column }) => {
        const isSorted = column.getIsSorted();
        return (
          <Button
            variant="ghost"
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('metrics.detail.timestamp')}
            {isSorted === 'asc' && <ChevronUp className="ml-2 h-4 w-4" />}
            {isSorted === 'desc' && <ChevronDown className="ml-2 h-4 w-4" />}
            {!isSorted && <ArrowUpDown className="ml-2 h-4 w-4" />}
          </Button>
        );
      },
      cell: ({ row }) => <div>{row.original.formatted_ts}</div>,
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
    {
      accessorKey: 'formatted_meta',
      header: () => <span>{t('metrics.detail.metadata')}</span>,
      cell: ({ row }) =>
        row.original.formatted_meta ? (
          <div className="max-w-[500px] truncate">
            <code className="rounded bg-muted px-1 py-1 font-mono text-sm">
              {row.original.formatted_meta}
            </code>
          </div>
        ) : null,
    },
  ];

  // Initialize the table
  const table = useReactTable({
    data: dataPoints || [],
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('metrics.detail.dataPoints')}</CardTitle>
          <CardDescription>{metric?.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingData ? (
            <div className="flex h-96 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                <p className="text-muted-foreground">{t('metrics.detail.loading')}</p>
              </div>
            </div>
          ) : dataPoints?.length ? (
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
                      setPageSize(Number(value));
                      table.setPageSize(Number(value));
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
