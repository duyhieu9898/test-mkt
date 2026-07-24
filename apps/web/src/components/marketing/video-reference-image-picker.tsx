'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FolderOpen, ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { uploadImageAsset } from '@/lib/assets-library';
import {
  DriveSourcePicker,
  type DriveFile,
  type DriveSourceSelection,
} from './drive-source-picker';

export type VideoReferenceImageSelection =
  | { type: 'none' }
  | { type: 'asset'; assetId: string; name: string; url: string; mimeType?: string }
  | { type: 'google_drive'; fileId: string; fileName?: string; mimeType?: string }
  | { type: 'onedrive'; fileId: string; fileName?: string; mimeType?: string };

type VideoReferenceImagePayload = {
  type: 'asset' | 'google_drive' | 'onedrive';
  assetId?: string;
  fileId?: string;
  fileName?: string;
};

export function videoReferenceImageRequestBody(
  selection: VideoReferenceImageSelection | null | undefined,
): { referenceImage?: VideoReferenceImagePayload } {
  if (!selection || selection.type === 'none') return {};
  if (selection.type === 'asset') {
    return { referenceImage: { type: 'asset', assetId: selection.assetId } };
  }
  if (selection.type === 'google_drive') {
    return { referenceImage: { type: 'google_drive', fileId: selection.fileId, fileName: selection.fileName } };
  }
  return { referenceImage: { type: 'onedrive', fileId: selection.fileId, fileName: selection.fileName } };
}

export function videoReferenceImageLaunchRequestBody(
  selection: VideoReferenceImageSelection | null | undefined,
): { videoReferenceImage?: VideoReferenceImagePayload } {
  const body = videoReferenceImageRequestBody(selection);
  return body.referenceImage ? { videoReferenceImage: body.referenceImage } : {};
}

function isSupportedVideoReferenceImage(file: DriveFile) {
  const mimeType = file.mimeType?.split(';')[0]?.trim().toLowerCase();
  if (mimeType) return mimeType === 'image/jpeg' || mimeType === 'image/png';
  return /\.(jpe?g|jpe|jfif|png)$/i.test(file.name);
}

function driveSelectionFromVideo(value: VideoReferenceImageSelection): DriveSourceSelection {
  if (value.type === 'google_drive') {
    return {
      googleDriveFileId: value.fileId,
      googleDriveFileName: value.fileName,
      googleDriveFileMimeType: value.mimeType,
    };
  }
  if (value.type === 'onedrive') {
    return {
      oneDriveFileId: value.fileId,
      oneDriveFileName: value.fileName,
      oneDriveFileMimeType: value.mimeType,
    };
  }
  return {};
}

function videoSelectionFromDrive(selection: DriveSourceSelection): VideoReferenceImageSelection {
  if (selection.googleDriveFileId) {
    return {
      type: 'google_drive',
      fileId: selection.googleDriveFileId,
      fileName: selection.googleDriveFileName,
      mimeType: selection.googleDriveFileMimeType,
    };
  }
  if (selection.oneDriveFileId) {
    return {
      type: 'onedrive',
      fileId: selection.oneDriveFileId,
      fileName: selection.oneDriveFileName,
      mimeType: selection.oneDriveFileMimeType,
    };
  }
  return { type: 'none' };
}

function selectedImageLabel(value: VideoReferenceImageSelection) {
  if (value.type === 'asset') return value.name || 'Uploaded image';
  if (value.type === 'google_drive') return value.fileName || 'Google Drive image';
  if (value.type === 'onedrive') return value.fileName || 'OneDrive image';
  return '';
}

export function VideoReferenceImagePicker({
  companyId,
  campaignId,
  token,
  value,
  onChange,
  disabled,
}: {
  companyId: string;
  campaignId?: string;
  token: string | null;
  value: VideoReferenceImageSelection;
  onChange: (value: VideoReferenceImageSelection) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadReferenceImage = async (file: File | undefined) => {
    if (!file || !token) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const looksSupported = ['jpg', 'jpeg', 'jpe', 'jfif', 'png'].includes(ext || '');
    if (!['image/jpeg', 'image/png'].includes(file.type) && !looksSupported) {
      toast.error('Use a JPG or PNG image for video. Other formats may be rejected by the video model.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Use an image under 10MB.');
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadImageAsset(companyId, file, token, {
        campaignId,
        tags: ['campaign-video', 'reference-image'],
      });
      onChange({
        type: 'asset',
        assetId: asset.id,
        name: asset.name || file.name,
        url: asset.url,
      });
      toast.success('Video reference image uploaded');
    } catch (error) {
      toast.error((error as Error).message || 'Could not upload this image.');
    } finally {
      setUploading(false);
    }
  };

  const hasSelection = value.type !== 'none';

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="flex items-center gap-1.5">
            <ImagePlus className="h-4 w-4 text-indigo-500" />
            Visual source for video
          </Label>
          <p className="mt-1 text-xs text-slate-500">
            Optional. Use one image as the first frame/reference, or let AI create the video from the campaign idea.
          </p>
        </div>
        {hasSelection && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-slate-500 hover:text-rose-600"
            disabled={disabled || uploading}
            onClick={() => onChange({ type: 'none' })}
            aria-label="Remove video reference image"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {value.type === 'asset' && (
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
          <div className="relative h-14 w-20 overflow-hidden rounded-md bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.url} alt={value.name} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Uploaded image selected
            </div>
            <p className="truncate text-xs text-slate-500">{value.name}</p>
          </div>
        </div>
      )}

      {(value.type === 'google_drive' || value.type === 'onedrive') && (
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <FolderOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {value.type === 'google_drive' ? 'Google Drive image selected' : 'OneDrive image selected'}
            </div>
            <p className="truncate text-xs text-slate-500">{selectedImageLabel(value)}</p>
          </div>
        </div>
      )}

      {!hasSelection && (
        <div className="rounded-lg bg-indigo-50/60 p-2 text-xs text-indigo-800">
          AI will create the video from campaign data if no image is selected.
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? 'Uploading...' : 'Upload image'}
        </Button>
        <DriveSourcePicker
          companyId={companyId}
          token={token}
          value={driveSelectionFromVideo(value)}
          onChange={(next) => onChange(videoSelectionFromDrive(next))}
          label=""
          description=""
          buttonLabel="Choose from Drive"
          dialogTitle="Choose image from Drive"
          dialogDescription="Select one JPG or PNG image from Google Drive or OneDrive to guide the AI video."
          allowPublicLink={false}
          fileFilter={isSupportedVideoReferenceImage}
          googlePickerMimeTypes="image/png,image/jpeg"
          className="h-full"
          buttonClassName="h-10 w-full justify-center"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          void uploadReferenceImage(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
