'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Undo2,
  Redo2,
  Save,
  Eye,
  Edit,
  Smartphone,
  Tablet,
  Monitor,
  Loader2,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';

interface EditorToolbarProps {
  onSave: () => Promise<void>;
  onBack: () => void;
  onPublish?: () => Promise<void>;
  pageSlug?: string;
  isPublishing?: boolean;
  autoSaveEnabled?: boolean;
  onAutoSaveToggle?: (enabled: boolean) => void;
}

export function EditorToolbar({ onSave, onBack, onPublish, pageSlug, isPublishing, autoSaveEnabled, onAutoSaveToggle }: EditorToolbarProps) {
  const {
    page,
    isDirty,
    isSaving,
    isEditing,
    isPreviewing,
    previewDevice,
    canUndo,
    canRedo,
    undo,
    redo,
    setPreviewing,
    setPreviewDevice,
  } = useEditorStore();

  const handleSave = useCallback(async () => {
    await onSave();
  }, [onSave]);

  const handlePreviewToggle = useCallback(() => {
    setPreviewing(!isPreviewing);
  }, [isPreviewing, setPreviewing]);

  return (
    <div className="sticky top-0 z-50 h-14 border-b bg-background flex items-center justify-between px-4 gap-4">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="h-6 w-px bg-border mx-2" />
        <h1 className="font-semibold text-sm truncate max-w-[200px]">
          {page?.name || 'Untitled Page'}
        </h1>
        {isDirty && autoSaveEnabled && (
          <span className="text-xs text-muted-foreground">(auto-saving...)</span>
        )}
        {isDirty && !autoSaveEnabled && (
          <span className="text-xs text-muted-foreground">(unsaved changes)</span>
        )}
        {!isDirty && (
          <span className="text-xs text-green-600">✓ Saved</span>
        )}
      </div>

      {/* Center section - Device preview */}
      {isPreviewing && (
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              previewDevice === 'desktop' && 'bg-background shadow-sm'
            )}
            onClick={() => setPreviewDevice('desktop')}
          >
            <Monitor className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              previewDevice === 'tablet' && 'bg-background shadow-sm'
            )}
            onClick={() => setPreviewDevice('tablet')}
          >
            <Tablet className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0',
              previewDevice === 'mobile' && 'bg-background shadow-sm'
            )}
            onClick={() => setPreviewDevice('mobile')}
          >
            <Smartphone className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={undo}
            disabled={!canUndo()}
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={redo}
            disabled={!canRedo()}
          >
            <Redo2 className="w-4 h-4" />
          </Button>
        </div>

        <div className="h-6 w-px bg-border mx-1" />

        {/* Preview toggle */}
        <Button
          variant={isPreviewing ? 'default' : 'outline'}
          size="sm"
          onClick={handlePreviewToggle}
        >
          {isPreviewing ? (
            <>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </>
          )}
        </Button>

        {/* Save button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save
        </Button>

        {/* Publish button */}
        {onPublish && (
          <Button size="sm" onClick={onPublish} disabled={isPublishing}>
            {isPublishing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>
        )}
      </div>
    </div>
  );
}
