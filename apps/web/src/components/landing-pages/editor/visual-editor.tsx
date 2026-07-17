'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useEditorStore } from '@/stores/editor-store';
import { EditorToolbar } from './editor-toolbar';
import { EditorCanvas } from './editor-canvas';
import { EditorSidebar } from './editor-sidebar';
import { useUpdateLandingPageSections } from '@/lib/api/hooks';
import { PublishDialog } from '../publish-dialog';
import type { BlockContent } from '@1person/workflow/landing-pages/blocks';

// Auto-save debounce time in ms
const AUTO_SAVE_DELAY = 2000;

interface Section {
  id: string;
  type: string;
  content: Record<string, unknown>;
  order: number;
  isVisible?: number;
  backgroundColor?: string | null;
  customStyles?: Record<string, string> | null;
}

interface PageData {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor?: string;
  status: string;
  sections?: Section[];
}

interface VisualEditorProps {
  page: PageData;
  companyId: string;
}

export function VisualEditor({ page, companyId }: VisualEditorProps) {
  const router = useRouter();
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedBlocksRef = useRef<string>('');
  const lastFailedAutoSaveRef = useRef<string>('');

  const {
    initialize,
    blocks,
    page: editorPage,
    updatePageSettings,
    markSaved,
    setSaving,
    isDirty,
  } = useEditorStore();

  const { mutateAsync: updateSectionsAsync } = useUpdateLandingPageSections();

  // Initialize editor with page data
  useEffect(() => {
    const editorBlocks = (page.sections || []).map((section) => ({
      id: section.id,
      type: section.type as any,
      content: section.content as BlockContent,
      order: section.order,
      isVisible: section.isVisible !== 0,
      backgroundColor: section.backgroundColor ?? undefined,
      customStyles: section.customStyles ?? undefined,
    }));

    initialize(
      {
        id: page.id,
        name: page.name,
        slug: page.slug,
        primaryColor: page.primaryColor || '#3b82f6',
        secondaryColor: page.secondaryColor,
        status: page.status,
      },
      editorBlocks
    );
  }, [page, initialize]);

  // Handle save
  const handleSave = useCallback(async (silent = false): Promise<boolean> => {
    if (!editorPage) return false;

    const sections = blocks.map((block) => ({
      id: block.id,
      type: block.type,
      content: block.content,
      order: block.order,
      isVisible: block.isVisible ? 1 : 0,
      backgroundColor: block.backgroundColor,
      customStyles: block.customStyles,
    }));

    const pageSettings = {
      primaryColor: editorPage.primaryColor,
      secondaryColor: editorPage.secondaryColor ?? null,
    };

    // Track both section content and page-level appearance.
    const editorJson = JSON.stringify({ sections, pageSettings });
    if (editorJson === lastSavedBlocksRef.current) {
      return true; // No changes to save
    }
    if (silent && editorJson === lastFailedAutoSaveRef.current) {
      return false; // Wait for another edit or an explicit manual retry.
    }

    setSaving(true);
    try {
      await updateSectionsAsync({
        pageId: page.id,
        sections,
        pageSettings,
      });

      lastSavedBlocksRef.current = editorJson;
      lastFailedAutoSaveRef.current = '';
      markSaved();
      if (!silent) {
        toast.success('Changes saved');
      }
      return true;
    } catch (error) {
      console.error('Failed to save:', error);
      lastFailedAutoSaveRef.current = editorJson;
      toast.error(
        silent
          ? 'Autosave failed. Your changes are still in the editor.'
          : 'Failed to save changes',
        { id: 'landing-page-save-error' },
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [editorPage, blocks, page.id, updateSectionsAsync, markSaved, setSaving]);

  // Auto-save effect: save draft when blocks change
  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || !editorPage) return;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer for auto-save
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave(true); // Silent save
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [blocks, isDirty, autoSaveEnabled, editorPage, handleSave]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    router.push(`/${companyId}/landing-pages`);
  }, [companyId, router]);

  // Handle publish — save first, then open the publish dialog
  const handlePublish = useCallback(async () => {
    if (!editorPage) return;
    const saved = await handleSave(true);
    if (!saved) return;
    setPublishDialogOpen(true);
  }, [editorPage, handleSave]);

  // Handle primary color change
  const handlePrimaryColorChange = useCallback(
    (color: string) => {
      updatePageSettings({ primaryColor: color });
    },
    [updatePageSettings]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Cmd/Ctrl + Z to undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().undo();
      }
      // Cmd/Ctrl + Shift + Z to redo
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useEditorStore.getState().redo();
      }
      // Escape to clear selection
      if (e.key === 'Escape') {
        useEditorStore.getState().clearSelection();
      }
      // Delete/Backspace to remove selected block
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused()) {
        const { selectedBlockId, removeBlock } = useEditorStore.getState();
        if (selectedBlockId) {
          e.preventDefault();
          removeBlock(selectedBlockId);
        }
      }
    };

    const isInputFocused = () => {
      const active = document.activeElement;
      return (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.getAttribute('contenteditable') === 'true'
      );
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const primaryColor = editorPage?.primaryColor || '#3b82f6';

  return (
    <div className="h-screen flex flex-col bg-background">
      <EditorToolbar
        onSave={async () => {
          await handleSave(false);
        }}
        onBack={handleBack}
        onPublish={handlePublish}
        pageSlug={page.slug}
        isPublishing={false}
        autoSaveEnabled={autoSaveEnabled}
        onAutoSaveToggle={setAutoSaveEnabled}
      />
      <div className="flex-1 flex overflow-hidden">
        <EditorCanvas primaryColor={primaryColor} />
        <EditorSidebar
          companyId={companyId}
          primaryColor={primaryColor}
          onPrimaryColorChange={handlePrimaryColorChange}
        />
      </div>
      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        pageId={page.id}
        companyId={companyId}
        onPublished={() => {
          toast.success('Page is now live!');
        }}
      />
    </div>
  );
}
