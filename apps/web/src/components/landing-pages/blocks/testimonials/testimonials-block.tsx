'use client';

import { Star } from 'lucide-react';
import type { TestimonialsContent } from '@1person/workflow/landing-pages/blocks';

interface TestimonialsBlockProps {
  content: TestimonialsContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
}

export function TestimonialsBlock({
  content,
  primaryColor,
  isEditing,
  onFieldClick,
}: TestimonialsBlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-5xl">
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
            className={`text-gray-600 text-center mb-12 max-w-2xl mx-auto ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-text' : ''}`}
            onClick={handleFieldClick(['subtitle'])}
          >
            {content.subtitle}
          </p>
        )}
        <div className="grid md:grid-cols-3 gap-6">
          {content.testimonials?.map((testimonial, i) => (
            <div
              key={i}
              className={`p-6 bg-gray-50 rounded-lg ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-pointer' : ''}`}
              onClick={handleFieldClick(['testimonials', String(i)])}
            >
              {testimonial.rating && (
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: testimonial.rating }).map((_, j) => (
                    <Star
                      key={j}
                      className="w-4 h-4 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                </div>
              )}
              <p className="text-gray-600 italic mb-4">"{testimonial.quote}"</p>
              <div className="flex items-center gap-3">
                {testimonial.avatar ? (
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {testimonial.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">
                    {testimonial.role}
                    {testimonial.company && `, ${testimonial.company}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
