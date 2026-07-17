'use client';

import { useEffect, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ExternalLink, FileText, FolderOpen, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { api } from '@/lib/api/client';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  webUrl?: string;
};

export type DriveSourceSelection = {
  googleDriveUrl?: string;
  googleDriveFileId?: string;
  googleDriveFileName?: string;
  googleDriveFileMimeType?: string;
  oneDriveFileId?: string;
  oneDriveFileName?: string;
  oneDriveFileMimeType?: string;
};

type DriveSourceMode = 'public_link' | 'connected_drive';
type DriveProvider = 'google' | 'onedrive';

export function driveMimeLabel(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Docs';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheets';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('text/')) return 'Text';
  return 'File';
}

export function driveSourceRequestBody(selection: DriveSourceSelection) {
  return {
    ...(selection.googleDriveUrl ? { googleDriveUrl: selection.googleDriveUrl } : {}),
    ...(selection.googleDriveFileId ? {
      googleDriveFileId: selection.googleDriveFileId,
      googleDriveFileName: selection.googleDriveFileName,
    } : {}),
    ...(selection.oneDriveFileId ? {
      oneDriveFileId: selection.oneDriveFileId,
      oneDriveFileName: selection.oneDriveFileName,
    } : {}),
  };
}

export function hasDriveSource(selection: DriveSourceSelection) {
  return Boolean(selection.googleDriveUrl || selection.googleDriveFileId || selection.oneDriveFileId);
}

