'use client';

import {
  Shield,
  Smartphone,
  MapPin,
  Calendar,
  CreditCard,
  Headphones,
  Zap,
  Users,
  TrendingUp,
  MessageSquare,
  HelpCircle,
  Sparkles,
  Check,
  Star,
  Heart,
  Globe,
  Lock,
  Clock,
  BarChart,
  Settings,
} from 'lucide-react';
import type { FeaturesContent } from '@1person/workflow/landing-pages/blocks';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'shield-check': Shield,
  shield: Shield,
  smartphone: Smartphone,
  'map-pin': MapPin,
  calendar: Calendar,
  'credit-card': CreditCard,
  headphones: Headphones,
  zap: Zap,
  users: Users,
  'trending-up': TrendingUp,
  message: MessageSquare,
  help: HelpCircle,
  check: Check,
  star: Star,
  heart: Heart,
  globe: Globe,
  lock: Lock,
  clock: Clock,
  chart: BarChart,
  settings: Settings,
};

function getIcon(iconName?: string) {
  if (!iconName) return Sparkles;
  return iconMap[iconName] || Sparkles;
}

interface FeaturesBlockProps {
  content: FeaturesContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
}

export function FeaturesBlock({
  content,
  primaryColor,
  isEditing,
  onFieldClick,
}: FeaturesBlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  const gridCols = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
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
        <div
          className={`grid ${gridCols[(content.columns as keyof typeof gridCols) || 3]} gap-8`}
        >
          {content.features?.map((feature, i) => {
            const Icon = getIcon(feature.icon);
            return (
              <div
                key={i}
                className={`text-center ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-4 cursor-pointer' : ''}`}
                onClick={handleFieldClick(['features', String(i)])}
              >
                <div
                  className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
                  style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
