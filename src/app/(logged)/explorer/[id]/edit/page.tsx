'use client';

import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';
import { Tables, Json } from '@/types/database';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Define type for metadata to ensure type safety
interface MetricMetadata {
  domain?: string | null;
  category?: string | null;
  subcategory?: string | null;
  source_id?: string | null;
  [key: string]: Json | undefined;
}

// Form schema
const metricFormSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  description: z.string().optional(),
  unit: z.string().optional(),
  domain: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
});

type MetricFormValues = z.infer<typeof metricFormSchema>;

export default function EditMetricPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const metricId = params.id as string;

  // Fetch metric data
  const { data: metric, isLoading } = useQuery({
    queryKey: ['metric', metricId],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('metrics')
        .select('*')
        .eq('id', metricId)
        .single();

      if (error) throw error;
      return data as Tables<'metrics'>;
    },
  });

  // Extract metadata fields with type safety
  const getMetadataField = (field: string): string => {
    if (!metric?.metadata) return '';

    // Parse metadata as our custom type
    const metadata = metric.metadata as MetricMetadata;
    return (metadata[field] as string) || '';
  };

  // Set up form with default values from metric data
  const form = useForm<MetricFormValues>({
    resolver: zodResolver(metricFormSchema),
    defaultValues: {
      name: '',
      description: '',
      unit: '',
      domain: '',
      category: '',
      subcategory: '',
    },
    values: {
      name: metric?.name || '',
      description: metric?.description || '',
      unit: metric?.unit || '',
      domain: getMetadataField('domain'),
      category: getMetadataField('category'),
      subcategory: getMetadataField('subcategory'),
    },
  });

  // Update metric mutation
  const updateMetricMutation = useMutation({
    mutationFn: async (values: MetricFormValues) => {
      // Get existing metadata or create new object
      const existingMetadata = metric?.metadata ? (metric.metadata as MetricMetadata) : {};

      // Create updated metadata
      const metadata: MetricMetadata = {
        ...existingMetadata,
        domain: values.domain || null,
        category: values.category || null,
        subcategory: values.subcategory || null,
      };

      const { error } = await supabaseClient
        .from('metrics')
        .update({
          name: values.name,
          description: values.description,
          unit: values.unit,
          metadata,
        })
        .eq('id', metricId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('metrics.edit.success'));
      queryClient.invalidateQueries({ queryKey: ['metric', metricId] });
      queryClient.invalidateQueries({ queryKey: ['metrics-with-stats-tree'] });
      router.push(`/explorer/${metricId}`);
    },
    onError: error => {
      toast.error(t('metrics.edit.error'));
      console.error('Error updating metric:', error);
    },
  });

  // Form submit handler
  const onSubmit = (values: MetricFormValues) => {
    updateMetricMutation.mutate(values);
  };

  // Handle cancel
  const handleCancel = () => {
    router.push(`/explorer/${metricId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="space-y-4 bg-transparent p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <Card>
        <CardHeader className="flex flex-col gap-2 border-b pb-4">
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight">
              {t('metrics.edit.title')}
            </CardTitle>
            <CardDescription>{t('metrics.edit.description')}</CardDescription>
          </div>
          <div className="mt-2">
            <span className="text-xl font-semibold">{metric?.name}</span>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('metrics.edit.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('metrics.edit.description')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('metrics.edit.unit')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="domain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('metrics.edit.domain')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('metrics.edit.category')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subcategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('metrics.edit.subcategory')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="mt-8 flex justify-between border-t pt-6">
                <Button variant="outline" onClick={handleCancel} type="button">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={updateMetricMutation.isPending}
                  type="submit"
                >
                  {updateMetricMutation.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
