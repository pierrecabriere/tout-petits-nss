'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import supabaseClient from '@/lib/supabase-client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Upload,
  FileUp,
  History,
  FileText,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  Eye,
  RefreshCw,
  AlertTriangle,
  FileJson,
} from 'lucide-react';
import { Tables } from '@/types/database';

// Type for upload progress event
interface UploadProgressEvent {
  loaded: number;
  total: number;
}

// Define a type for the metadata JSONB column
export type FileMetadata = {
  size?: number;
  type?: string;
  extension?: string;
  processing_status?: 'success' | 'error' | 'pending' | string;
  error_message?: string;
  row_count?: number;
  column_count?: number;
  json_path?: string;
  [key: string]: unknown;
};

// Type guard for FileMetadata
function isFileMetadata(meta: unknown): meta is FileMetadata {
  return !!meta && typeof meta === 'object' && !Array.isArray(meta);
}

// Update FileWithDetails to use FileMetadata
type FileWithDetails = Tables<'files'> & {
  category: Tables<'categories'> | null;
  source: Tables<'sources'> | null;
  tags: { name: string }[];
  metadata?: FileMetadata; // override for local use
};

export default function ImportPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFileData, setSelectedFileData] = useState<any[] | null>(null);
  const [viewingFile, setViewingFile] = useState<FileWithDetails | null>(null);

  // Fetch upload history
  const {
    data: filesHistory,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['files-history'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('files')
        .select(
          `
          *,
          category:category_id (name),
          source:source_id (name),
          tags:file_tags(
            tag:tag_id (name)
          )
        `
        )
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match the FileWithDetails type
      return (data || []).map(file => {
        // Ensure metadata is an object (FileMetadata) if possible
        let metadata: FileMetadata | undefined = undefined;
        if (file.metadata && typeof file.metadata === 'object' && !Array.isArray(file.metadata)) {
          metadata = file.metadata as FileMetadata;
        }
        // Fix category and source: Supabase returns null, object, or array (if join fails or ambiguous)
        let category = null;
        if (file.category && typeof file.category === 'object' && 'name' in file.category) {
          category = file.category;
        }
        let source = null;
        if (file.source && typeof file.source === 'object' && 'name' in file.source) {
          source = file.source;
        }
        return {
          ...file,
          category,
          source,
          tags: (file.tags || []).map((tag: any) => ({ name: tag.tag?.name || 'Unknown' })),
          metadata,
        } as FileWithDetails;
      });
    },
    // Refetch every 5 seconds to update processing status
    refetchInterval: 5000,
  });

  // Upload file mutation
  const { mutate: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: async (file: File) => {
      if (!file) return;

      // Create a new entry in the files table first
      const fileName = file.name;
      const fileExt = fileName.split('.').pop();
      const filePath = `imports/${Date.now()}_${fileName}`;

      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('metrics-import')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Insert record into files table
      const { data: fileRecord, error: fileError } = await supabaseClient
        .from('files')
        .insert({
          filename: fileName,
          path: filePath,
          uploaded_at: new Date().toISOString(),
          processing_status: 'pending',
          metadata: {
            size: file.size,
            type: file.type,
            extension: fileExt,
          },
        })
        .select()
        .single();

      if (fileError) throw fileError;

      return fileRecord;
    },
    onSuccess: () => {
      toast({
        title: t('import.success.title'),
        description: t('import.success.description'),
      });
      setSelectedFile(null);
      setUploadProgress(0);
      refetchHistory();
    },
    onError: error => {
      console.error('Upload error:', error);
      toast({
        title: t('import.error.title'),
        description: t('import.error.description'),
        variant: 'destructive',
      });
    },
  });

  // File data fetch mutation
  const { mutate: fetchFileData, isPending: isLoadingFileData } = useMutation({
    mutationFn: async (file: FileWithDetails) => {
      if (
        file.processing_status !== 'completed' ||
        !file.metadata ||
        typeof file.metadata !== 'object' ||
        !('json_path' in file.metadata)
      ) {
        throw new Error('No JSON data available for this file');
      }

      const jsonPath = file.metadata.json_path as string;

      // Download JSON file from storage
      const { data, error } = await supabaseClient.storage
        .from('metrics-import')
        .download(jsonPath);

      if (error) throw error;

      // Parse JSON data
      const text = await data.text();
      return JSON.parse(text);
    },
    onSuccess: (data, file) => {
      setSelectedFileData(data);
      setViewingFile(file);
    },
    onError: error => {
      console.error('Error fetching file data:', error);
      toast({
        title: t('import.data.error.title'),
        description: t('import.data.error.description'),
        variant: 'destructive',
      });
    },
  });

  // Manually trigger file processing
  const { mutate: reprocessFile, isPending: isReprocessing } = useMutation({
    mutationFn: async (file: FileWithDetails) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-spreadsheet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            fileId: file.id,
            filePath: file.path,
            fileName: file.filename,
            metadata: file.metadata,
            processing_status: 'processing',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error reprocessing file');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('import.reprocess.success.title'),
        description: t('import.reprocess.success.description'),
      });
      refetchHistory();
    },
    onError: error => {
      console.error('Reprocess error:', error);
      toast({
        title: t('import.reprocess.error.title'),
        description: t('import.reprocess.error.description'),
        variant: 'destructive',
      });
    },
  });

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle file upload
  const handleUpload = () => {
    if (selectedFile) {
      uploadFile(selectedFile);
    }
  };

  // Format date based on current locale
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'PPp', {
      locale: locale === 'fr' ? fr : undefined,
    });
  };

  // File size formatter
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
  };

  // Get processing status badge
  const getStatusBadge = (file: FileWithDetails) => {
    const status = file.processing_status;

    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Processed</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'processing':
      case 'pending':
        return (
          <Badge
            variant="outline"
            className="flex items-center gap-1.5 bg-yellow-100 text-yellow-800"
          >
            <RefreshCw className="h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      default:
        return <Badge variant="outline">Not processed</Badge>;
    }
  };

  // Close the JSON data view
  const handleCloseDataView = () => {
    setSelectedFileData(null);
    setViewingFile(null);
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 border-b pb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('import.title')}</h1>
        <p className="text-base text-muted-foreground">{t('import.description')}</p>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            {t('import.tabs.upload')}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('import.tabs.history')}
          </TabsTrigger>
          {selectedFileData && (
            <TabsTrigger value="data" className="flex items-center gap-2">
              <FileJson className="h-4 w-4" />
              {t('import.tabs.data')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('import.upload.title')}</CardTitle>
              <CardDescription>{t('import.upload.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="file-upload" className="text-sm font-medium">
                    {t('import.upload.selectFile')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".csv,.xls,.xlsx,.json"
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />
                    <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
                      {isUploading ? (
                        <>
                          <Upload className="mr-2 h-4 w-4 animate-spin" />
                          {t('import.upload.uploading')} ({uploadProgress}%)
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          {t('import.upload.button')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {selectedFile && (
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{selectedFile.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(selectedFile.size)} •{' '}
                            {selectedFile.type || 'Unknown type'}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedFile(null)}
                        disabled={isUploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('import.history.title')}</CardTitle>
              <CardDescription>{t('import.history.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : filesHistory && filesHistory.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('import.history.columns.filename')}</TableHead>
                        <TableHead>{t('import.history.columns.uploadDate')}</TableHead>
                        <TableHead>{t('import.history.columns.size')}</TableHead>
                        <TableHead>{t('import.history.columns.status')}</TableHead>
                        <TableHead className="text-right">
                          {t('import.history.columns.actions')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filesHistory.map(file => (
                        <TableRow key={file.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              {file.filename}
                            </div>
                            {file.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {file.tags.map((tag, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {tag.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(file.uploaded_at)}</TableCell>
                          <TableCell>
                            {file.metadata &&
                            typeof file.metadata === 'object' &&
                            'size' in file.metadata
                              ? formatFileSize(file.metadata.size as number)
                              : 'Unknown'}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(file)}
                            {file.processing_status === 'error' &&
                              isFileMetadata(file.metadata) &&
                              file.metadata.error_message && (
                                <div className="mt-1 flex items-center text-xs text-red-600">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  {file.metadata.error_message}
                                </div>
                              )}
                            {isFileMetadata(file.metadata) &&
                              typeof file.metadata.row_count === 'number' &&
                              typeof file.metadata.column_count === 'number' && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {file.metadata.row_count} rows, {file.metadata.column_count}{' '}
                                  columns
                                </div>
                              )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  const { data } = await supabaseClient.storage
                                    .from('metrics-import')
                                    .getPublicUrl(file.path);

                                  // Create an anchor element and trigger download
                                  const a = document.createElement('a');
                                  a.href = data.publicUrl;
                                  a.download = file.filename;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                }}
                                title={t('import.history.download')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>

                              {file.processing_status === 'completed' &&
                                isFileMetadata(file.metadata) &&
                                file.metadata.json_path && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => fetchFileData(file)}
                                    title={t('import.history.viewData')}
                                    disabled={isLoadingFileData}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}

                              {(file.processing_status === 'error' || !file.processing_status) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => reprocessFile(file)}
                                  title={t('import.history.reprocess')}
                                  disabled={isReprocessing}
                                >
                                  <RefreshCw
                                    className={`h-4 w-4 ${isReprocessing ? 'animate-spin' : ''}`}
                                  />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-10">
                  <History className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">{t('import.history.noFiles')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {selectedFileData && (
          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{viewingFile?.filename || 'File Data'}</CardTitle>
                  <CardDescription>
                    {viewingFile?.metadata &&
                    typeof viewingFile.metadata === 'object' &&
                    'row_count' in viewingFile.metadata
                      ? `${viewingFile.metadata.row_count} rows, ${viewingFile.metadata.column_count} columns`
                      : 'Processed data'}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleCloseDataView}>
                  <X className="mr-2 h-4 w-4" />
                  {t('import.data.close')}
                </Button>
              </CardHeader>
              <CardContent>
                {selectedFileData && selectedFileData.length > 0 ? (
                  <div className="max-h-[500px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(selectedFileData[0]).map(header => (
                            <TableHead key={header}>{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedFileData.map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            {Object.entries(row).map(([key, value], cellIndex) => (
                              <TableCell key={`${rowIndex}-${cellIndex}`}>
                                {value !== null && value !== undefined ? String(value) : ''}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border bg-background py-10">
                    <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">{t('import.data.noData')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
