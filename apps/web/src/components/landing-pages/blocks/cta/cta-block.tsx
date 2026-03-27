'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineEditableText } from '../../editor/inline-editable-text';
import type { CTAContent } from '@1person/workflow/landing-pages/blocks';

interface CTABlockProps {
  content: CTAContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
  onContentChange?: (content: Partial<CTAContent>) => void;
}

export function CTABlock({ content, primaryColor, isEditing, onFieldClick, onContentChange }: CTABlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  const handleTextChange = useCallback(
    (field: keyof CTAContent, value: string) => {
      if (onContentChange) {
        onContentChange({ [field]: value });
      }
    },
    [onContentChange]
  );

  return (
    <section className="py-20 px-4" style={{ backgroundColor: primaryColor }}>
      <div className="container mx-auto max-w-3xl text-center">
        <InlineEditableText
          value={content.title || 'Ready to Get Started?'}
          onChange={(value) => handleTextChange('title', value)}
          isEditing={!!isEditing}
          as="h2"
          className="text-3xl font-bold mb-4 text-white"
          placeholder="Enter title..."
        />
        {(content.description || isEditing) && (
          <InlineEditableText
            value={content.description || ''}
            onChange={(value) => handleTextChange('description', value)}
            isEditing={!!isEditing}
            as="p"
            className="text-white/80 mb-8"
            placeholder="Enter description..."
          />
        )}
        {content.showEmailCapture ? (
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder={content.emailPlaceholder || 'Enter your email'}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
            <Button className="bg-white hover:bg-gray-100" style={{ color: primaryColor }}>
              <InlineEditableText
                value={content.ctaText || 'Subscribe'}
                onChange={(value) => handleTextChange('ctaText', value)}
                isEditing={!!isEditing}
                as="span"
                placeholder="Button text"
              />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {(content.ctaText || isEditing) && (
              <Button
                size="lg"
                className="bg-white hover:bg-gray-100"
                style={{ color: primaryColor }}
                onClick={isEditing ? handleFieldClick(['ctaText']) : undefined}
              >
                <InlineEditableText
                  value={content.ctaText || ''}
                  onChange={(value) => handleTextChange('ctaText', value)}
                  isEditing={!!isEditing}
                  as="span"
                  placeholder="Button text"
                />
              </Button>
            )}
            {(content.ctaSecondaryText || isEditing) && (
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
                onClick={isEditing ? handleFieldClick(['ctaSecondaryText']) : undefined}
              >
                <InlineEditableText
                  value={content.ctaSecondaryText || ''}
                  onChange={(value) => handleTextChange('ctaSecondaryText', value)}
                  isEditing={!!isEditing}
                  as="span"
                  placeholder="Secondary button"
                />
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
