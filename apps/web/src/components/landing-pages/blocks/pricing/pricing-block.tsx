'use client';

import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PricingContent } from '@1person/workflow/landing-pages/blocks';

interface PricingBlockProps {
  content: PricingContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
}

export function PricingBlock({
  content,
  primaryColor,
  isEditing,
  onFieldClick,
}: PricingBlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  return (
    <section className="py-16 px-4 bg-gray-50">
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
          {content.plans?.map((plan, i) => (
            <div
              key={i}
              className={`p-6 rounded-lg border ${
                plan.featured ? 'border-2 bg-white shadow-lg' : 'bg-white'
              } ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-pointer' : ''}`}
              style={{ borderColor: plan.featured ? primaryColor : undefined }}
              onClick={handleFieldClick(['plans', String(i)])}
            >
              {plan.badge && (
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                >
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-bold mt-4 text-gray-900">{plan.name}</h3>
              <div className="my-4">
                <span className="text-3xl font-bold" style={{ color: primaryColor }}>
                  {plan.price}
                </span>
                {plan.period && <span className="text-gray-500">{plan.period}</span>}
              </div>
              {plan.description && (
                <p className="text-gray-600 text-sm mb-4">{plan.description}</p>
              )}
              <ul className="space-y-2 mb-6">
                {plan.features?.map((feature, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                style={plan.featured ? { backgroundColor: primaryColor } : undefined}
                variant={plan.featured ? 'default' : 'outline'}
              >
                {plan.ctaText || 'Get Started'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