export function DriveSourcePicker({
  companyId,
  token,
  value,
  onChange,
  label = 'Source content (optional)',
  description = 'Add a Google Drive or OneDrive file when the AI should use source material from your documents.',
}: {
  companyId: string;
  token: string | null;
  value: DriveSourceSelection;
  onChange: (next: DriveSourceSelection) => void;
  label?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [driveProvider, setDriveProvider] = useState<DriveProvider>('google');
  const [driveSourceMode, setDriveSourceMode] = useState<DriveSourceMode>('public_link');
  const [googleDriveUrlInput, setGoogleDriveUrlInput] = useState(value.googleDriveUrl ?? '');
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveSearch, setDriveSearch] = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [oneDriveFiles, setOneDriveFiles] = useState<DriveFile[]>([]);
  const [oneDriveSearch, setOneDriveSearch] = useState('');
  const [oneDriveLoading, setOneDriveLoading] = useState(false);
  const [oneDriveError, setOneDriveError] = useState<string | null>(null);

  useEffect(() => {
    setGoogleDriveUrlInput(value.googleDriveUrl ?? '');
  }, [value.googleDriveUrl]);

  const loadDriveFiles = async (query = driveSearch) => {
    if (!token) return;
    setDriveLoading(true);
    setDriveError(null);
    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await api.get<{ files: DriveFile[] }>(`/integrations/google_drive/company/${companyId}/files${suffix}`, { token });
      setDriveFiles(res.files || []);
    } catch (e) {
      const message = (e as Error).message || 'Connect Google Drive in Settings first';
      setDriveError(message);
      toast.error(message);
      setDriveFiles([]);
    } finally {
      setDriveLoading(false);
    }
  };

  const loadOneDriveFiles = async (query = oneDriveSearch) => {
    if (!token) return;
    setOneDriveLoading(true);
    setOneDriveError(null);
    try {
      const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await api.get<{ files: DriveFile[] }>(`/integrations/onedrive/company/${companyId}/files${suffix}`, { token });
      setOneDriveFiles(res.files || []);
    } catch (e) {
      const message = (e as Error).message || 'Connect OneDrive in Settings first';
      setOneDriveError(message);
      toast.error(message);
      setOneDriveFiles([]);
    } finally {
      setOneDriveLoading(false);
    }
  };

  const clearGoogle = () => {
    onChange({
      ...value,
      googleDriveUrl: undefined,
      googleDriveFileId: undefined,
      googleDriveFileName: undefined,
      googleDriveFileMimeType: undefined,
    });
    setGoogleDriveUrlInput('');
  };

  const clearOneDrive = () => {
    onChange({
      ...value,
      oneDriveFileId: undefined,
      oneDriveFileName: undefined,
      oneDriveFileMimeType: undefined,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setOpen(true)}
        >
          <FolderOpen className="w-4 h-4" />
          Add content from Drive
        </Button>
      </div>
      <div className="space-y-2">
        {value.googleDriveUrl && (
          <SelectedSourceCard
            icon={<ExternalLink className="w-4 h-4 text-primary shrink-0" />}
            title="Google Drive public link"
            subtitle={value.googleDriveUrl}
            onRemove={clearGoogle}
            removeLabel="Remove Google Drive link"
          />
        )}
        {value.googleDriveFileId && (
          <SelectedSourceCard
            icon={<FileText className="w-4 h-4 text-primary shrink-0" />}
            title={value.googleDriveFileName || 'Google Drive file'}
            subtitle={`Google Drive - ${driveMimeLabel(value.googleDriveFileMimeType || '')}`}
            onRemove={clearGoogle}
            removeLabel="Remove Google Drive file"
          />
        )}
        {value.oneDriveFileId && (
          <SelectedSourceCard
            icon={<FileText className="w-4 h-4 text-primary shrink-0" />}
            title={value.oneDriveFileName || 'OneDrive file'}
            subtitle={`OneDrive - ${driveMimeLabel(value.oneDriveFileMimeType || '')}`}
            onRemove={clearOneDrive}
            removeLabel="Remove OneDrive file"
          />
        )}
        {!hasDriveSource(value) && (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add content from Drive</DialogTitle>
            <DialogDescription>
              Add source context from Google Drive or OneDrive before generating AI content.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'google' as const, label: 'Google Drive' },
              { key: 'onedrive' as const, label: 'OneDrive' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setDriveProvider(option.key);
                  if (option.key === 'google' && driveSourceMode === 'connected_drive') {
                    setDriveError(null);
                    void loadDriveFiles('');
                  }
                  if (option.key === 'onedrive') {
                    setOneDriveError(null);
                    void loadOneDriveFiles('');
                  }
                }}
                className={`rounded-lg border p-2.5 text-sm font-medium transition-colors ${
                  driveProvider === option.key ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {driveProvider === 'google' && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <SourceModeButton
                  active={driveSourceMode === 'public_link'}
                  icon={<ExternalLink className="w-4 h-4 text-primary" />}
                  label="Public file link"
                  description="Use files shared as anyone with the link can view."
                  onClick={() => setDriveSourceMode('public_link')}
                />
                <SourceModeButton
                  active={driveSourceMode === 'connected_drive'}
                  icon={<FolderOpen className="w-4 h-4 text-primary" />}
                  label="Connected Drive"
                  description="Choose private files after connecting Google Drive."
                  onClick={() => {
                    setDriveSourceMode('connected_drive');
                    setDriveError(null);
                    void loadDriveFiles('');
                  }}
                />
              </div>

              {driveSourceMode === 'public_link' ? (
                <div className="space-y-2">
                  <Input
                    value={googleDriveUrlInput}
                    onChange={(e) => setGoogleDriveUrlInput(e.target.value)}
                    placeholder="Paste a Google Docs, Sheets, Slides, PDF, or text file link"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onChange({
                        ...value,
                        googleDriveUrl: googleDriveUrlInput.trim() || undefined,
                        googleDriveFileId: undefined,
                        googleDriveFileName: undefined,
                        googleDriveFileMimeType: undefined,
                      });
                      setOpen(false);
                    }}
                  >
                    Use this link
                  </Button>
                </div>
              ) : (
                <FileList
                  provider="Google Drive"
                  companyId={companyId}
                  search={driveSearch}
                  onSearchChange={setDriveSearch}
                  onSearch={() => loadDriveFiles()}
                  loading={driveLoading}
                  error={driveError}
                  files={driveFiles}
                  onSelect={(file) => {
                    onChange({
                      ...value,
                      googleDriveUrl: undefined,
                      googleDriveFileId: file.id,
                      googleDriveFileName: file.name,
                      googleDriveFileMimeType: file.mimeType,
                    });
                    setGoogleDriveUrlInput('');
                    setOpen(false);
                  }}
                />
              )}
            </div>
          )}

          {driveProvider === 'onedrive' && (
            <FileList
              provider="OneDrive"
              companyId={companyId}
              search={oneDriveSearch}
              onSearchChange={setOneDriveSearch}
              onSearch={() => loadOneDriveFiles()}
              loading={oneDriveLoading}
              error={oneDriveError}
              files={oneDriveFiles}
              onSelect={(file) => {
                onChange({
                  ...value,
                  oneDriveFileId: file.id,
                  oneDriveFileName: file.name,
                  oneDriveFileMimeType: file.mimeType,
                });
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectedSourceCard({
  icon,
  title,
  subtitle,
  onRemove,
  removeLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
      <div className="min-w-0 flex items-center gap-2">
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
      </div>
      <Button size="icon" variant="ghost" onClick={onRemove} aria-label={removeLabel}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

function SourceModeButton({
  active,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${
        active ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </button>
  );
}

function FileList({
  provider,
  companyId,
  search,
  onSearchChange,
  onSearch,
  loading,
  error,
  files,
  onSelect,
}: {
  provider: 'Google Drive' | 'OneDrive';
  companyId: string;
  search: string;
  onSearchChange: (next: string) => void;
  onSearch: () => void;
  loading: boolean;
  error: string | null;
  files: DriveFile[];
  onSelect: (file: DriveFile) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch();
          }}
          placeholder={`Search ${provider} files`}
        />
        <Button type="button" variant="outline" onClick={onSearch} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </Button>
      </div>

      <ScrollArea className="h-72 rounded-md border">
        <div className="divide-y">
          {loading && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
              Loading files...
            </div>
          )}
          {!loading && error && (
            <div className="p-6 text-center">
              <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto mb-2" />
              <p className="text-sm font-medium">{provider} is not connected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect {provider} in Settings &gt; Integrations, then return here to choose private files.
              </p>
              <Link href={`/${companyId}/settings?tab=integrations`}>
                <Button type="button" size="sm" className="mt-3 gap-2">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Settings
                </Button>
              </Link>
            </div>
          )}
          {!loading && !error && files.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No files found. Try another search.
            </div>
          )}
          {!loading && files.map((file) => (
            <button
              key={file.id}
              type="button"
              className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
              onClick={() => onSelect(file)}
            >
              <div className="min-w-0 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {driveMimeLabel(file.mimeType)}
                    {file.modifiedTime ? ` - ${new Date(file.modifiedTime).toLocaleDateString()}` : ''}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Select
              </Badge>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
