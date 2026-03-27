'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FAQContent } from '@1person/workflow/landing-pages/blocks';

interface FAQBlockProps {
  content: FAQContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
}

export function FAQBlock({ content, primaryColor, isEditing, onFieldClick }: FAQBlockProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  const toggleQuestion = (index: number) => {
    if (!isEditing) {
      setOpenIndex(openIndex === index ? null : index);
    }
  };

  if (content.layout === 'simple') {
    return (
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          {content.title && (
            <h2
              className={`text-3xl font-bold text-center mb-12 text-gray-900 ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-text' : ''}`}
              onClick={handleFieldClick(['title'])}
            >
              {content.title}
            </h2>
          )}
          <div className="space-y-6">
            {content.questions?.map((faq, i) => (
              <div
                key={i}
                className={`${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-pointer' : ''}`}
                onClick={handleFieldClick(['questions', String(i)])}
              >
                <h3 className="font-semibold text-gray-900 mb-2">{faq.question}</h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-3xl">
        {content.title && (
          <h2
            className={`text-3xl font-bold text-center mb-4 text-gray-900 ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-text' : ''}`}
            onClick={handleFieldClick(['title'])}
          >
            {content.title}
          </h2>
        )}
        {content.subtitle && (
          <p
            className={`text-gray-600 text-center mb-12 ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-text' : ''}`}
            onClick={handleFieldClick(['subtitle'])}
          >
            {content.subtitle}
          </p>
        )}
        <div className="space-y-4">
          {content.questions?.map((faq, i) => (
            <div
              key={i}
              className={`border rounded-lg overflow-hidden ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2' : ''}`}
            >
              <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                onClick={() => {
                  if (isEditing && onFieldClick) {
                    onFieldClick(['questions', String(i)]);
                  } else {
                    toggleQuestion(i);
                  }
                }}
              >
                <span className="font-semibold text-gray-900">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
                />
              </button>
              {openIndex === i && (
                <div className="px-4 pb-4">
                  <p className="text-gray-600">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
