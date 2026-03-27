'use client';

import { useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { InlineEditableText } from '../../editor/inline-editable-text';
import type { SolutionContent } from '@1person/workflow/landing-pages/blocks';

interface SolutionBlockProps {
  content: SolutionContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
  onContentChange?: (content: Partial<SolutionContent>) => void;
}

export function SolutionBlock({
  content,
  primaryColor,
  isEditing,
  onFieldClick,
  onContentChange,
}: SolutionBlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  const handleTextChange = useCallback(
    (field: keyof SolutionContent, value: string) => {
      if (onContentChange) {
        onContentChange({ [field]: value });
      }
    },
    [onContentChange]
  );

  const handleBenefitChange = useCallback(
    (index: number, field: 'title' | 'description', value: string) => {
      if (onContentChange && content.benefits) {
        const updatedBenefits = [...content.benefits];
        updatedBenefits[index] = { ...updatedBenefits[index], [field]: value };
        onContentChange({ benefits: updatedBenefits });
      }
    },
    [onContentChange, content.benefits]
  );

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-4xl">
        <InlineEditableText
          value={content.title || 'Our Solution'}
          onChange={(value) => handleTextChange('title', value)}
          isEditing={!!isEditing}
          as="h2"
          className="text-3xl font-bold text-center mb-4 text-gray-900"
          placeholder="Enter title..."
        />
        {(content.description || isEditing) && (
          <InlineEditableText
            value={content.description || ''}
            onChange={(value) => handleTextChange('description', value)}
            isEditing={!!isEditing}
            as="p"
            className="text-gray-600 text-center mb-12 max-w-2xl mx-auto"
            placeholder="Enter description..."
          />
        )}
        <div className="grid md:grid-cols-2 gap-6">
          {content.benefits?.map((benefit, i) => (
            <div
              key={i}
              className={`flex gap-4 ${isEditing ? 'ring-1 ring-transparent hover:ring-blue-300 rounded-lg p-2' : ''}`}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
              >
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <InlineEditableText
                  value={benefit.title}
                  onChange={(value) => handleBenefitChange(i, 'title', value)}
                  isEditing={!!isEditing}
                  as="h3"
                  className="font-semibold text-gray-900"
                  placeholder="Benefit title..."
                />
                <InlineEditableText
                  value={benefit.description}
                  onChange={(value) => handleBenefitChange(i, 'description', value)}
                  isEditing={!!isEditing}
                  as="p"
                  className="text-gray-600 text-sm"
                  placeholder="Benefit description..."
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
