'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Image as ImageIcon, Video, Upload, Search, Trash2, Loader2,
  Download, Tag, X, FolderOpen, Sparkles, Camera, Plus, FileImage,
} from 'lucide-react';
import { toast } from 'sonner';
import { TrustBanner } from '@/components/trust-banner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ============================================
// TYPES
// ============================================

interface Asset {
  id: string;
  companyId: string;
  name: string;
  type: 'image' | 'video' | 'icon' | 'logo';
  source: 'upload' | 'stock' | 'ai_generated';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType: string;
  tags: string[];
  campaignId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface StockPhoto {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  description: string;
  photographer: string;
  photographerUrl: string;
  provider: string;
}

// ============================================
// HELPERS
// ============================================

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const sourceLabels: Record<string, string> = {
  upload: 'Uploaded',
  stock: 'Stock',
  ai_generated: 'AI Created',
};

const sourceColors: Record<string, string> = {
  upload: 'bg-blue-100 text-blue-700',
  stock: 'bg-green-100 text-green-700',
  ai_generated: 'bg-purple-100 text-purple-700',
};

const typeIcons: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  icon: FileImage,
  logo: Sparkles,
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function AssetsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [stockQuery, setStockQuery] = useState('');
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [stockResults, setStockResults] = useState<StockPhoto[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('library');

  // Fetch assets
  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['assets-library', companyId, filterType, filterSource, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.set('type', filterType);
      if (filterSource !== 'all') params.set('source', filterSource);
      if (searchQuery) params.set('search', searchQuery);
      const qs = params.toString();
      return api.get<{ data: Asset[] }>(
        `/assets-library/company/${companyId}${qs ? `?${qs}` : ''}`,
        { token: token! }
      );
    },
    enabled: !!token,
  });

  const assets = assetsData?.data || [];

  const invalidateAssets = () => {
    qc.invalidateQueries({ queryKey: ['assets-library'] });
  };

  // ============================================
  // FILE UPLOAD
  // ============================================

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    if (!token) return;
    setIsUploading(true);

    let uploadedCount = 0;
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name.replace(/\.[^/.]+$/, ''));

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/assets-library/company/${companyId}/upload`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          }
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({ message: 'Upload failed' }));
          throw new Error(err.error?.message || err.message || 'Upload failed');
        }

        uploadedCount++;
      } catch (err: any) {
        toast.error(err.message || `Failed to upload ${file.name}`);
      }
    }

    if (uploadedCount > 0) {
      toast.success(
        uploadedCount === 1
          ? 'File uploaded to your library'
          : `${uploadedCount} files uploaded to your library`
      );
      invalidateAssets();
    }

    setIsUploading(false);
    setUploadDialogOpen(false);
  }, [token, companyId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // ============================================
  // STOCK SEARCH
  // ============================================

  const handleStockSearch = async () => {
    if (!token || !stockQuery.trim()) return;
    setIsSearchingStock(true);
    try {
      const res = await api.post<{ data: StockPhoto[] }>(
        `/assets-library/company/${companyId}/search-stock`,
        { query: stockQuery },
        { token }
      );
      setStockResults(res.data || []);
      if (res.data.length === 0) {
        toast.info('No photos found. Try different keywords.');
      }
    } catch {
      toast.error('Could not search photos. Please try again.');
    } finally {
      setIsSearchingStock(false);
    }
  };

  const handleImportStock = async (photo: StockPhoto) => {
    if (!token) return;
    setImportingId(photo.id);
    try {
      await api.post(
        `/assets-library/company/${companyId}/from-url`,
        {
          url: photo.url,
          name: photo.description || 'Stock photo',
          source: 'stock',
          type: 'image',
          width: photo.width,
          height: photo.height,
          tags: ['stock'],
          metadata: {
            stockProvider: photo.provider,
            stockPhotoId: photo.id,
            stockPhotographer: photo.photographer,
            stockPhotographerUrl: photo.photographerUrl,
          },
        },
        { token }
      );
      toast.success('Photo added to your library');
      invalidateAssets();
    } catch {
      toast.error('Could not import this photo. Please try again.');
    } finally {
      setImportingId(null);
    }
  };

  // ============================================
  // DELETE
  // ============================================

  const handleDelete = async (assetId: string) => {
    if (!token) return;
    setDeletingId(assetId);
    try {
      await api.delete(`/assets-library/${assetId}`, { token });
      toast.success('Asset removed from library');
      invalidateAssets();
    } catch {
      toast.error('Could not delete this asset. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Library</h1>
          <p className="text-muted-foreground">
            All your images, videos, and brand assets in one place
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          Upload
        </Button>
      </div>

      <TrustBanner variant="compact" />

      {/* Tabs: Library vs Stock Search */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="library" className="gap-2">
            <FolderOpen className="w-4 h-4" />
            My Library
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-2">
            <Camera className="w-4 h-4" />
            Stock Photos
          </TabsTrigger>
        </TabsList>

        {/* =========== MY LIBRARY TAB =========== */}
        <TabsContent value="library" className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Type filter */}
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All Types' },
                { value: 'image', label: 'Images' },
                { value: 'video', label: 'Videos' },
                { value: 'logo', label: 'Logos' },
                { value: 'icon', label: 'Icons' },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  variant={filterType === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterType(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {/* Source filter */}
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All Sources' },
                { value: 'upload', label: 'Uploaded' },
                { value: 'stock', label: 'Stock' },
                { value: 'ai_generated', label: 'AI' },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  variant={filterSource === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterSource(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Asset Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No assets yet</h3>
                <p className="text-muted-foreground mb-4 max-w-sm">
                  Upload your images, find stock photos, or let AI create visuals for your brand.
                </p>
                <div className="flex gap-3">
                  <Button onClick={() => setUploadDialogOpen(true)} className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Files
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('stock')} className="gap-2">
                    <Camera className="w-4 h-4" />
                    Browse Stock Photos
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {assets.map((asset) => {
                const TypeIcon = typeIcons[asset.type] || ImageIcon;
                return (
                  <Card key={asset.id} className="group overflow-hidden hover:shadow-md transition-shadow">
                    {/* Thumbnail */}
                    <div className="relative aspect-square bg-muted">
                      {asset.type === 'video' ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <Video className="w-12 h-12 text-muted-foreground" />
                        </div>
                      ) : (
                        <img
                          src={asset.thumbnailUrl || asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}

                      {/* Overlay actions */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8"
                          onClick={() => window.open(asset.url, '_blank')}
                          title="View full size"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-8 w-8"
                          onClick={() => handleDelete(asset.id)}
                          disabled={deletingId === asset.id}
                          title="Delete"
                        >
                          {deletingId === asset.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>

                      {/* Source badge */}
                      <div className="absolute top-2 left-2">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${sourceColors[asset.source] || ''}`}
                        >
                          {sourceLabels[asset.source] || asset.source}
                        </Badge>
                      </div>
                    </div>

                    {/* Info */}
                    <CardContent className="p-3">
                      <p className="text-sm font-medium truncate" title={asset.name}>
                        {asset.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <TypeIcon className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground capitalize">{asset.type}</span>
                        {asset.fileSize && (
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(asset.fileSize)}
                          </span>
                        )}
                        {asset.width && asset.height && (
                          <span className="text-xs text-muted-foreground">
                            {asset.width}x{asset.height}
                          </span>
                        )}
                      </div>
                      {asset.tags && asset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {asset.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
                              {tag}
                            </Badge>
                          ))}
                          {asset.tags.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{asset.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* =========== STOCK PHOTOS TAB =========== */}
        <TabsContent value="stock" className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search free stock photos... (e.g. 'office meeting', 'technology')"
                value={stockQuery}
                onChange={(e) => setStockQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStockSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleStockSearch} disabled={isSearchingStock} className="gap-2">
              {isSearchingStock ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search
            </Button>
          </div>

          {stockResults.length === 0 && !isSearchingStock && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Camera className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Find the perfect photo</h3>
                <p className="text-muted-foreground max-w-sm">
                  Search millions of free, high-quality stock photos. Click any photo to add it to your library.
                </p>
              </CardContent>
            </Card>
          )}

          {isSearchingStock && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {stockResults.length > 0 && !isSearchingStock && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {stockResults.map((photo) => (
                <Card
                  key={photo.id}
                  className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleImportStock(photo)}
                >
                  <div className="relative aspect-square bg-muted">
                    <img
                      src={photo.thumbnailUrl}
                      alt={photo.description}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Import overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      {importingId === photo.id ? (
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <Plus className="w-8 h-8 text-white" />
                          <span className="text-white text-xs font-medium">Add to Library</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-3">
                    <p className="text-sm truncate" title={photo.description}>
                      {photo.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      by {photo.photographer}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* =========== UPLOAD DIALOG =========== */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
            <DialogDescription>
              Add images, videos, or brand assets to your library.
            </DialogDescription>
          </DialogHeader>

          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Drag & drop files here</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse your computer
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, GIF, WebP, SVG, MP4 - up to 50MB
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,video/mp4,video/webm,.svg"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files);
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
