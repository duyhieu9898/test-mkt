'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Link2, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api/client';
import { uploadImageAsset, type ImageAsset } from '@/lib/assets-library';
import { useAuthStore } from '@/stores/auth-store';

interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSelect: (asset: Pick<ImageAsset, 'url' | 'name'>) => void;
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  companyId,
  onSelect,
}: MediaPickerDialogProps) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [url, setUrl] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['assets-library', companyId, 'image-picker'],
    queryFn: () =>
      api.get<{ data: ImageAsset[] }>(
        `/assets-library/company/${companyId}?type=image`,
        { token: token! },
      ),
    enabled: open && Boolean(token),
  });

  const selectAsset = (asset: Pick<ImageAsset, 'url' | 'name'>) => {
    onSelect(asset);
    onOpenChange(false);
  };

  const handleUpload = async (file?: File) => {
    if (!file || !token) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }

    setIsUploading(true);
    try {
      const asset = await uploadImageAsset(companyId, file, token);
      await queryClient.invalidateQueries({ queryKey: ['assets-library', companyId] });
      selectAsset(asset);
      toast.success('Image uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Image upload failed');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleUrl = () => {
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      selectAsset({ url: parsed.toString(), name: 'External image' });
      setUrl('');
    } catch {
      toast.error('Enter a valid public image URL');
    }
  };

  const assets = data?.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] w-[min(92vw,760px)] max-w-none flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>
            Reuse a company image, upload a new one, or add a public URL.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="library" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="url">Image URL</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="min-h-0 flex-1">
            <ScrollArea className="h-[52vh] pr-3">
              {isLoading ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading images
                </div>
              ) : assets.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => selectAsset(asset)}
                      className="group overflow-hidden rounded-md border bg-background text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="aspect-video bg-muted">
                        <img
                          src={asset.thumbnailUrl || asset.url}
                          alt={asset.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="truncate px-2 py-2 text-xs font-medium">{asset.name}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center text-center text-muted-foreground">
                  <ImageIcon className="mb-3 h-8 w-8" />
                  <p className="text-sm">No company images yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload first image
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-56 w-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 p-8 text-center hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? (
                <Loader2 className="mb-3 h-8 w-8 animate-spin" />
              ) : (
                <Upload className="mb-3 h-8 w-8" />
              )}
              <span className="font-medium">
                {isUploading ? 'Uploading image...' : 'Choose an image from your device'}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                JPG, PNG or WebP
              </span>
            </button>
          </TabsContent>

          <TabsContent value="url" className="mt-4 space-y-3">
            <Label htmlFor="landing-image-url">Public image URL</Label>
            <div className="flex gap-2">
              <Input
                id="landing-image-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/photo.jpg"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleUrl();
                }}
              />
              <Button onClick={handleUrl} disabled={!url.trim()}>
                <Link2 className="mr-2 h-4 w-4" />
                Use
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleUpload(event.target.files?.[0])}
        />
      </DialogContent>
    </Dialog>
  );
}
