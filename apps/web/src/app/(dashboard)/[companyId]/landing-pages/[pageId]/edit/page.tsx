'use client';

import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useLandingPage } from '@/lib/api/hooks';
import { VisualEditor } from '@/components/landing-pages/editor/visual-editor';

export default function EditLandingPage() {
  const params = useParams();
  const pageId = params.pageId as string;
  const companyId = params.companyId as string;

  const { data: page, isLoading, error } = useLandingPage(pageId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Failed to load page</h2>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'Page not found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <VisualEditor
      page={{
        id: page.id,
        name: page.name,
        slug: page.slug,
        primaryColor: page.primaryColor || '#3b82f6',
        secondaryColor: page.secondaryColor ?? undefined,
        status: page.status,
        sections: page.sections?.map((s: any) => ({
          id: s.id,
          type: s.type,
          content: s.content || {},
          order: s.order,
          isVisible: s.isVisible,
          backgroundColor: s.backgroundColor ?? undefined,
          customStyles: s.customStyles ?? undefined,
        })),
      }}
      companyId={companyId}
    />
  );
}
